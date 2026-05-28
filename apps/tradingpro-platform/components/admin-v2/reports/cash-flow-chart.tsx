/**
 * @file components/admin-v2/reports/cash-flow-chart.tsx
 * @module admin-v2/reports
 * @description Grouped bar chart — deposits (gain) vs withdrawals (loss) per time bucket.
 *              Pure SVG/DOM; no Recharts dependency. Matches the PnlHistoryChart aesthetic
 *              from house/pnl-history-chart.tsx.
 *
 * Exports:
 *   - CashFlowChart({ points, isLoading })
 *
 * @author StockTrade
 * @created 2026-04-30
 */

"use client"

import * as React from "react"
import { formatInr } from "@/lib/admin-v2/api-client"
import type { TimeSeriesPoint } from "./types"

interface CashFlowChartProps {
  points: TimeSeriesPoint[]
  isLoading?: boolean
}

export function CashFlowChart({ points, isLoading }: CashFlowChartProps) {
  const [hovered, setHovered] = React.useState<TimeSeriesPoint | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-[var(--v2-text-mute)]">
        Loading…
      </div>
    )
  }
  if (!points.length) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-[var(--v2-text-mute)]">
        No fund-flow data in this window
      </div>
    )
  }

  const max = Math.max(1, ...points.flatMap((p) => [p.deposits, p.withdrawals]))
  const barGroupWidth = `${100 / points.length}%`

  return (
    <div className="relative">
      {/* Legend */}
      <div className="mb-3 flex items-center gap-4 text-[10px] text-[var(--v2-text-mute)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-[var(--v2-gain)]/70" />
          Deposits
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-[var(--v2-loss)]/70" />
          Withdrawals
        </span>
      </div>

      <div className="flex h-52 items-end gap-[1px]">
        {points.map((p) => {
          const depH = (p.deposits / max) * 100
          const wdlH = (p.withdrawals / max) * 100
          return (
            <div
              key={p.bucket}
              className="group relative flex flex-1 items-end gap-[1px]"
              style={{ width: barGroupWidth }}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Deposits bar */}
              <div
                className="flex-1 rounded-t-sm bg-[var(--v2-gain)]/70 transition-all duration-150 group-hover:bg-[var(--v2-gain)]"
                style={{ height: `${depH}%`, minHeight: p.deposits > 0 ? 2 : 0 }}
                aria-label={`Deposits ${p.bucket}: ${formatInr(p.deposits)}`}
              />
              {/* Withdrawals bar */}
              <div
                className="flex-1 rounded-t-sm bg-[var(--v2-loss)]/70 transition-all duration-150 group-hover:bg-[var(--v2-loss)]"
                style={{ height: `${wdlH}%`, minHeight: p.withdrawals > 0 ? 2 : 0 }}
                aria-label={`Withdrawals ${p.bucket}: ${formatInr(p.withdrawals)}`}
              />
            </div>
          )
        })}
      </div>

      {/* Axis labels */}
      <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--v2-text-faint)]">
        <span>{points[0]?.bucket}</span>
        <span>{points[Math.floor(points.length / 2)]?.bucket}</span>
        <span>{points[points.length - 1]?.bucket}</span>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="pointer-events-none absolute -top-1 right-0 rounded-md border border-white/[0.08] bg-[var(--v2-bg-elev-2)] px-3 py-2 text-xs shadow-lg">
          <div className="mb-1 font-mono text-[10px] text-[var(--v2-text-faint)]">
            {hovered.bucket}
          </div>
          <div className="flex items-center gap-1.5 text-[var(--v2-gain)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--v2-gain)]" />
            Dep: {formatInr(hovered.deposits)}
          </div>
          <div className="flex items-center gap-1.5 text-[var(--v2-loss)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--v2-loss)]" />
            Wdl: {formatInr(hovered.withdrawals)}
          </div>
        </div>
      )}
    </div>
  )
}
