/**
 * File: components/trading/widgets/market-stats-widget.tsx
 * Module: components/trading/widgets
 * Purpose: Professional internal market breadth + performance stats widget.
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Computes advances/declines and average change from live quote-derived rows.
 * - Designed for quick market pulse visibility on dashboard Home tab.
 */

"use client"

import { useMemo } from "react"
import { BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { buildTickerWidgetRows } from "@/components/trading/widgets/market-widget-number-utils"
import {
  summarizeHomeMarketStats,
  type HomeTickerItem,
} from "@/components/trading/widgets/home-widget-data-utils"

interface MarketStatsWidgetProps {
  items: HomeTickerItem[]
}

export function MarketStatsWidget({ items }: MarketStatsWidgetProps) {
  const { quotes } = useMarketDataLive()

  const summary = useMemo(() => {
    const rows = buildTickerWidgetRows(items, quotes as Record<string, any> | undefined)
    return summarizeHomeMarketStats(rows)
  }, [items, quotes])

  const totalInstruments = summary.advances + summary.declines + summary.unchanged
  const breadth = summary.declines > 0 ? (summary.advances / summary.declines).toFixed(2) : "∞"

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4" />
          Market Stats
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalInstruments === 0 ? (
          <div className="text-xs text-muted-foreground">Market stats unavailable until quotes stream in.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border/50 bg-muted/40 p-2">
                <p className="text-muted-foreground">Advances</p>
                <p className="text-sm font-semibold text-green-600">{summary.advances}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/40 p-2">
                <p className="text-muted-foreground">Declines</p>
                <p className="text-sm font-semibold text-red-600">{summary.declines}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/40 p-2">
                <p className="text-muted-foreground">A/D Ratio</p>
                <p className="text-sm font-semibold text-foreground">{breadth}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/40 p-2">
                <p className="text-muted-foreground">Avg Change</p>
                <p
                  className={`text-sm font-semibold ${
                    summary.averageChangePct >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {summary.averageChangePct >= 0 ? "+" : ""}
                  {summary.averageChangePct.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <p className="text-muted-foreground">
                Best:{" "}
                <span className="font-semibold text-foreground">
                  {summary.bestPerformer?.label || "—"}{" "}
                  {summary.bestPerformer ? `(${summary.bestPerformer.changePct.toFixed(2)}%)` : ""}
                </span>
              </p>
              <p className="text-muted-foreground">
                Worst:{" "}
                <span className="font-semibold text-foreground">
                  {summary.worstPerformer?.label || "—"}{" "}
                  {summary.worstPerformer ? `(${summary.worstPerformer.changePct.toFixed(2)}%)` : ""}
                </span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
