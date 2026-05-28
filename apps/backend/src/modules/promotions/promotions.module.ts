/**
 * File:        apps/backend/src/modules/promotions/promotions.module.ts
 * Module:      promotions
 * Purpose:     Promotions module — campaign CRUD and announcement triggers
 *
 * Exports:
 *   - PromotionsService — promotion management
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
import { PromotionEntity } from './entities/promotion.entity';
import { PromotionsService } from './services/promotions.service';
import { PromotionsController } from './controllers/promotions.controller';
import { PromotionsResolver } from './promotions.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([PromotionEntity]),
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsResolver],
  exports: [PromotionsService],
})
export class PromotionsModule {}