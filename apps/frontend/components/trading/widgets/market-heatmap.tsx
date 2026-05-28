/**
 * @file market-heatmap.tsx
 * @module components/trading/widgets
 * @description Internal market heatmap from watchlist + index tokens (no external scripts).
 * @author StockTrade
 * @created 2026-01-24
 */

"use client"

import React, { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { buildTickerWidgetRows } from "@/components/trading/widgets/market-widget-number-utils"

export type HeatmapItem = {
  label: string
  token: number
}

type MarketHeatmapProps = {
  items: HeatmapItem[]
}

export function MarketHeatmap({ items }: MarketHeatmapProps) {
  const { quotes } = useMarketDataLive()

  const rows = useMemo(() => {
    return buildTickerWidgetRows(items, quotes as Record<string, any> | undefined)
  }, [items, quotes])

  const colorClass = (pct: number) => {
    if (pct >= 2) return "bg-green-600/20 border-green-600/30 text-green-700 dark:text-green-200"
    if (pct >= 0.3) return "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-200"
    if (pct <= -2) return "bg-red-600/20 border-red-600/30 text-red-700 dark:text-red-200"
    if (pct <= -0.3) return "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-200"
    return "bg-muted/40 border-border/50 text-muted-foreground"
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Market Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No heatmap data yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {rows.slice(0, 12).map((r) => (
              <div
                key={r.token}
                className={`rounded-lg border p-3 transition-colors ${colorClass(r.changePct)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold truncate">{r.label}</div>
                  <div className="text-[10px] font-semibold">
                    {r.changePct >= 0 ? "+" : ""}
                    {r.changePct.toFixed(2)}%
                  </div>
                </div>
                <div className="mt-1 text-sm font-mono font-bold tabular-nums">₹{r.ltp.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

