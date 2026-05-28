/**
 * File: components/trading/widgets/top-movers-widget.tsx
 * Module: components/trading/widgets
 * Purpose: Professional internal Top Movers widget for dashboard Home tab.
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Uses live WebSocket quotes through market-widget normalization utilities.
 * - Shows both top gainers and top losers without external embeds/logos.
 */

"use client"

import { useMemo } from "react"
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { buildTickerWidgetRows } from "@/components/trading/widgets/market-widget-number-utils"
import type { HomeTickerItem } from "@/components/trading/widgets/home-widget-data-utils"

interface TopMoversWidgetProps {
  items: HomeTickerItem[]
}

export function TopMoversWidget({ items }: TopMoversWidgetProps) {
  const { quotes } = useMarketDataLive()

  const { gainers, losers } = useMemo(() => {
    const rows = buildTickerWidgetRows(items, quotes as Record<string, any> | undefined)
    const sortedRows = [...rows].sort((a, b) => b.changePct - a.changePct)
    return {
      gainers: sortedRows.filter((row) => row.changePct > 0).slice(0, 5),
      losers: [...sortedRows].reverse().filter((row) => row.changePct < 0).slice(0, 5),
    }
  }, [items, quotes])

  const hasRows = gainers.length > 0 || losers.length > 0

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Top Movers</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRows ? (
          <div className="text-xs text-muted-foreground">No movers data yet.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-green-600">
                <TrendingUp className="h-3.5 w-3.5" />
                Top Gainers
              </div>
              <div className="space-y-2">
                {gainers.map((row) => (
                  <div key={`gainer-${row.token}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                      <ArrowUpRight className="h-3 w-3" />+{row.changePct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-red-600">
                <TrendingDown className="h-3.5 w-3.5" />
                Top Losers
              </div>
              <div className="space-y-2">
                {losers.map((row) => (
                  <div key={`loser-${row.token}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                      <ArrowDownRight className="h-3 w-3" />
                      {row.changePct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
