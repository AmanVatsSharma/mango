/**
 * File:        apps/backend/src/modules/reports/index.ts
 * Module:      reports
 * Purpose:     Public exports for reports module
 *
 * Exports:
 *   - ReportsModule
 *   - ReportsService
 *   - ReportDefinitionEntity
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

export * from './reports.module';
export * from './reports.resolver';
export * from './services/reports.service';
export * from './entities/report-definition.entity';