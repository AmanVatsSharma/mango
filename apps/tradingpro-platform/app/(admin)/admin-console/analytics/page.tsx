/**
 * File:        app/(admin)/admin-console/analytics/page.tsx
 * Module:      Admin Console · Analytics route
 * Purpose:     Server entry that lazy-loads the recharts-heavy AdvancedAnalytics
 *              component on the client. Keeps recharts out of the route's
 *              first-load bundle and serves an SSR skeleton until the chart chunk loads.
 *
 * Exports:
 *   - default AnalyticsPage()
 *
 * Depends on:
 *   - @/components/admin-console/advanced-analytics — dynamic-imported
 *   - @/components/admin-console/admin-page-skeleton — SSR placeholder
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - DO NOT static-import AdvancedAnalytics here — that re-introduces recharts
 *     into the page chunk. Keep the dynamic() boundary.
 *
 * Read order:
 *   1. dynamic AdvancedAnalytics
 *   2. AnalyticsPage
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import dynamic from "next/dynamic"
import { AdminPageSkeleton } from "@/components/admin-console/admin-page-skeleton"

const AdvancedAnalytics = dynamic(
  () => import("@/components/admin-console/advanced-analytics").then((m) => ({ default: m.AdvancedAnalytics })),
  { ssr: false, loading: () => <AdminPageSkeleton /> },
)

export default function AnalyticsPage() {
  return <AdvancedAnalytics />
}
