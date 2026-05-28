/**
 * File:        apps/backend/src/modules/saas-control-plane/saas-control-plane.module.ts
 * Module:      saas-control-plane
 * Purpose:     SaaS control-plane module for platform-owner provisioning,
 *              tenant suspension, impersonation, and governance APIs.
 *
 * Exports:     SaasControlPlaneService
 *
 * Depends on:
 *   - RbacModule    — RBAC seeding during tenant provisioning
 *   - JwtModule     — minting 15-min impersonation tokens
 *   - TenantEntity  — tenant status management
 *   - RefreshTokenEntity — bulk revocation on suspension
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BrokerHierarchyModule } from '../broker-hierarchy/broker-hierarchy.module';
import { UsersModule } from '../users/users.module';
import { TenantEntity } from '../tenancy/entities/tenant.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { SaasControlPlaneController } from './controllers/saas-control-plane.controller';
import { BrokerOnboardingController } from './controllers/broker-onboarding.controller';
import { BrokerSetupController } from './controllers/broker-setup.controller';
import { PlatformDashboardController } from './controllers/platform-dashboard.controller';
import { BillingInvoicePlaceholderEntity } from './entities/billing-invoice-placeholder.entity';
import { EntitlementPlanEntity } from './entities/entitlement-plan.entity';
import { SupportImpersonationAuditEntity } from './entities/support-impersonation-audit.entity';
import { TenantProvisioningEntity } from './entities/tenant-provisioning.entity';
import { SaasControlPlaneService } from './services/saas-control-plane.service';
import { BrokerOnboardingService } from './services/broker-onboarding.service';
import { SaasControlPlaneResolver } from './saas-control-plane.resolver';

@Module({
  imports: [
    SharedModule,
    JwtModule.register({}),
    RbacModule,
    TenancyModule,
    BrokerHierarchyModule,
    UsersModule,
    TypeOrmModule.forFeature([
      TenantProvisioningEntity,
      EntitlementPlanEntity,
      BillingInvoicePlaceholderEntity,
      SupportImpersonationAuditEntity,
      TenantEntity,
      RefreshTokenEntity,
    ]),
  ],
  controllers: [SaasControlPlaneController, BrokerOnboardingController, BrokerSetupController, PlatformDashboardController],
  providers: [SaasControlPlaneService, BrokerOnboardingService, SaasControlPlaneResolver],
  exports: [SaasControlPlaneService, BrokerOnboardingService],
})
export class SaasControlPlaneModule {}
