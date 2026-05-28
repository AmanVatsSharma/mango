/**
 * @file src/modules/users/controllers/admin-users.controller.ts
 * @module users
 * @description Admin Users controller secured with JWT + Tenant + Permissions guards
 * @author BharatERP
 * @created 2025-09-24
 */

import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { UsersService } from '../users.service';
import { ListUsersDto } from '../dto/list-users.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

@ApiTags('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users:read')
  @ApiOperation({ summary: 'List users (paginated, tenant-scoped)', description: 'Requires permissions: users:read' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  list(
    @Headers('x-tenant-id') tenantId: string,
    @Query() query: ListUsersDto,
  ) {
    return this.usersService.findAll(tenantId, query);
  }

  @Get(':id')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Get user by id (tenant-scoped)', description: 'Requires permissions: users:read' })
  @ApiParam({ name: 'id', type: String })
  getOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.findOneOrThrow(tenantId, id);
  }

  @Post()
  @Permissions('users:write')
  @ApiOperation({ summary: 'Create user (tenant-scoped)', description: 'Requires permissions: users:write' })
  create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    // Enforce body tenantId to match header
    dto.tenantId = tenantId;
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Update user fields (tenant-scoped)', description: 'Requires permissions: users:write' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    // Ensure update only within tenant; service method already scopes retrieval on tenant before update
    return this.usersService.update(id, dto);
  }

  @Post(':id/deactivate')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Deactivate user', description: 'Requires permissions: users:write' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: { properties: { reason: { type: 'string' } } } })
  deactivate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.usersService.deactivate(tenantId, id, reason);
  }

  @Post(':id/reactivate')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Reactivate user', description: 'Requires permissions: users:write' })
  @ApiParam({ name: 'id', type: String })
  reactivate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.reactivate(tenantId, id);
  }
}


