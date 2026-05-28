/**
 * File:        apps/backend/src/modules/promotions/index.ts
 * Module:      promotions
 * Purpose:     Public exports for promotions module
 *
 * Exports:
 *   - PromotionsModule
 *   - PromotionsService
 *   - PromotionEntity
 *
 * Depends on:
 *   - none
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Module exports
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

export * from './promotions.module';
export * from './promotions.resolver';
export * from './services/promotions.service';
export * from './entities/promotion.entity';