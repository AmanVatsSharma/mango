/**
 * @file app/(main)/dashboard/error.tsx
 * @module app/(main)/dashboard
 * @description Next.js App Router segment error boundary for the dashboard route.
 *
 *   Users must almost never see the red "Application Error" card on the dashboard.
 *   Every error is escalated silently:
 *     1. ChunkLoadErrors → dedicated chunk-recovery reload (existing flow).
 *     2. Any other error → dashboard-error-recovery: silent reset() × N, then full
 *        reload × M, then finally fall back to TradingErrorDisplay.
 *   The user sees only the loading spinner during attempts 1..N+M.
 * @author StockTrade
 * @created 2026-04-12
 * @updated 2026-04-24
 */

"use client"

import { useEffect, useState } from "react"
import { TradingErrorDisplay } from "@/components/trading/TradingErrorDisplay"
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler"
import { DashboardAutoRecoverOverlay } from "@/components/trading/DashboardAutoRecoverOverlay"
import {
  isChunkLoadError,
  prepareChunkLoadRecovery,
} from "@/lib/navigation/chunk-load-recovery"
import {
  prepareDashboardErrorRecovery,
  type DashboardErrorRecoveryAction,
} from "@/lib/navigation/dashboard-error-recovery"

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

type RecoveryState =
  | { kind: "chunk_reload" }
  | { kind: "chunk_give_up" }
  | { kind: "auto_silent" }
  | { kind: "auto_reload" }
  | { kind: "give_up" }
  | null

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const [state, setState] = useState<RecoveryState>(null)

  useEffect(() => {
    // Log once so we can still diagnose recurring crashes even when auto-recovery hides them.
    console.error("[DASHBOARD-ERROR]", error?.message, error?.stack)

    if (isChunkLoadError(error)) {
      const outcome = prepareChunkLoadRecovery()
      setState({ kind: outcome === "reload" ? "chunk_reload" : "chunk_give_up" })
      return
    }

    const action: DashboardErrorRecoveryAction = prepareDashboardErrorRecovery()
    if (action === "silent_retry") {
      setState({ kind: "auto_silent" })
    } else if (action === "hard_reload") {
      setState({ kind: "auto_reload" })
    } else {
      setState({ kind: "give_up" })
    }
  }, [error])

  if (state === null) {
    // First render (before effect runs): show the spinner instead of flashing the error card.
    return <DashboardAutoRecoverOverlay mode="silent_retry" />
  }

  if (state.kind === "chunk_reload") {
    return <ChunkLoadErrorHandler giveUp={false} />
  }

  if (state.kind === "chunk_give_up") {
    return <ChunkLoadErrorHandler giveUp={true} />
  }

  if (state.kind === "auto_silent") {
    return <DashboardAutoRecoverOverlay mode="silent_retry" onSilentRetry={reset} />
  }

  if (state.kind === "auto_reload") {
    return <DashboardAutoRecoverOverlay mode="hard_reload" />
  }

  // All auto-recovery attempts exhausted — last resort: show the professional error card.
  return (
    <TradingErrorDisplay
      error={error}
      onRetry={reset}
      showTechnicalDetails={process.env.NODE_ENV === "development"}
    />
  )
}
