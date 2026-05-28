/**
 * File:        components/admin-v2/audit/index.ts
 * Module:      admin-v2/audit
 * Purpose:     Barrel — public surface of the audit module.
 *
 * Exports:
 *   - AuditWorkbench    — main filterable workbench component
 *   - useAuditLogs      — SWR hook
 *   - AuditFilters, AuditRow, AuditResp, AuditSource, AuditSeverity  — types
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export { AuditWorkbench } from "./audit-workbench"
export { useAuditLogs } from "./hooks"
export type { AuditFilters, AuditRow, AuditResp, AuditSource, AuditSeverity } from "./types"
