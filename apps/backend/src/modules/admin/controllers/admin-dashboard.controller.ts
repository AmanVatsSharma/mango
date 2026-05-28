/**
 * @file src/modules/admin/controllers/admin-dashboard.controller.ts
 * @module admin
 * @description Admin dashboard KPIs (multi-tenant scoped)
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

@ApiTags('admin/dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(
    private readonly service: AdminDashboardService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminDashboardController.name);
  }

  @Get('stats')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'High-level KPIs' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiResponse({ status: 200, description: 'KPI snapshot' })
  async getStats(@Query('from') from?: string, @Query('to') to?: string) {
    this.logger.debug('GET /admin/dashboard/stats', { from, to });
    return this.service.getStats(from, to);
  }

  @Get('revenue')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revenue breakdown by period (spread, commission, swap)' })
  @ApiQuery({ name: 'period', required: false, enum: ['daily', 'weekly', 'mtd'], description: 'Aggregation period' })
  @ApiResponse({ status: 200, description: 'Revenue series by period bucket' })
  async getRevenueStats(@Query('period') period?: 'daily' | 'weekly' | 'mtd') {
    this.logger.debug('GET /admin/dashboard/revenue', { period });
    return this.service.getRevenueStats(period ?? 'mtd');
  }

  @Get('system/status')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'System health check (API, DB, cache, OMS)' })
  @ApiResponse({ status: 200, description: 'Service status list' })
  async getSystemStatus() {
    this.logger.debug('GET /admin/dashboard/system/status');
    return this.service.getSystemStatus();
  }
}

