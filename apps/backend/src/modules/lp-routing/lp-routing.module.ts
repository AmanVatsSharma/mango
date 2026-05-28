/**
 * File:        apps/backend/src/modules/lp-routing/lp-routing.module.ts
 * Module:      lp-routing
 * Purpose:     LP (Liquidity Provider) Routing Console — provider management and quote testing
 *
 * Exports:
 *   - LpRoutingService — LP provider CRUD
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
import { LpProviderEntity } from './entities/lp-provider.entity';
import { LpRoutingService } from './services/lp-routing.service';
import { LpRoutingController } from './controllers/lp-routing.controller';
import { LpRoutingResolver } from './lp-routing.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([LpProviderEntity]),
  ],
  controllers: [LpRoutingController],
  providers: [LpRoutingService, LpRoutingResolver],
  exports: [LpRoutingService],
})
export class LpRoutingModule {}