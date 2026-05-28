/**
 * File:        apps/backend/src/modules/compliance/controllers/admin-surveillance.controller.ts
 * Module:      surveillance
 * Purpose:     Admin REST endpoints for surveillance alert management.
 *
 * Exports:
 *   - AdminSurveillanceController — @Controller('admin/surveillance')
 *       GET    /admin/surveillance/alerts                  — list alerts (filterable)
 *       PATCH  /admin/surveillance/alerts/:id/dismiss       — dismiss with reason
 *       PATCH  /admin/surveillance/alerts/:id/acknowledge   — mark as seen
 *
 * Depends on:
 *   - SurveillanceService — emitAlert, listAlerts, dismissAlert, acknowledgeAlert
 *
 * Side-effects: DB writes via SurveillanceService
 *
 * Key invariants:
 *   - Requires admin role; tenant-scoped via TenantGuard
 *   - dismissReason is optional but stored for audit trail
 *
 * Read order:
 *   1. AdminSurveillanceController — endpoint definitions
 *   2. SurveillanceService        — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { SurveillanceService } from '../services/surveillance.service';
import { AppLoggerService } from '../../../shared/logger';
import { SurveillanceAlertEntity } from '../entities/surveillance-alert.entity';
import { AppError } from '../../../common/errors/app-error';
import { IsOptional, IsString } from 'class-validator';

class DismissAlertDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Admin Surveillance')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@Controller('admin/surveillance')
export class AdminSurveillanceController {
  constructor(
    private readonly svc: SurveillanceService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminSurveillanceController.name);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List surveillance alerts for the tenant' })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Paginated alerts' })
  async listAlerts(
    @Tenant() tenantId: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/surveillance/alerts', { tenantId, severity, status });
    return this.svc.listAlerts(tenantId, {
      severity,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch('alerts/:id/dismiss')
  @ApiOperation({ summary: 'Dismiss a surveillance alert with optional reason' })
  @ApiResponse({ status: 200, description: 'Alert dismissed' })
  async dismissAlert(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Body() body: DismissAlertDto,
  ) {
    this.logger.debug('PATCH /admin/surveillance/alerts/:id/dismiss', { id, tenantId });
    return this.svc.dismissAlert(id, tenantId, 'admin', body.reason);
  }

  @Patch('alerts/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a surveillance alert' })
  @ApiResponse({ status: 200, description: 'Alert acknowledged' })
  async acknowledgeAlert(@Param('id') id: string, @Tenant() tenantId: string) {
    this.logger.debug('PATCH /admin/surveillance/alerts/:id/acknowledge', { id, tenantId });
    return this.svc.acknowledgeAlert(id, tenantId, 'admin');
  }
}