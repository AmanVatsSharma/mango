/**
 * File:        apps/backend/src/modules/saas-control-plane/controllers/saas-control-plane.controller.ts
 * Module:      saas-control-plane
 * Purpose:     Platform-owner control-plane APIs for governance and monetization scaffolds.
 *              ALL endpoints require JwtAuthGuard + PlatformOwnerGuard.
 *
 * Exports:
 *   - SaasControlPlaneController — @Controller('saas-control-plane')
 *
 * Depends on:
 *   - SaasControlPlaneService   — all business logic
 *   - JwtAuthGuard              — validates access token
 *   - PlatformOwnerGuard        — enforces tid='platform' + platform_owner role
 *
 * Side-effects:  DB writes via service layer
 *
 * Key invariants:
 *   - Every endpoint is platform-owner gated — no public routes here.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-14
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformOwnerGuard } from '../../rbac/guards/platform-owner.guard';
import {
  CreateBillingInvoicePlaceholderDto,
  CreateSupportImpersonationAuditDto,
  CreateTenantProvisioningDto,
  UpsertEntitlementPlanDto,
} from '../dtos/create-tenant-provisioning.dto';
import { BillingInvoicePlaceholderEntity } from '../entities/billing-invoice-placeholder.entity';
import { EntitlementPlanEntity } from '../entities/entitlement-plan.entity';
import { SupportImpersonationAuditEntity } from '../entities/support-impersonation-audit.entity';
import { TenantProvisioningEntity } from '../entities/tenant-provisioning.entity';
import { SaasControlPlaneService } from '../services/saas-control-plane.service';

@UseGuards(JwtAuthGuard, PlatformOwnerGuard)
@Controller('saas-control-plane')
export class SaasControlPlaneController {
  constructor(private readonly saasControlPlaneService: SaasControlPlaneService) {}

  @Post('provisioning')
  async createProvisioning(@Body() dto: CreateTenantProvisioningDto): Promise<TenantProvisioningEntity> {
    return this.saasControlPlaneService.createProvisioning(dto);
  }

  @Get('provisioning')
  async listProvisioning(@Query('tenantId') tenantId: string): Promise<TenantProvisioningEntity[]> {
    return this.saasControlPlaneService.listProvisioning(tenantId);
  }

  @Post('entitlements')
  async upsertEntitlements(@Body() dto: UpsertEntitlementPlanDto): Promise<EntitlementPlanEntity> {
    return this.saasControlPlaneService.upsertEntitlements(dto);
  }

  @Get('entitlements')
  async listEntitlements(@Query('tenantId') tenantId: string): Promise<EntitlementPlanEntity[]> {
    return this.saasControlPlaneService.listEntitlements(tenantId);
  }

  @Post('billing/invoices')
  async createBilling(@Body() dto: CreateBillingInvoicePlaceholderDto): Promise<BillingInvoicePlaceholderEntity> {
    return this.saasControlPlaneService.createBillingPlaceholder(dto);
  }

  @Get('billing/invoices')
  async listBilling(@Query('tenantId') tenantId: string): Promise<BillingInvoicePlaceholderEntity[]> {
    return this.saasControlPlaneService.listBilling(tenantId);
  }

  @Post('audit/impersonations')
  async auditImpersonation(@Body() dto: CreateSupportImpersonationAuditDto): Promise<SupportImpersonationAuditEntity> {
    return this.saasControlPlaneService.auditImpersonation(dto);
  }

  @Get('audit/impersonations')
  async listAudit(@Query('tenantId') tenantId: string): Promise<SupportImpersonationAuditEntity[]> {
    return this.saasControlPlaneService.listAudit(tenantId);
  }
}
