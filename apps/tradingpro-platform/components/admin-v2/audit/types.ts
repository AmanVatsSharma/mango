/**
 * File:        components/admin-v2/audit/types.ts
 * Module:      admin-v2/audit
 * Purpose:     UI-side DTOs for the Phase 15 Audit Workbench. Mirrors the /api/admin/audit
 *              response shape — kept client-only so the component tree never imports
 *              server-only modules.
 *
 * Exports:
 *   - AuditSource           — "trading" | "auth"
 *   - AuditSeverity         — severity filter values
 *   - AuditRow              — single log entry from the API
 *   - AuditResp             — paginated API response wrapper
 *   - AuditFilters          — committed filter state passed to the SWR hook
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export type AuditSource = "trading" | "auth"

export type AuditSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL"

export interface AuditRow {
  id: string
  source: string
  timestamp: string
  userName: string | null
  clientId: string | null
  action: string
  message: string | null
  severity: string | null
  category: string | null
  status: string | null
  resource: string | null
  resourceId: string | null
  metadata?: Record<string, unknown> | null
}

export interface AuditResp {
  source: AuditSource
  logs: AuditRow[]
  total: number
  pages: number
  page: number
}

export interface AuditFilters {
  source: AuditSource
  severity?: AuditSeverity
  action?: string
  clientId?: string
  resource?: string
  dateFrom?: string
  dateTo?: string
  page: number
  limit: number
}
