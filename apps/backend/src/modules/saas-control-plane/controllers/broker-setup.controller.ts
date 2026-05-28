/**
 * File:        apps/backend/src/modules/saas-control-plane/controllers/broker-setup.controller.ts
 * Module:      saas-control-plane
 * Purpose:     Broker-scoped setup endpoints for the broker-admin dashboard. Used by
 *              newly onboarded brokers to configure their brokerage before going live.
 *              All routes require BROKER_ADMIN role (enforced by BrokerAdminGuard).
 *
 * Exports:
 *   - BrokerSetupController — @Controller('broker-setup')
 *       GET    /broker-setup/status          — tenant status + setup completeness check
 *       POST   /broker-setup/legal-entity    — create legal entity
 *       POST   /broker-setup/brand-config   — upsert brand config
 *       POST   /broker-setup/branch          — create first branch
 *       POST   /broker-setup/desk            — create first desk
 *       POST   /broker-setup/advance         — advance provisioning → tenant ACTIVE
 *
 * Depends on:
 *   - BrokerAdminGuard       — x-tenant-id (slug) + BROKER_ADMIN role enforcement
 *   - TenancyService         — resolve tenant UUID, create legal entity, brand config
 *   - BrokerHierarchyService — create branch + desk
 *   - BrokerOnboardingService — advanceProvisioning()
 *
 * Side-effects:
 *   - DB writes for legal entity, brand config, branch, desk
 *   - DB write to advance tenant status from PENDING → ACTIVE
 *
 * Key invariants:
 *   - Guard runs before any endpoint — req.tenantId is pre-populated as UUID by BrokerAdminGuard
 *   - advance endpoint checks tenant status is PENDING before advancing
 *   - advance returns 409 Conflict if already ACTIVE (idempotent no-op)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BrokerAdminGuard } from '../../rbac/guards/broker-admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenancyService } from '../../tenancy/services/tenancy.service';
import { BrokerHierarchyService } from '../../broker-hierarchy/services/broker-hierarchy.service';
import { BrokerOnboardingService } from '../services/broker-onboarding.service';
import { CreateLegalEntityDto } from '../../tenancy/dtos/create-legal-entity.dto';
import { UpsertBrandConfigDto } from '../../tenancy/dtos/upsert-brand-config.dto';
import { CreateBranchDto } from '../../broker-hierarchy/dtos/create-branch.dto';
import { CreateDeskDto } from '../../broker-hierarchy/dtos/create-desk.dto';
import { TenantStatus } from '../../tenancy/entities/tenant.entity';

interface SetupStatus {
  tenantId: string;       // UUID (resolved from slug by BrokerAdminGuard)
  tenantCode: string;     // slug
  status: TenantStatus;
  hasLegalEntity: boolean;
  hasBrandConfig: boolean;
  hasBranch: boolean;
  setupComplete: boolean;
}

// Extend Express Request type to include our injected tenantId and NestJS user
interface BrokerAdminRequest extends Request {
  tenantId?: string;   // resolved UUID, set by BrokerAdminGuard
  user?: { userId: string; tenantId?: string };  // populated by JwtAuthGuard
}

@UseGuards(JwtAuthGuard, BrokerAdminGuard)
@Controller('broker-setup')
export class BrokerSetupController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly brokerHierarchy: BrokerHierarchyService,
    private readonly onboarding: BrokerOnboardingService,
  ) {}

  /** GET /broker-setup/status
   *  Returns the current tenant status and a checklist of which setup steps are done.
   *  Used by broker-admin's layout to decide whether to redirect to /setup.
   */
  @Get('status')
  async getStatus(@Req() req: BrokerAdminRequest): Promise<SetupStatus> {
    const tenantSlug = (req.user as { tenantId: string }).tenantId;
    const tenant = await this.tenancy.findByCode(tenantSlug);
    if (!tenant) throw new HttpException('Tenant not found', 404);

    const legalEntities = await this.tenancy.listLegalEntities(tenant.id);
    const brandConfig = await this.tenancy.getBrandConfig(tenantSlug);
    const hierarchy = await this.brokerHierarchy.getHierarchy(tenant.id);

    const hasLegalEntity = legalEntities.length > 0;
    const hasBrandConfig = brandConfig !== null;
    const hasBranch = hierarchy.branches.length > 0;

    const setupComplete = hasLegalEntity && hasBrandConfig && hasBranch;

    return {
      tenantId: tenant.id,
      tenantCode: tenant.code,
      status: tenant.status,
      hasLegalEntity,
      hasBrandConfig,
      hasBranch,
      setupComplete,
    };
  }

  /** POST /broker-setup/legal-entity
   *  Creates the broker's primary legal entity (company name, registration, jurisdiction).
   *  Must be completed before advancing.
   */
  @Post('legal-entity')
  async createLegalEntity(
    @Req() req: BrokerAdminRequest,
    @Body() dto: CreateLegalEntityDto,
  ) {
    const tenantSlug = (req.user as { tenantId: string }).tenantId;
    const tenant = await this.tenancy.findByCode(tenantSlug);
    if (!tenant) throw new HttpException('Tenant not found', 404);

    // Replace the DTO's tenantId with the resolved UUID (from guard)
    const entity = await this.tenancy.createLegalEntity({
      ...dto,
      tenantId: tenant.id,
    });
    return entity;
  }

  /** POST /broker-setup/brand-config
   *  Upserts white-label brand configuration (logo, colors, app name).
   */
  @Post('brand-config')
  async upsertBrandConfig(
    @Req() req: BrokerAdminRequest,
    @Body() dto: UpsertBrandConfigDto,
  ) {
    const tenantSlug = (req.user as { tenantId: string }).tenantId;
    const tenant = await this.tenancy.findByCode(tenantSlug);
    if (!tenant) throw new HttpException('Tenant not found', 404);

    return this.tenancy.upsertBrandConfig(tenant.id, dto);
  }

  /** POST /broker-setup/branch
   *  Creates the top-level branch for the broker's hierarchy.
   */
  @Post('branch')
  async createBranch(
    @Req() req: BrokerAdminRequest,
    @Body() dto: CreateBranchDto,
  ) {
    const tenantSlug = (req.user as { tenantId: string }).tenantId;
    const tenant = await this.tenancy.findByCode(tenantSlug);
    if (!tenant) throw new HttpException('Tenant not found', 404);

    // Resolve broker ID for this tenant
    const broker = await this.brokerHierarchy.findBrokerByCode(tenant.id, tenantSlug);
    if (!broker) throw new HttpException('Broker entity not found — contact support', 404);

    const branch = await this.brokerHierarchy.createBranch({
      ...dto,
      brokerId: broker.id,
    });
    return branch;
  }

  /** POST /broker-setup/desk
   *  Creates the first desk under the top-level branch.
   *  Requires the branch to exist (created via POST /broker-setup/branch).
   */
  @Post('desk')
  async createDesk(
    @Req() req: BrokerAdminRequest,
    @Body() dto: CreateDeskDto,
  ) {
    return this.brokerHierarchy.createDesk(dto);
  }

  /** POST /broker-setup/advance
   *  Advances the tenant from PENDING → ACTIVE. Safe to call idempotently —
   *  returns 409 if the tenant is already ACTIVE, so the frontend can
   *  distinguish "already done" from "something went wrong."
   */
  @Post('advance')
  @HttpCode(200)
  async advanceProvisioning(@Req() req: BrokerAdminRequest) {
    const tenantSlug = (req.user as { tenantId: string }).tenantId;
    const tenant = await this.tenancy.findByCode(tenantSlug);
    if (!tenant) throw new HttpException('Tenant not found', 404);

    if (tenant.status === 'ACTIVE') {
      throw new HttpException('Tenant is already active', 409);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new HttpException('Tenant is suspended — contact platform support', 403);
    }

    const record = await this.onboarding.advanceProvisioning(tenant.id);
    return { provisioningStatus: record.status, tenantId: tenant.id };
  }
}