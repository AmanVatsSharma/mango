/**
 * File:        apps/backend/src/modules/crm/index.ts
 * Module:      crm
 * Purpose:     Public exports for CRM module
 *
 * Exports:
 *   - CrmModule
 *   - CrmService
 *   - CrmOutreachEntity
 *   - CrmRetentionOfferEntity
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

export * from './crm.module';
export * from './crm.resolver';
export * from './services/crm.service';
export * from './entities/crm-outreach.entity';
export * from './entities/crm-retention-offer.entity';