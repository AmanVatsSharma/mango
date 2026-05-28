/**
 * File:        app/(main)/dashboard/page.tsx
 * Module:      Dashboard · Route entry (server component)
 * Purpose:     Server-rendered shell that streams the loading skeleton immediately
 *              and only hydrates the interactive TradingDashboard client child below.
 *              Reads ?_debug from props (server) instead of useSearchParams (client) so
 *              the route is no longer fully client-rendered — first paint cuts the
 *              session-check + JS-download stages off the critical path.
 *
 * Exports:
 *   - default DashboardPage({ searchParams }) — server component
 *
 * Depends on:
 *   - @/components/trading/dashboard-client — client-only ErrorBoundary + TradingDashboard
 *   - @/components/trading/dashboard-route-fallback — suspense skeleton with watchdog
 *
 * Side-effects: none at the route level
 *
 * Key invariants:
 *   - DO NOT add "use client" here. The whole point of this file is to remain a server
 *     component so the route's HTML can stream before the dashboard JS chunks download.
 *
 * Read order:
 *   1. DashboardPage — server entry
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { Suspense } from "react"
import { DashboardClient } from "@/components/trading/dashboard-client"
import { DashboardRouteFallback } from "@/components/trading/dashboard-route-fallback"

type DashboardSearchParams = {
  _debug?: string
  tab?: string
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams
}) {
  const debugMode = searchParams?._debug === "1"

  return (
    <Suspense fallback={<DashboardRouteFallback />}>
      <DashboardClient debugMode={debugMode} />
    </Suspense>
  )
}
