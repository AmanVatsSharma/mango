/**
 * File:        apps/backend/src/modules/risk-policy/risk-policy.module.ts
 * Module:      risk-policy
 * Purpose:     Risk policy module for jurisdiction constraints, tenant assignment controls,
 *              pre-trade enforcement, and aggregated risk dashboard.
 *
 * Exports:
 *   - RiskPolicyService       — pre-trade enforcement (enforcePreTrade), policy CRUD
 *   - RiskDashboardService    — admin risk dashboard + alerts
 *
 * Depends on:
 *   - SharedModule            — AppLoggerService (global)
 *   - ComplianceModule        — SurveillanceAlertEntity for risk-dashboard queries
 *   - TenantEntity            — slug-to-UUID resolution
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - RiskDashboardService is injected in AdminRiskController
 *
 * Read order:
 *   1. @Module declaration
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { RiskPolicyResolver } from './risk-policy.resolver';
import { RiskPolicyController } from './controllers/risk-policy.controller';
import { AdminRiskController } from './controllers/admin-risk.controller';
import { RiskPolicyEntity } from './entities/risk-policy.entity';
import { TenantRiskPolicyEntity } from './entities/tenant-risk-policy.entity';
import { TenantEntity } from '../tenancy/entities/tenant.entity';
import { RiskPolicyService } from './services/risk-policy.service';
import { RiskDashboardService } from './services/risk-dashboard.service';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    ComplianceModule,
    TypeOrmModule.forFeature([RiskPolicyEntity, TenantRiskPolicyEntity, TenantEntity]),
  ],
  controllers: [RiskPolicyController, AdminRiskController],
  providers: [RiskPolicyResolver, RiskPolicyService, RiskDashboardService],
  exports: [RiskPolicyService, RiskDashboardService],
})
export class RiskPolicyModule {}
