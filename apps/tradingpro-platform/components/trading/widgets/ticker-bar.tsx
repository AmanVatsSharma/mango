/**
 * @file ticker-bar.tsx
 * @module components/trading/widgets
 * @description Lightweight internal ticker bar (no external scripts) fed by WebSocket market data.
 * @author StockTrade
 * @created 2026-01-24
 */

"use client"

import React, { useMemo } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { buildTickerWidgetRows } from "@/components/trading/widgets/market-widget-number-utils"

export type TickerItem = {
  label: string
  token: number
}

type TickerBarProps = {
  items: TickerItem[]
}

export function TickerBar({ items }: TickerBarProps) {
  const { quotes, isConnected } = useMarketDataLive()

  const rows = useMemo(() => {
    return buildTickerWidgetRows(items, quotes as Record<string, any> | undefined)
  }, [items, quotes])

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border/50 bg-card shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="text-xs font-semibold text-muted-foreground">Live Ticker</div>
        <Badge variant="secondary" className="text-[10px]">
          {isConnected === "connected" ? "LIVE" : isConnected === "connecting" ? "CONNECTING" : "OFFLINE"}
        </Badge>
      </div>
      <div className="flex gap-6 px-3 py-2 overflow-x-auto no-scrollbar">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-1">No quotes yet.</div>
        ) : (
          rows.map((r) => {
            const up = r.changePct >= 0
            return (
              <div key={r.token} className="flex items-center gap-2 min-w-[120px]">
                <div className="text-xs font-semibold">{r.label}</div>
                <div className="text-xs font-mono tabular-nums">₹{r.ltp.toFixed(2)}</div>
                <div className={`text-[10px] font-semibold flex items-center gap-0.5 ${up ? "text-green-600" : "text-red-600"}`}>
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {up ? "+" : ""}
                  {r.changePct.toFixed(2)}%
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

