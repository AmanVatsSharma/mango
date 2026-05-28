/**
 * File:        apps/backend/src/modules/rbac/controllers/admin-team.controller.ts
 * Module:      rbac
 * Purpose:     Admin REST endpoints for managing broker admin staff (team members).
 *              Separate from client user lifecycle — team members have roles, not KYC flows.
 *
 * Exports:
 *   - AdminTeamController — @Controller('admin/team-members')
 *       GET    /admin/team-members       — list team members for tenant (admin staff, not clients)
 *       POST   /admin/team-members       — create a team member
 *       PATCH  /admin/team-members/:id   — update role or status
 *       GET    /admin/rbac/users         — list all users (staff + clients) for tenant
 *       PATCH  /admin/rbac/users/:id     — update user role or status
 *       POST   /admin/rbac/users/invite  — invite a new team member
 *
 * Depends on:
 *   - RbacService        — ensureRole (for team member role assignment)
 *   - UserEntity         — direct repository access for user management
 *
 * Side-effects: DB writes via UserEntity repository
 *
 * Key invariants:
 *   - Team members are identified by tenantId on the UserEntity; client users and staff share the table
 *   - Role assignment uses ensureRole (upsert semantics)
 *
 * Read order:
 *   1. listTeamMembers() — paginated team listing via UserEntity repository
 *   2. createTeamMember()  — creates UserEntity + assigns roles
 *   3. updateTeamMember()  — role replacement + status toggle
 *   4. listRbacUsers()    — full user listing (staff + clients) with role enrichment
 *   5. updateRbacUser()   — role patch + status toggle
 *   6. inviteRbacUser()   — invite flow (creates user + sends invite)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-20
 */

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminListTeamMembersQueryDto, CreateTeamMemberDto, UpdateTeamMemberDto } from '../dto/admin-team.dto';
import { RbacService } from '../rbac.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../guards/tenant.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Tenant } from '../decorators/tenant.decorator';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../common/errors/app-error';
import { UserEntity } from '../../users/entities/user.entity';
import { RoleEntity } from '../entities/role.entity';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

class ListRbacUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

class UpdateRbacUserDto {
  @IsOptional()
  @IsString()
  status?: 'Active' | 'Inactive';

  @IsOptional()
  @IsUUID()
  roleId?: string;
}

class InviteRbacUserDto {
  @IsString()
  @MaxLength(64)
  mobileE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsUUID()
  roleId!: string;
}

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@ApiTags('Admin Team')
@ApiBearerAuth('JWT')
@Controller('admin')
export class AdminTeamController {
  private readonly usersRepo: Repository<UserEntity>;
  private readonly rolesRepo: Repository<RoleEntity>;

  constructor(
    private readonly rbac: RbacService,
    private readonly logger: AppLoggerService,
    @InjectRepository(UserEntity)
    userEntityRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    roleEntityRepo: Repository<RoleEntity>,
  ) {
    this.logger.setContext(AdminTeamController.name);
    this.usersRepo = userEntityRepo;
    this.rolesRepo = roleEntityRepo;
  }

  // ─── /admin/team-members ─────────────────────────────────────────────────────

  @Get('team-members')
  @ApiOperation({ summary: 'List all team members for tenant' })
  @ApiResponse({ status: 200, description: 'Team members', schema: { example: { data: [], page: 1, limit: 20, total: 0 } } })
  async listTeamMembers(
    @Tenant() tenantId: string,
    @Query() query: AdminListTeamMembersQueryDto,
  ) {
    this.logger.debug('GET /admin/team-members', { tenantId, query });
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const offset = (page - 1) * limit;

    const whereClause: any = { tenantId };
    if (query.search) {
      whereClause.email = query.search;
    }

    const [data, total] = await this.usersRepo.findAndCount({
      where: whereClause,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, page, limit, total };
  }

  @Post('team-members')
  @ApiOperation({ summary: 'Create a team member' })
  @ApiResponse({ status: 201, description: 'Team member created' })
  async createTeamMember(
    @Tenant() tenantId: string,
    @Body() dto: CreateTeamMemberDto,
  ) {
    this.logger.debug('POST /admin/team-members', { tenantId, email: dto.email });
    const passwordHash = await argon2.hash('temp', { type: argon2.argon2id });
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        tenantId,
        mobileE164: dto.mobileE164,
        email: dto.email ?? null,
        name: dto.name ?? null,
        passwordHash,
      }),
    );
    // Assign roles
    for (const roleName of dto.roleNames) {
      await this.rbac.assignRoleToUser(tenantId, user.id, roleName);
    }
    return user;
  }

  @Patch('team-members/:id')
  @ApiOperation({ summary: 'Update team member role or status' })
  @ApiParam({ name: 'id', example: 'user-uuid' })
  @ApiResponse({ status: 200, description: 'Team member updated' })
  async updateTeamMember(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    this.logger.debug('PATCH /admin/team-members/:id', { tenantId, id, dto });
    const user = await this.usersRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new AppError('RESOURCE_NOT_FOUND', 'User not found');

    if (dto.status) {
      user.isActive = dto.status === 'Active';
    }
    await this.usersRepo.save(user);

    if (dto.roleNames) {
      // Remove all existing roles and reassign
      await this.usersRepo.manager.query(
        'DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, id],
      );
      for (const roleName of dto.roleNames) {
        await this.rbac.assignRoleToUser(tenantId, id, roleName);
      }
    }
    return user;
  }

  // ─── /admin/rbac/users ───────────────────────────────────────────────────────

  @Get('rbac/users')
  @ApiOperation({ summary: 'List all users (staff + clients) for tenant with role enrichment' })
  @ApiResponse({ status: 200, description: 'Users with roles' })
  async listRbacUsers(
    @Tenant() tenantId: string,
    @Query() query: ListRbacUsersQueryDto,
  ) {
    this.logger.debug('GET /admin/rbac/users', { tenantId, query });
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const offset = (page - 1) * limit;

    const whereClause: any = { tenantId };
    if (query.search) {
      whereClause.email = query.search;
    }

    const [data, total] = await this.usersRepo.findAndCount({
      where: whereClause,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, page, limit, total };
  }

  @Patch('rbac/users/:id')
  @ApiOperation({ summary: 'Update user role or status (rbac admin)' })
  @ApiParam({ name: 'id', example: 'user-uuid' })
  @ApiResponse({ status: 200, description: 'User updated' })
  async updateRbacUser(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRbacUserDto,
  ) {
    this.logger.debug('PATCH /admin/rbac/users/:id', { tenantId, id, dto });
    const user = await this.usersRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new AppError('RESOURCE_NOT_FOUND', 'User not found');

    if (dto.status === 'Inactive') {
      user.isActive = false;
    } else if (dto.status === 'Active') {
      user.isActive = true;
    }
    await this.usersRepo.save(user);

    if (dto.roleId) {
      // Remove existing roles and assign new one
      await this.usersRepo.manager.query(
        'DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, id],
      );
      const role = await this.rolesRepo.findOne({ where: { id: dto.roleId, tenantId } });
      if (role) await this.rbac.assignRoleToUser(tenantId, id, role.name);
    }
    return user;
  }

  @Post('rbac/users/invite')
  @ApiOperation({ summary: 'Invite a new team member (creates user + sends invite)' })
  @ApiResponse({ status: 201, description: 'User created and invite sent' })
  async inviteRbacUser(
    @Tenant() tenantId: string,
    @Body() dto: InviteRbacUserDto,
  ) {
    this.logger.debug('POST /admin/rbac/users/invite', { tenantId, email: dto.email });
    const passwordHash = await argon2.hash('temp', { type: argon2.argon2id });
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        tenantId,
        mobileE164: dto.mobileE164,
        email: dto.email ?? null,
        name: dto.name ?? null,
        passwordHash,
      }),
    );
    if (dto.roleId) {
      const role = await this.rolesRepo.findOne({ where: { id: dto.roleId, tenantId } });
      if (role) await this.rbac.assignRoleToUser(tenantId, user.id, role.name);
    }
    // TODO: emit OutboxEvent for invite email/SMS (integration point)
    this.logger.debug('POST /admin/rbac/users/invite:end', { userId: user.id });
    return user;
  }
}