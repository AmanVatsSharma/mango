/**
 * File:        apps/backend/src/modules/compliance/controllers/admin-compliance-policies.controller.ts
 * Module:      compliance
 * Purpose:     Admin REST endpoints for compliance policy management under /admin/compliance/policies.
 *              Provides a dedicated controller scoped to the policies sub-resource.
 *
 * Exports:
 *   - AdminCompliancePoliciesController — @Controller('admin/compliance/policies')
 *       GET  /admin/compliance/policies       — list compliance policies for tenant
 *       POST /admin/compliance/policies       — create or upsert a compliance policy
 *
 * Depends on:
 *   - ComplianceService — listPolicies, upsertPolicy
 *
 * Side-effects: DB writes via ComplianceService (upsert)
 *
 * Key invariants:
 *   - POST is upsert — keyed on tenantId + jurisdictionCode
 *   - GET lists all policies for the tenant
 *
 * Read order:
 *   1. listPolicies() — tenant-scoped policy listing
 *   2. createOrUpdate() — upsert pattern
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { ComplianceService } from '../services/compliance.service';
import { AppLoggerService } from '../../../shared/logger';
import { AdminComplianceListQueryDto, AdminCompliancePolicyDto } from '../dto/admin-compliance.dto';
import { CompliancePolicyEntity } from '../entities/compliance-policy.entity';
import { AppError } from '../../../common/errors/app-error';

@ApiTags('Admin Compliance Policies')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@Controller('admin/compliance/policies')
export class AdminCompliancePoliciesController {
  constructor(
    private readonly svc: ComplianceService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminCompliancePoliciesController.name);
  }

  @Get()
  @ApiOperation({ summary: 'List compliance policies for the tenant' })
  @ApiResponse({ status: 200, description: 'Compliance policies' })
  async listPolicies(@Tenant() tenantId: string, @Query() query: AdminComplianceListQueryDto) {
    this.logger.debug('GET /admin/compliance/policies', { tenantId, query });
    const policies = await this.svc.listPolicies(tenantId);
    if (query.jurisdictionCode) {
      return policies.filter((p) => p.jurisdictionCode === query.jurisdictionCode);
    }
    return policies;
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a compliance policy (upsert by jurisdictionCode)' })
  @ApiResponse({ status: 201, description: 'Policy created or updated' })
  async createOrUpdate(@Body() dto: AdminCompliancePolicyDto): Promise<CompliancePolicyEntity> {
    this.logger.debug('POST /admin/compliance/policies', dto);
    return this.svc.upsertPolicy(dto as any);
  }
}