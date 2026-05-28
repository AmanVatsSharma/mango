/**
 * File:        app/(admin-v2)/admin-v2/observability/page.tsx
 * Module:      admin-v2
 * Purpose:     Observability Dashboard route — live system health across all platform services.
 *              All data fetching and rendering delegated to ObservabilityWorkbench.
 *
 * Exports:
 *   - default AdminV2ObservabilityRoute  — Next.js page default export
 *
 * Side-effects: none (data fetching delegated to workbench component).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import { ObservabilityWorkbench } from "@/components/admin-v2/observability"

export default function AdminV2ObservabilityRoute() {
  return <ObservabilityWorkbench />
}
