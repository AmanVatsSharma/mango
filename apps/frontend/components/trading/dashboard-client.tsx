/**
 * File:        components/trading/dashboard-client.tsx
 * Module:      Dashboard · Client boundary
 * Purpose:     Thin client wrapper that combines ErrorBoundary + TradingDashboard so the
 *              route entry (`app/(main)/dashboard/page.tsx`) can remain a server component.
 *              Carries the `debugMode` flag forward — page.tsx now reads it from
 *              searchParams server-side instead of useSearchParams.
 *
 * Exports:
 *   - DashboardClient({ debugMode }) — props: debugMode boolean
 *
 * Depends on:
 *   - @/components/trading/TradingDashboard — main interactive dashboard
 *   - @/components/error-boundary — auto-recover wrapper
 *
 * Side-effects: none at module scope; ErrorBoundary handles error events
 *
 * Key invariants:
 *   - Stays minimal so the server shell can stream early while this client child hydrates
 *
 * Read order:
 *   1. DashboardClient — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

"use client"

import TradingDashboard from "@/components/trading/TradingDashboard"
import { ErrorBoundary } from "@/components/error-boundary"

export function DashboardClient({ debugMode }: { debugMode: boolean }) {
  return (
    <ErrorBoundary
      autoRecover
      showTechnicalDetails={debugMode || process.env.NODE_ENV === "development"}
    >
      <TradingDashboard />
    </ErrorBoundary>
  )
}
