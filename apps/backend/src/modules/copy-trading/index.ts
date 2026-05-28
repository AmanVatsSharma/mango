/**
 * File:        apps/backend/src/modules/copy-trading/index.ts
 * Module:      copy-trading
 * Purpose:     Public exports for copy-trading module
 *
 * Exports:
 *   - CopyTradingModule
 *   - CopyTradingService
 *   - CopyTradingSignalEntity
 *   - CopyTradingSubscriptionEntity
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

export * from './copy-trading.module';
export * from './services/copy-trading.service';
export * from './entities/copy-trading-signal.entity';
export * from './entities/copy-trading-subscription.entity';
export * from './copy-trading.resolver';