/**
 * File:        components/trading/widgets/time-and-sales.tsx
 * Module:      Trading · Widgets · Time & Sales
 * Purpose:     Tape-style scrolling list of executed trades. There is currently
 *              no real upstream T&S feed wired into this codebase — by default
 *              the widget renders an explicit "Feed not connected" empty state.
 *              An opt-in env flag (`NEXT_PUBLIC_TIME_AND_SALES_DEMO=1`) enables
 *              a clearly-labelled simulated feed for demos / screenshots.
 *
 * Exports:
 *   - TimeAndSales — React FC, no props
 *
 * Depends on:
 *   - @/components/ui/card — Card primitives
 *   - lucide-react        — Clock + AlertTriangle icons
 *
 * Side-effects:
 *   - When demo mode is on, runs a 800ms setInterval producing synthetic ticks.
 *   - Cleared on unmount via the effect's return value.
 *
 * Key invariants:
 *   - Production builds NEVER show simulated trades labeled as live data.
 *     The simulator only runs when NEXT_PUBLIC_TIME_AND_SALES_DEMO === "1".
 *   - When the simulator is on, a persistent "DEMO • SIMULATED" banner is
 *     rendered so the data can never be misread as a real exchange tape.
 *   - When the simulator is off, an empty state explains the feed is not
 *     connected — operators can see the deficiency rather than discover it
 *     mid-trade.
 *
 * Read order:
 *   1. DEMO_MODE constant — feature gate
 *   2. TimeAndSales — render path (empty state vs simulator)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-naa: removed unconditional Math.random() simulator that
 *     rendered fabricated trades indistinguishable from a live tape. Now
 *     gated behind explicit env flag and labelled when active.
 */

"use client"

import React, { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Clock, AlertTriangle } from "lucide-react"

interface Tick {
  id: string
  time: string
  price: number
  size: number
  aggressor: "buy" | "sell"
}

// Off by default. Set NEXT_PUBLIC_TIME_AND_SALES_DEMO=1 in dev/.env.local to
// re-enable the synthetic feed. Hidden behind an env check rather than a
// runtime toggle so prod bundles can tree-shake the simulator out entirely.
const DEMO_MODE = process.env.NEXT_PUBLIC_TIME_AND_SALES_DEMO === "1"

export const TimeAndSales: React.FC = () => {
  const [ticks, setTicks] = useState<Tick[]>([])

  useEffect(() => {
    if (!DEMO_MODE) return

    const generateTick = () => {
      const price = 22000 + Math.random() * 50 - 25
      const size = Math.floor(Math.random() * 200) + 1
      const aggressor: Tick["aggressor"] = Math.random() > 0.5 ? "buy" : "sell"
      const time = new Date().toLocaleTimeString("en-IN", { hour12: false })

      const newTick: Tick = {
        id: Math.random().toString(36).slice(2, 11),
        time,
        price: Number(price.toFixed(2)),
        size,
        aggressor,
      }

      setTicks((prev) => [newTick, ...prev].slice(0, 50))
    }

    const interval = setInterval(generateTick, 800)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="border-border/50 bg-card shadow-sm rounded-md overflow-hidden flex flex-col h-full max-h-[320px]">
      <CardHeader className="p-3 pb-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">Time &amp; Sales</CardTitle>
          {DEMO_MODE && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-sm bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400"
              title="Synthetic ticks generated client-side. Do not use for trading decisions."
            >
              <AlertTriangle className="h-3 w-3" />
              Demo &middot; Simulated
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col text-xs font-mono">
        {!DEMO_MODE ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
            <AlertTriangle className="h-5 w-5 opacity-60" />
            <p className="font-semibold">Tape feed not connected</p>
            <p className="opacity-70 max-w-[220px]">
              No trade-by-trade upstream is configured for this instrument. Live ticks will appear here when a feed is wired.
            </p>
          </div>
        ) : (
          <>
            <div className="flex bg-muted/50 px-3 py-1.5 border-b border-border/50">
              <span className="flex-1 text-muted-foreground font-semibold">TIME</span>
              <span className="flex-1 text-right text-muted-foreground font-semibold">PRICE</span>
              <span className="flex-1 text-right text-muted-foreground font-semibold">SIZE</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-[1px]">
              {ticks.map((tick) => (
                <div
                  key={tick.id}
                  className={`flex px-2 py-0.5 rounded-sm bg-muted/10 hover:bg-muted/30 transition-colors
                    ${tick.aggressor === "buy" ? "text-green-500" : "text-red-500"}`}
                >
                  <span className="flex-1 opacity-70">{tick.time}</span>
                  <span className="flex-1 text-right font-bold">{tick.price.toFixed(2)}</span>
                  <span className="flex-1 text-right opacity-90">{tick.size}</span>
                </div>
              ))}
              {ticks.length === 0 && (
                <div className="text-center text-muted-foreground p-4 text-xs opacity-50 italic">
                  Waiting for simulated ticks…
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
