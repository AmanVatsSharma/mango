/**
 * @file components/admin-v2/house/exposure-heatmap.tsx
 * @module admin-v2/house
 * @description Top exposures grid — symbols sized by abs notional, coloured by net direction.
 *              Premium implementation: each cell is a glass tile with gradient border tinted by
 *              tone, IBM Plex Mono numerics, hover-reveal of broker P&L. Renders nothing if the
 *              book is empty (parent's job to show empty-state).
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatInr } from "@/lib/admin-v2/api-client"
import type { SymbolExposure } from "./types"

interface ExposureHeatmapProps {
  rows: SymbolExposure[]
  /** Total absolute notional for the % share calc. Use snapshot.grossNotional. */
  total: number
}

export function ExposureHeatmap({ rows, total }: ExposureHeatmapProps) {
  if (rows.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => {
        const sharePct = total > 0 ? (row.absNotional / total) * 100 : 0
        const positive = row.brokerUnrealizedPnl >= 0
        const direction =
          row.netQuantity > 0 ? "broker SHORT" : row.netQuantity < 0 ? "broker LONG" : "flat"
        const tone = positive
          ? "border-[rgba(16,233,160,0.25)] bg-[var(--v2-gain-soft)]"
          : "border-[rgba(255,77,107,0.25)] bg-[var(--v2-loss-soft)]"
        const accent = positive ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]"

        return (
          <div
            key={row.symbol}
            className={cn(
              "v2-card group relative overflow-hidden p-3 transition-all hover:translate-y-[-1px]",
              tone,
            )}
            title={`${row.symbol} · ${direction} · ${row.clientCount} clients`}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-100 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-40"
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-semibold text-[var(--v2-text)]">
                  {row.symbol}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  {direction}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border border-white/[0.06] bg-black/20 px-1.5 py-0.5 font-mono text-[10px]",
                  accent,
                )}
              >
                {sharePct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Notional
                </div>
                <div className="v2-num text-sm font-semibold text-[var(--v2-text)]">
                  {formatInr(row.absNotional)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Broker P&L
                </div>
                <div className={cn("v2-num text-sm font-semibold", accent)}>
                  {formatInr(row.brokerUnrealizedPnl)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-[var(--v2-text-mute)]">
              {row.clientCount} {row.clientCount === 1 ? "client" : "clients"} ·{" "}
              <span className="font-mono">{Math.abs(row.netQuantity).toLocaleString("en-IN")}</span>{" "}
              qty
            </div>
          </div>
        )
      })}
    </div>
  )
}
