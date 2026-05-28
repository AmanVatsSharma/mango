/**
 * @file DashboardAutoRecoverOverlay.tsx
 * @module components/trading
 * @description Loading overlay shown while the dashboard silently auto-recovers from an
 *   error. Mirrors the look of `DashboardRouteFallback` / `loading.tsx` so the user just
 *   sees a consistent "Loading dashboard..." spinner instead of the red error card.
 *
 *   - mode="silent_retry": invokes `onSilentRetry` after SILENT_RETRY_DELAY_MS.
 *   - mode="hard_reload": calls `window.location.reload()` after HARD_RELOAD_DELAY_MS.
 * @author StockTrade
 * @created 2026-04-24
 */

"use client"

import { useEffect } from "react"
import {
  HARD_RELOAD_DELAY_MS,
  SAFETY_RELOAD_DELAY_MS,
  SILENT_RETRY_DELAY_MS,
} from "@/lib/navigation/dashboard-error-recovery"

interface DashboardAutoRecoverOverlayProps {
  mode: "silent_retry" | "hard_reload"
  onSilentRetry?: () => void
}

export function DashboardAutoRecoverOverlay({
  mode,
  onSilentRetry,
}: DashboardAutoRecoverOverlayProps) {
  useEffect(() => {
    if (mode === "silent_retry") {
      // With a callback, run the normal silent retry.
      if (onSilentRetry) {
        const id = window.setTimeout(() => {
          onSilentRetry()
        }, SILENT_RETRY_DELAY_MS)
        return () => window.clearTimeout(id)
      }
      // No callback: this overlay is acting as a loading placeholder while the parent
      // decides what to do. If the parent never advances within SAFETY_RELOAD_DELAY_MS,
      // fall through to a full reload instead of leaving the user stuck on the spinner.
      const safetyId = window.setTimeout(() => {
        window.location.reload()
      }, SAFETY_RELOAD_DELAY_MS)
      return () => window.clearTimeout(safetyId)
    }

    const id = window.setTimeout(() => {
      window.location.reload()
    }, HARD_RELOAD_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [mode, onSilentRetry])

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
