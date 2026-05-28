/**
 * File:        app/(admin-v2)/admin-v2/audit/page.tsx
 * Module:      admin-v2
 * Purpose:     Audit log workbench route — Phase 15 full filterable view.
 *              Replaces the Phase 1 placeholder that rendered a bare log list with
 *              no filtering, pagination, drill-down, or export.
 *
 * Exports:
 *   - default AdminV2AuditRoute  — Next.js page default export
 *
 * Side-effects: none (data fetching delegated to AuditWorkbench).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import { AuditWorkbench } from "@/components/admin-v2/audit"

export default function AdminV2AuditRoute() {
  return <AuditWorkbench />
}
