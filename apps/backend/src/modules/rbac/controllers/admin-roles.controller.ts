/**
 * @file src/modules/rbac/controllers/admin-roles.controller.ts
 * @module rbac
 * @description Admin controller for managing roles and role assignments
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RbacService } from '../rbac.service';
import { TenantGuard } from '../guards/tenant.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Tenant } from '../decorators/tenant.decorator';
import { CreateRoleDto } from '../dto/create-role.dto';
import { AppLoggerService } from '../../../shared/logger';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { GrantPermissionDto } from '../dto/grant-permission.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@ApiTags('RBAC Admin')
@ApiBearerAuth('JWT')
@Controller('admin/rbac/roles')
export class AdminRolesController {
  constructor(
    private readonly rbac: RbacService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminRolesController.name);
  }

  @Post()
  @ApiOperation({ summary: 'Create role' })
  @ApiBody({ type: CreateRoleDto, examples: { default: { value: { name: 'analyst', description: 'Can view reports' } } } })
  @ApiResponse({ status: 201, description: 'Role created', schema: { example: { name: 'analyst', description: 'Can view reports' } } })
  async create(@Tenant() tenantId: string, @Body() dto: CreateRoleDto) {
    this.logger.debug('create role start', dto);
    const role = await this.rbac.ensureRole(
      tenantId,
      dto.name,
      dto.description,
    );
    this.logger.debug('create role end', role);
    return role;
  }

  @Get()
  @ApiOperation({ summary: 'List roles' })
  @ApiResponse({ status: 200, description: 'Roles', schema: { example: [ { name: 'admin' }, { name: 'analyst' } ] } })
  async list(@Tenant() tenantId: string) {
    this.logger.debug('list roles start');
    const roles = await this.rbac.listRoles(tenantId);
    this.logger.debug('list roles end', { count: roles.length });
    return roles;
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get role by name' })
  @ApiParam({ name: 'name', example: 'analyst' })
  @ApiResponse({ status: 200, description: 'Role', schema: { example: { name: 'analyst', description: 'Can view reports' } } })
  async get(@Tenant() tenantId: string, @Param('name') name: string) {
    this.logger.debug('get role start', { name });
    const role = await this.rbac.getRole(tenantId, name);
    this.logger.debug('get role end', { found: !!role });
    return role;
  }

  @Patch(':name')
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'name', example: 'analyst' })
  @ApiBody({ type: UpdateRoleDto, examples: { default: { value: { description: 'Updated description' } } } })
  @ApiResponse({ status: 200, description: 'Role updated', schema: { example: { name: 'analyst', description: 'Updated description' } } })
  async update(
    @Tenant() tenantId: string,
    @Param('name') name: string,
    @Body() dto: UpdateRoleDto,
  ) {
    this.logger.debug('update role start', { name, dto });
    const updated = await this.rbac.updateRole(tenantId, name, dto);
    this.logger.debug('update role end', updated);
    return updated;
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'name', example: 'analyst' })
  @ApiResponse({ status: 200, description: 'Deleted', schema: { example: { status: 'ok' } } })
  async remove(@Tenant() tenantId: string, @Param('name') name: string) {
    this.logger.debug('delete role start', { name });
    await this.rbac.deleteRole(tenantId, name);
    this.logger.debug('delete role end', { name });
    return { status: 'ok' };
  }

  @Post(':name/users')
  @ApiOperation({ summary: 'Assign role to user' })
  @ApiParam({ name: 'name', example: 'analyst' })
  @ApiBody({ type: AssignRoleDto, examples: { default: { value: { userId: 'user-uuid' } } } })
  @ApiResponse({ status: 200, description: 'Assigned', schema: { example: { status: 'ok' } } })
  async assignToUser(
    @Tenant() tenantId: string,
    @Param('name') name: string,
    @Body() dto: AssignRoleDto,
  ) {
    this.logger.debug('assign role start', { name, userId: dto.userId });
    await this.rbac.assignRoleToUser(tenantId, dto.userId, name);
    this.logger.debug('assign role end', { name, userId: dto.userId });
    return { status: 'ok' };
  }

  @Post(':name/permissions')
  @ApiOperation({ summary: 'Grant permission to role' })
  @ApiParam({ name: 'name', example: 'analyst' })
  @ApiBody({ type: GrantPermissionDto, examples: { default: { value: { permissionName: 'accounts:read' } } } })
  @ApiResponse({ status: 200, description: 'Granted', schema: { example: { status: 'ok' } } })
  async grantPermission(
    @Tenant() tenantId: string,
    @Param('name') roleName: string,
    @Body() dto: GrantPermissionDto,
  ) {
    this.logger.debug('grant permission start', {
      roleName,
      permissionName: dto.permissionName,
    });
    await this.rbac.grantPermissionToRole(
      tenantId,
      roleName,
      dto.permissionName,
    );
    this.logger.debug('grant permission end', {
      roleName,
      permissionName: dto.permissionName,
    });
    return { status: 'ok' };
  }
}
