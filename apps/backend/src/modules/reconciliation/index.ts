/**
 * File:        apps/backend/src/modules/reconciliation/index.ts
 * Module:      reconciliation
 * Purpose:     Public barrel for reconciliation module — entities, DTOs, service.
 *
 * Exports:
 *   - ReconciliationModule
 *   - ReconciliationService
 *   - ReconciliationBreakEntity, BreakType, BreakStatus
 *   - LpStatementLineEntity
 *   - CreateReconciliationBreakDto
 *   - ImportStatementDto, LpStatementLineDto, RunReconciliationDto
 *
 * Depends on: none
 * Side-effects: none
 * Key invariants: none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

export * from './reconciliation.module';
export * from './services/reconciliation.service';
export * from './entities/reconciliation-break.entity';
export * from './entities/lp-statement-line.entity';
export * from './dtos/create-reconciliation-break.dto';
export * from './dtos/import-statement.dto';
