/**
 * File:        apps/backend/src/modules/crm/crm.module.ts
 * Module:      crm
 * Purpose:     Retention CRM module — outreach, churn risk, and retention offers
 *
 * Exports:
 *   - CrmService — CRM operations
 *
 * Depends on:
 *   - SharedModule    — AppLoggerService
 *   - AuthModule     — JwtAuthGuard
 *   - RbacModule     — TenantGuard, PermissionsGuard, Permissions, Tenant
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. @Module declaration
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '@obsidian/backend-shared';
import { AuthModule } from '@obsidian/backend-auth';
import { RbacModule } from '@obsidian/backend-rbac';
import { CrmOutreachEntity } from './entities/crm-outreach.entity';
import { CrmRetentionOfferEntity } from './entities/crm-retention-offer.entity';
import { CrmService } from './services/crm.service';
import { CrmController } from './controllers/crm.controller';
import { CrmResolver } from './crm.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([CrmOutreachEntity, CrmRetentionOfferEntity]),
  ],
  controllers: [CrmController],
  providers: [CrmService, CrmResolver],
  exports: [CrmService],
})
export class CrmModule {}