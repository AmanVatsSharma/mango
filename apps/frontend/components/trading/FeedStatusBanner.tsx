/**
 * File:        components/trading/FeedStatusBanner.tsx
 * Module:      Trading · Feed Status Banner
 * Purpose:     Slim top banner shown when WebSocket feed is DEGRADED, STALE, or OFFLINE.
 *              Slides in when status deteriorates, shows green recovery flash on reconnect.
 *
 * Exports:
 *   - FeedStatusBanner() — renders null when LIVE (no DOM node in the happy path)
 *
 * Depends on:
 *   - @/lib/market-data/hooks/useFeedStatus — FeedStatus state machine
 *   - @/lib/utils — cn()
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Returns null when status === "LIVE" — no DOM node in the happy path
 *   - "Live ✓" recovery flash is shown for 1500ms then clears
 *   - DEGRADED = grace window (market orders still allowed) → amber, no market-order warning
 *   - STALE = >30s disconnected → amber with market-order disabled warning
 *
 * Read order:
 *   1. FeedStatusBanner — JSX
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import React from "react"
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"
import { cn } from "@/lib/utils"

export function FeedStatusBanner() {
  const { status, disconnectedSinceMs } = useFeedStatus()
  const [showRecovery, setShowRecovery] = React.useState(false)
  const prevStatusRef = React.useRef(status)

  React.useEffect(() => {
    if (prevStatusRef.current !== "LIVE" && status === "LIVE") {
      setShowRecovery(true)
      const id = setTimeout(() => setShowRecovery(false), 1_500)
      return () => clearTimeout(id)
    }
    prevStatusRef.current = status
  }, [status])

  if (status === "LIVE" && !showRecovery) return null

  if (showRecovery) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-emerald-900/60 border-b border-emerald-700 text-emerald-300">
        <span>✓ Live feed restored</span>
      </div>
    )
  }

  const ageSeconds = disconnectedSinceMs ? Math.floor(disconnectedSinceMs / 1000) : null

  if (status === "OFFLINE") {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-red-950 border-b border-red-800 text-red-300">
        <span>✗ No connection — trading paused</span>
      </div>
    )
  }

  const message =
    status === "STALE"
      ? `⚡ Feed paused${ageSeconds ? ` (${ageSeconds}s)` : ""} — market orders disabled`
      : `⚡ Reconnecting… prices may be delayed`

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-xs font-semibold border-b",
        "bg-amber-950 border-amber-800 text-amber-300"
      )}
    >
      <span>{message}</span>
      {ageSeconds !== null && <span className="text-amber-600 tabular-nums">{ageSeconds}s</span>}
    </div>
  )
}
