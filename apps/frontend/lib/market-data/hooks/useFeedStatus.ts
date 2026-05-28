/**
 * File:        lib/market-data/hooks/useFeedStatus.ts
 * Module:      Market Data · Feed Status
 * Purpose:     Derives a 4-level feed quality status from WebSocket connection state
 *              + navigator.onLine. Used by FeedStatusBanner and order guards.
 *
 * Exports:
 *   - FeedStatus — "LIVE" | "DEGRADED" | "STALE" | "OFFLINE"
 *   - FeedStatusInfo — { status, disconnectedSinceMs }
 *   - useFeedStatus() → FeedStatusInfo — React hook
 *   - deriveFeedStatus(args) → FeedStatus — pure state machine (exported for testing)
 *
 * Depends on:
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — useMarketDataLive()
 *   - @/lib/market-data/constants — FEED_DEGRADED_ESCALATION_MS
 *
 * Side-effects: setInterval (1s tick for UI counter update)
 *
 * Key invariants:
 *   - OFFLINE takes precedence over WS state — network is more fundamental than socket
 *   - DEGRADED = WS reconnecting within 30s grace window — market orders still allowed
 *   - STALE = WS down >30s — market orders blocked
 *   - disconnectedSinceMs is null when LIVE; otherwise ms since first non-connected event
 *
 * Read order:
 *   1. FeedStatus / FeedStatusInfo — types
 *   2. deriveFeedStatus — pure logic (testable without React)
 *   3. useFeedStatus — React wrapper
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { FEED_DEGRADED_ESCALATION_MS } from "@/lib/market-data/constants"
import type { ConnectionState } from "@/lib/market-data/providers/types"

export type FeedStatus = "LIVE" | "DEGRADED" | "STALE" | "OFFLINE"

export interface FeedStatusInfo {
  status: FeedStatus
  /** null when LIVE; otherwise ms since the connection first dropped */
  disconnectedSinceMs: number | null
}

interface DeriveFeedStatusArgs {
  isConnected: ConnectionState
  isOffline: boolean
  disconnectedMs: number
}

export function deriveFeedStatus({ isConnected, isOffline, disconnectedMs }: DeriveFeedStatusArgs): FeedStatus {
  if (isOffline) return "OFFLINE"
  if (isConnected === "connected") return "LIVE"
  if (disconnectedMs >= FEED_DEGRADED_ESCALATION_MS) return "STALE"
  return "DEGRADED"
}

export function useFeedStatus(): FeedStatusInfo {
  const { isConnected } = useMarketDataLive()
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  )
  const [tick, setTick] = useState(0)
  const disconnectedSinceRef = useRef<number | null>(null)

  useEffect(() => {
    if (isConnected === "connected") {
      disconnectedSinceRef.current = null
    } else if (disconnectedSinceRef.current === null) {
      disconnectedSinceRef.current = Date.now()
    }
  }, [isConnected])

  // 1-second ticker so disconnectedSinceMs stays current in the UI
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  void tick

  const disconnectedMs = disconnectedSinceRef.current ? Date.now() - disconnectedSinceRef.current : 0
  const status = deriveFeedStatus({ isConnected, isOffline, disconnectedMs })

  return {
    status,
    disconnectedSinceMs: status === "LIVE" ? null : disconnectedMs,
  }
}
