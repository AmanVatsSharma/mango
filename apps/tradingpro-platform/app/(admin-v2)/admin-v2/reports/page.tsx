/**
 * File:        app/(admin-v2)/admin-v2/reports/page.tsx
 * Module:      admin-v2
 * Purpose:     Financial Reports Workbench route — period-driven fund flow + brokerage view.
 *              Mounted under the v2 shell. All data fetching happens inside ReportsWorkbench.
 *
 * Exports:
 *   - default AdminV2ReportsRoute  — Next.js page default export
 *
 * Side-effects: none (data fetching delegated to workbench component).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import { ReportsWorkbench } from "@/components/admin-v2/reports"

export default function AdminV2ReportsRoute() {
  return <ReportsWorkbench />
}
