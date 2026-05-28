/**
 * File:        apps/backend/src/modules/risk-policy/controllers/risk-policy.controller.ts
 * Module:      risk-policy
 * Purpose:     Tenant-scoped risk policy CRUD and assignment endpoints.
 *              Broker admins create policies and assign them to their tenant.
 *
 * Exports:
 *   - RiskPolicyController — @Controller('risk-policy')
 *       POST /risk-policy/policies      — create a risk policy
 *       POST /risk-policy/assignments    — assign a policy to the tenant
 *       GET  /risk-policy/policies       — list policies for a tenant
 *
 * Depends on:
 *   - RiskPolicyService — policy CRUD and enforcement
 *
 * Side-effects: DB writes for POST
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *   - TenantGuard extracts tenantId from the authenticated JWT context
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssignRiskPolicyDto, CreateRiskPolicyDto } from '../dtos/create-risk-policy.dto';
import { RiskPolicyEntity } from '../entities/risk-policy.entity';
import { TenantRiskPolicyEntity } from '../entities/tenant-risk-policy.entity';
import { RiskPolicyService } from '../services/risk-policy.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';

@ApiTags('risk-policy')
@Controller('risk-policy')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth('JWT')
export class RiskPolicyController {
  constructor(private readonly riskPolicyService: RiskPolicyService) {}

  @Post('policies')
  @Permissions('oms:admin')
  @ApiOperation({ summary: 'Create a new risk policy' })
  async create(@Body() dto: CreateRiskPolicyDto): Promise<RiskPolicyEntity> {
    return this.riskPolicyService.createPolicy(dto);
  }

  @Post('assignments')
  @Permissions('oms:admin')
  @ApiOperation({ summary: 'Assign a risk policy to the tenant' })
  async assign(@Body() dto: AssignRiskPolicyDto): Promise<TenantRiskPolicyEntity> {
    return this.riskPolicyService.assignPolicy(dto);
  }

  @Get('policies')
  @Permissions('oms:admin')
  @ApiOperation({ summary: 'List risk policies for a tenant' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant UUID (auto-filled from auth context)' })
  async list(@Query('tenantId') tenantId: string): Promise<RiskPolicyEntity[]> {
    return this.riskPolicyService.listPolicies(tenantId);
  }
}
