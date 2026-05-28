/**
 * File:        app/(admin)/admin-console/financial-reports/page.tsx
 * Module:      Admin Console · Financial Reports route
 * Purpose:     Server entry that lazy-loads the recharts-heavy FinancialReports
 *              component on the client. Keeps recharts out of the route's
 *              first-load bundle.
 *
 * Exports:
 *   - default FinancialReportsPage()
 *
 * Depends on:
 *   - @/components/admin-console/financial-reports — dynamic-imported
 *   - @/components/admin-console/admin-page-skeleton
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - DO NOT static-import FinancialReports here — keep the dynamic() boundary.
 *
 * Read order:
 *   1. dynamic FinancialReports
 *   2. FinancialReportsPage
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import dynamic from "next/dynamic"
import { AdminPageSkeleton } from "@/components/admin-console/admin-page-skeleton"

const FinancialReports = dynamic(
  () => import("@/components/admin-console/financial-reports").then((m) => ({ default: m.FinancialReports })),
  { ssr: false, loading: () => <AdminPageSkeleton /> },
)

export default function FinancialReportsPage() {
  return <FinancialReports />
}
