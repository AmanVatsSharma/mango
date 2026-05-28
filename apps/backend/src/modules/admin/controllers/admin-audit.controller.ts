/**
 * @file src/modules/admin/controllers/admin-audit.controller.ts
 * @module admin
 * @description Admin audit log viewer for order audits
 * @author BharatERP
 * @created 2025-01-09
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('admin/audit')
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminAuditController {
  constructor(
    private readonly service: AdminDashboardService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminAuditController.name);
  }

  @Get('orders')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List order audit logs' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiResponse({ status: 200, description: 'Order audits' })
  async listOrderAudits(@Query('limit') limit?: string) {
    this.logger.debug('GET /admin/audit/orders', { limit });
    return this.service.listOrderAuditsByTenant(limit);
  }

  @Get('all')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all audit log entries for the tenant' })
  @ApiQuery({ name: 'actor', required: false })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiQuery({ name: 'offset', required: false, example: '0' })
  @ApiResponse({ status: 200, description: 'Paginated audit log' })
  async listAll(
    @Query('actor') actor?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/audit/all', { actor, module, action, from, to, limit, offset });
    return this.service.listAllAudits({
      actor,
      module,
      action,
      from,
      to,
      limit,
      offset,
    });
  }
}

