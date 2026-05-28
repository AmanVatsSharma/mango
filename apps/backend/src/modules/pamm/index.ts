/**
 * File:        apps/backend/src/modules/pamm/index.ts
 * Module:      pamm
 * Purpose:     Public exports for PAMM module
 *
 * Exports:
 *   - PammModule
 *   - PammService
 *   - PamMMasterEntity
 *   - PamMSlaveEntity
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

export * from './pamm.module';
export * from './pamm.resolver';
export * from './services/pamm.service';
export * from './entities/pamm-master.entity';
export * from './entities/pamm-slave.entity';