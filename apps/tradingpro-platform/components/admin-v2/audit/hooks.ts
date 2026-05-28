/**
 * File:        components/admin-v2/audit/hooks.ts
 * Module:      admin-v2/audit
 * Purpose:     SWR hook for the Phase 15 Audit Workbench. Builds the fully-qualified
 *              query string from committed AuditFilters so the SWR key changes exactly
 *              when the user submits a new search — not on every keystroke.
 *
 * Exports:
 *   - useAuditLogs(filters) — SWR hook returning paginated AuditResp
 *
 * Depends on:
 *   - @/lib/admin-v2/api-client — jsonFetcher, withQuery
 *
 * Side-effects:
 *   - Network: GET /api/admin/audit on mount + when filters change
 *
 * Key invariants:
 *   - withQuery omits undefined values — empty filters don't bloat the URL
 *   - refreshInterval 60s: audit logs are not real-time; frequent refresh not needed
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type { AuditFilters, AuditResp } from "./types"

export function useAuditLogs(filters: AuditFilters) {
  const key = withQuery("/api/admin/audit", {
    source: filters.source,
    severity: filters.severity,
    action: filters.action || undefined,
    clientId: filters.clientId || undefined,
    resource: filters.resource || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    page: filters.page !== 1 ? String(filters.page) : undefined,
    limit: String(filters.limit),
  })
  return useSWR<AuditResp>(key, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}
