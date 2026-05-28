/**
 * File:        apps/backend/src/modules/compliance/controllers/admin-compliance.controller.ts
 * Module:      compliance
 * Purpose:     Admin REST endpoints for compliance policy management within a tenant.
 *              Allows listing and partial updates to compliance policy configurations.
 *
 * Exports:
 *   - AdminComplianceController — @Controller('admin/compliance')
 *       GET  /admin/compliance/config       — list compliance policies for tenant
 *       PUT  /admin/compliance/config/:id   — partial update of a compliance policy
 *
 * Depends on:
 *   - ComplianceService    — listPolicies, upsertPolicy (partial update via patch)
 *
 * Side-effects: DB writes via ComplianceService
 *
 * Key invariants:
 *   - PUT is a partial update — only provided fields are merged
 *
 * Read order:
 *   1. listConfig()   — tenant-scoped policy listing
 *   2. updateConfig()  — merge partial DTO into existing policy
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminListComplianceConfigQueryDto } from '../dto/admin-compliance.dto';
import { UpdateCompliancePolicyDto } from '../dto/admin-compliance.dto';
import { ComplianceService } from '../services/compliance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@ApiTags('Admin Compliance')
@ApiBearerAuth('JWT')
@Controller('admin/compliance')
export class AdminComplianceController {
  constructor(
    private readonly svc: ComplianceService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminComplianceController.name);
  }

  @Get('config')
  async listConfig(@Tenant() tenantId: string, @Body() query: AdminListComplianceConfigQueryDto) {
    this.logger.debug('GET /admin/compliance/config', { tenantId, query });
    const targetTenant = query.tenantId ?? tenantId;
    return this.svc.listPolicies(targetTenant);
  }

  @Put('config/:id')
  async updateConfig(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Body() dto: UpdateCompliancePolicyDto,
  ) {
    this.logger.debug('PUT /admin/compliance/config/:id', { id, tenantId, dto });
    // Fetch existing to do a partial merge
    const policies = await this.svc.listPolicies(tenantId);
    const existing = policies.find((p) => p.id === id);
    if (!existing) {
      throw new AppError('RESOURCE_NOT_FOUND', `Compliance policy ${id} not found`);
    }
    // Merge partial update into existing record
    const merged = { ...existing, ...dto };
    // Use upsertPolicy — needs tenantId + jurisdictionCode from existing
    const updateDto = {
      tenantId: existing.tenantId,
      jurisdictionCode: existing.jurisdictionCode,
      kycTier: merged.kycTier,
      amlRiskLevel: merged.amlRiskLevel,
      sanctionsProvider: merged.sanctionsProvider,
      suitabilityRules: merged.suitabilityRules,
      auditRetentionDays: merged.auditRetentionDays,
    };
    return this.svc.upsertPolicy(updateDto as any);
  }
}