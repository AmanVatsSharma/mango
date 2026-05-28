/**
 * @file src/modules/rbac/controllers/admin-permissions.controller.ts
 * @module rbac
 * @description Admin controller for managing permissions
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
import { AppLoggerService } from '../../../shared/logger';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@ApiTags('RBAC Admin')
@ApiBearerAuth('JWT')
@Controller('admin/rbac/permissions')
export class AdminPermissionsController {
  constructor(
    private readonly rbac: RbacService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminPermissionsController.name);
  }

  @Post()
  @ApiOperation({ summary: 'Create permission' })
  @ApiBody({ type: CreatePermissionDto, examples: { default: { value: { name: 'accounts:read', description: 'Read accounts' } } } })
  @ApiResponse({ status: 201, description: 'Permission created', schema: { example: { name: 'accounts:read', description: 'Read accounts' } } })
  async create(@Tenant() tenantId: string, @Body() dto: CreatePermissionDto) {
    this.logger.debug('create permission start', dto);
    const perm = await this.rbac.ensurePermission(
      tenantId,
      dto.name,
      dto.description,
    );
    this.logger.debug('create permission end', perm);
    return perm;
  }

  @Get()
  @ApiOperation({ summary: 'List permissions' })
  @ApiResponse({ status: 200, description: 'Permissions', schema: { example: [ { name: 'accounts:read' } ] } })
  async list(@Tenant() tenantId: string) {
    this.logger.debug('list permissions start');
    const perms = await this.rbac.listPermissions(tenantId);
    this.logger.debug('list permissions end', { count: perms.length });
    return perms;
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get permission by name' })
  @ApiParam({ name: 'name', example: 'accounts:read' })
  @ApiResponse({ status: 200, description: 'Permission', schema: { example: { name: 'accounts:read', description: 'Read accounts' } } })
  async get(@Tenant() tenantId: string, @Param('name') name: string) {
    this.logger.debug('get permission start', { name });
    const perm = await this.rbac.getPermission(tenantId, name);
    this.logger.debug('get permission end', { found: !!perm });
    return perm;
  }

  @Patch(':name')
  @ApiOperation({ summary: 'Update permission' })
  @ApiParam({ name: 'name', example: 'accounts:read' })
  @ApiBody({ type: UpdatePermissionDto, examples: { default: { value: { description: 'Updated description' } } } })
  @ApiResponse({ status: 200, description: 'Updated', schema: { example: { name: 'accounts:read', description: 'Updated description' } } })
  async update(
    @Tenant() tenantId: string,
    @Param('name') name: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    this.logger.debug('update permission start', { name, dto });
    const updated = await this.rbac.updatePermission(tenantId, name, dto);
    this.logger.debug('update permission end', updated);
    return updated;
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Delete permission' })
  @ApiParam({ name: 'name', example: 'accounts:read' })
  @ApiResponse({ status: 200, description: 'Deleted', schema: { example: { status: 'ok' } } })
  async remove(@Tenant() tenantId: string, @Param('name') name: string) {
    this.logger.debug('delete permission start', { name });
    await this.rbac.deletePermission(tenantId, name);
    this.logger.debug('delete permission end', { name });
    return { status: 'ok' };
  }
}
