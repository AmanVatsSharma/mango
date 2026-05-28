/**
 * File:        apps/backend/src/modules/limits-and-controls/limits-and-controls.module.ts
 * Module:      limits-and-controls
 * Purpose:     Limits-and-controls module for operational risk guardrails.
 *              Covers: pre-trade limit enforcement, exposure limit management, and exception queues.
 *
 * Exports:
 *   - LimitsAndControlsService — pre-trade enforcement gates (MAX_OPEN_ORDERS, MAX_ORDER_NOTIONAL, INSTRUMENT_BLACKLIST)
 *   - AdminLimitsService       — exposure limit CRUD for admin dashboard
 *
 * Depends on:
 *   - SharedModule     — AppLoggerService (global)
 *   - TenantEntity     — slug-to-UUID resolution in pre-trade enforcement
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - AdminLimitsService is exported so OmsModule can inject checkExposureLimit()
 *   - Pre-trade enforcement is fail-open (no policy → allow)
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
import { LimitsAndControlsResolver } from './limits-and-controls.resolver';
import { LimitsAndControlsController } from './controllers/limits-and-controls.controller';
import { AdminLimitsController } from './controllers/admin-limits.controller';
import { AdminExposureLimitsController } from './controllers/admin-exposure-limits.controller';
import { LimitControlEntity } from './entities/limit-control.entity';
import { LimitExceptionEntity } from './entities/limit-exception.entity';
import { ExposureLimitEntity } from './entities/exposure-limit.entity';
import { TenantEntity } from '../tenancy/entities/tenant.entity';
import { LimitsAndControlsService } from './services/limits-and-controls.service';
import { AdminLimitsService } from './services/admin-limits.service';

@Module({
  imports: [SharedModule, RbacModule, TypeOrmModule.forFeature([LimitControlEntity, LimitExceptionEntity, ExposureLimitEntity, TenantEntity])],
  controllers: [LimitsAndControlsController, AdminLimitsController, AdminExposureLimitsController],
  providers: [LimitsAndControlsResolver, LimitsAndControlsService, AdminLimitsService],
  exports: [LimitsAndControlsService, AdminLimitsService],
})
export class LimitsAndControlsModule {}
