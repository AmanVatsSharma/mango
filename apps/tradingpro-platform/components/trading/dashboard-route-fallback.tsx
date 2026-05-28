/**
 * @file dashboard-route-fallback.tsx
 * @module components/trading
 * @description Suspense fallback for /dashboard with 5s full-page reload watchdog (shared cap with session recovery).
 * @author StockTrade
 * @created 2026-03-30
 */

"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  clearDashboardLoadRecoveryCounter,
  DASHBOARD_LOAD_STUCK_MS,
  prepareDashboardLoadRecoveryReload,
} from "@/lib/navigation/dashboard-load-recovery"

export function DashboardRouteFallback() {
  const [routeGiveUp, setRouteGiveUp] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (prepareDashboardLoadRecoveryReload() === "reload") {
        window.location.reload()
        return
      }
      setRouteGiveUp(true)
    }, DASHBOARD_LOAD_STUCK_MS)

    return () => window.clearTimeout(timeoutId)
  }, [])

  if (routeGiveUp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/85 p-6 text-center shadow-sm backdrop-blur-md space-y-4">
          <p className="text-base font-medium text-foreground">Dashboard is taking too long to load.</p>
          <p className="text-sm text-muted-foreground">
            Auto-refresh was tried several times. You can retry with a full reload.
          </p>
          <Button
            type="button"
            onClick={() => {
              clearDashboardLoadRecoveryCounter()
              window.location.reload()
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/85 p-6 text-center shadow-sm backdrop-blur-md">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
        <p className="font-medium text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        <p className="mt-1 text-xs text-muted-foreground">Preparing your trading workspace.</p>
      </div>
    </div>
  )
}
