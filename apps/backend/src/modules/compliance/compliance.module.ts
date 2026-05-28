/**
 * File:        apps/backend/src/modules/compliance/compliance.module.ts
 * Module:      compliance
 * Purpose:     Compliance policy management, jurisdiction adapters, and surveillance alerts.
 *
 * Exports:
 *   - ComplianceService    — upsertPolicy, listPolicies, enforcePreTrade
 *   - SurveillanceService   — alert lifecycle (emit, list, dismiss, acknowledge)
 *   - SurveillanceAlertEntity — alert records (imported by RiskPolicyModule)
 *
 * Depends on:
 *   - SharedModule   — AppLoggerService (global)
 *   - DfsaAdapter, FcaAdapter — jurisdiction-specific compliance adapters
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - SurveillanceAlertEntity is exported so RiskPolicyModule can inject it via ComplianceModule
 *   - ComplianceModule is imported by RiskPolicyModule for the same reason
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
import { ComplianceResolver } from './compliance.resolver';
import { ComplianceController } from './controllers/compliance.controller';
import { AdminComplianceController } from './controllers/admin-compliance.controller';
import { AdminCompliancePoliciesController } from './controllers/admin-compliance-policies.controller';
import { AdminSurveillanceController } from './controllers/admin-surveillance.controller';
import { AdminAmlController } from './controllers/admin-aml.controller';
import { CompliancePolicyEntity } from './entities/compliance-policy.entity';
import { SurveillanceAlertEntity } from './entities/surveillance-alert.entity';
import { ComplianceService } from './services/compliance.service';
import { SurveillanceService } from './services/surveillance.service';
import { DfsaAdapter } from './adapters/dfsa.adapter';
import { FcaAdapter } from './adapters/fca.adapter';

@Module({
  imports: [SharedModule, RbacModule, TypeOrmModule.forFeature([CompliancePolicyEntity, SurveillanceAlertEntity])],
  controllers: [ComplianceController, AdminComplianceController, AdminCompliancePoliciesController, AdminSurveillanceController, AdminAmlController],
  providers: [ComplianceResolver, ComplianceService, SurveillanceService, DfsaAdapter, FcaAdapter],
  exports: [ComplianceService, SurveillanceService, TypeOrmModule],
})
export class ComplianceModule {}
