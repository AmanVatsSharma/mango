/**
 * File:        apps/backend/src/modules/copy-trading/copy-trading.module.ts
 * Module:      copy-trading
 * Purpose:     Copy Trading module — master signal broadcasting and slave subscriptions
 *
 * Exports:
 *   - CopyTradingService — signals and subscriptions
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
import { CopyTradingSignalEntity } from './entities/copy-trading-signal.entity';
import { CopyTradingSubscriptionEntity } from './entities/copy-trading-subscription.entity';
import { CopyTradingService } from './services/copy-trading.service';
import { CopyTradingController } from './controllers/copy-trading.controller';
import { CopyTradingResolver } from './copy-trading.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([CopyTradingSignalEntity, CopyTradingSubscriptionEntity]),
  ],
  controllers: [CopyTradingController],
  providers: [CopyTradingService, CopyTradingResolver],
  exports: [CopyTradingService],
})
export class CopyTradingModule {}