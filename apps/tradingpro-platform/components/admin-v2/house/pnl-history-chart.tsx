/**
 * @file components/admin-v2/house/pnl-history-chart.tsx
 * @module admin-v2/house
 * @description Broker realised P&L history — bar chart with tonal bars (gain/loss per bucket).
 *              Uses native SVG instead of Recharts to keep the bundle lean here; Phase 15
 *              reporting suite will introduce richer chart components.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatInr } from "@/lib/admin-v2/api-client"
import type { HousePnlSeriesPoint } from "./types"

interface PnlHistoryChartProps {
  points: HousePnlSeriesPoint[]
  isLoading?: boolean
}

export function PnlHistoryChart({ points, isLoading }: PnlHistoryChartProps) {
  const [hovered, setHovered] = React.useState<HousePnlSeriesPoint | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-[var(--v2-text-mute)]">
        Loading…
      </div>
    )
  }

  if (!points.length) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-[var(--v2-text-mute)]">
        No realised P&L in this window yet
      </div>
    )
  }

  const max = Math.max(1, ...points.map((p) => Math.abs(p.brokerPnl)))
  const totalBuckets = points.length
  const barWidth = `${100 / totalBuckets}%`

  return (
    <div className="relative">
      <div className="flex h-44 items-end gap-[2px]">
        {points.map((p) => {
          const positive = p.brokerPnl >= 0
          const heightPct = (Math.abs(p.brokerPnl) / max) * 100
          return (
            <button
              key={p.bucket}
              type="button"
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
              className="group relative flex h-full flex-col items-center justify-end"
              style={{ width: barWidth, minWidth: 4 }}
              aria-label={`${p.bucket}: ${formatInr(p.brokerPnl)}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm transition-all duration-200 group-hover:brightness-125",
                  positive ? "bg-[var(--v2-gain)]/80" : "bg-[var(--v2-loss)]/80",
                )}
                style={{ height: `${heightPct}%`, minHeight: p.brokerPnl !== 0 ? 2 : 0 }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--v2-text-faint)]">
        <span>{points[0]?.bucket}</span>
        <span>{points[points.length - 1]?.bucket}</span>
      </div>
      {hovered ? (
        <div className="pointer-events-none absolute -top-1 right-0 rounded-md border border-white/[0.08] bg-[var(--v2-bg-elev-2)] px-3 py-1.5 text-xs shadow-lg">
          <div className="font-mono text-[10px] text-[var(--v2-text-faint)]">{hovered.bucket}</div>
          <div
            className={cn(
              "v2-num font-semibold",
              hovered.brokerPnl >= 0 ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
            )}
          >
            {formatInr(hovered.brokerPnl)}
          </div>
          <div className="text-[10px] text-[var(--v2-text-mute)]">{hovered.trades} trades</div>
        </div>
      ) : null}
    </div>
  )
}
