/**
 * File:        src/modules/risk-policy/controllers/admin-risk.controller.ts
 * Module:      risk-policy
 * Purpose:     Broker-admin endpoints for listing risk policies, aggregated exposure,
 *              and the risk dashboard.
 *
 * Exports:
 *   - AdminRiskController   — @Controller('admin/risk')
 *       GET  /admin/risk/policies    — paginated risk policies
 *       GET  /admin/risk/exposure    — net/gross exposure per instrument
 *       GET  /admin/risk/dashboard   — aggregated dashboard with totals
 *       GET  /admin/risk/alerts      — paginated surveillance alerts
 *
 * Depends on:
 *   - @obsidian/backend-risk-policy (RiskPolicyService)   — listAllPolicies, listExposure
 *   - RiskDashboardService (local)                          — getDashboard, getAlerts, dismissAlert
 *   - @obsidian/backend-rbac (guards + Permissions decorator)
 *
 * Side-effects: none
 * Key invariants:  requires oms:admin permission; tenant-scoped via TenantGuard
 *
 * Read order:
 *   1. AdminRiskController  — endpoint definitions
 *   2. RiskPolicyService     — underlying policy CRUD
 *   3. RiskDashboardService  — dashboard aggregation + alert management
 *
 * Author:       BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { RiskPolicyService } from '../services/risk-policy.service';
import { RiskDashboardService } from '../services/risk-dashboard.service';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

@ApiTags('admin/risk')
@Controller('admin/risk')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminRiskController {
  constructor(
    private readonly policyService: RiskPolicyService,
    private readonly dashboardService: RiskDashboardService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminRiskController.name);
  }

  @Get('policies')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all risk policies for the tenant' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Paginated risk policies' })
  async listPolicies(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    this.logger.debug('GET /admin/risk/policies', { limit, offset });
    return this.policyService.listAllPolicies({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('exposure')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Net and gross exposure per instrument' })
  @ApiResponse({ status: 200, description: 'Exposure rows per instrument' })
  async listExposure(@Tenant() tenantId: string) {
    this.logger.debug('GET /admin/risk/exposure', { tenantId });
    return this.policyService.listExposure();
  }

  @Get('dashboard')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Aggregated risk dashboard — instruments with net/gross notional and totals' })
  @ApiResponse({ status: 200, description: 'Dashboard with instruments array and totals' })
  async getDashboard(@Tenant() tenantId: string) {
    this.logger.debug('GET /admin/risk/dashboard', { tenantId });
    return this.dashboardService.getDashboard(tenantId);
  }

  @Get('alerts')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Surveillance alerts for the tenant (non-dismissed)' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Paginated alerts' })
  async getAlerts(
    @Tenant() tenantId: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/risk/alerts', { tenantId, severity });
    return this.dashboardService.getAlerts(tenantId, {
      severity,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch('alerts/:id/dismiss')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Dismiss a surveillance alert' })
  @ApiResponse({ status: 200, description: 'Alert dismissed' })
  async dismissAlert(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Body() body: { reason?: string },
  ) {
    this.logger.debug('PATCH /admin/risk/alerts/:id/dismiss', { id, tenantId });
    return this.dashboardService.dismissAlert(id, tenantId, body.reason);
  }
}