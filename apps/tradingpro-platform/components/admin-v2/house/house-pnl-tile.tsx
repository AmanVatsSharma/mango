/**
 * @file components/admin-v2/house/house-pnl-tile.tsx
 * @module admin-v2/house
 * @description Hero KPI tile — broker live unrealised P&L. Tones gain/loss based on sign,
 *              tick animation on changes, IBM Plex Mono numerics. The single most important
 *              number in the broker's day.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react"
import { formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"

interface HousePnlTileProps {
  label: string
  amount: number | null | undefined
  isLoading?: boolean
  /** Smaller secondary tile (e.g., day P&L). Default false. */
  compact?: boolean
}

export function HousePnlTile({ label, amount, isLoading, compact }: HousePnlTileProps) {
  const value = amount ?? 0
  const positive = value >= 0
  const tone = positive
    ? {
        text: "text-[var(--v2-gain)]",
        chip: "bg-[var(--v2-gain-soft)] text-[var(--v2-gain)]",
        glow: "shadow-[0_0_40px_-12px_rgba(16,233,160,0.45)]",
      }
    : {
        text: "text-[var(--v2-loss)]",
        chip: "bg-[var(--v2-loss-soft)] text-[var(--v2-loss)]",
        glow: "shadow-[0_0_40px_-12px_rgba(255,77,107,0.45)]",
      }
  const ArrowIcon = positive ? ArrowUpRight : ArrowDownRight
  const TrendIcon = positive ? TrendingUp : TrendingDown

  return (
    <div
      className={cn(
        "v2-card relative overflow-hidden",
        compact ? "p-4" : "p-6",
        !isLoading && tone.glow,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full blur-3xl",
          positive ? "bg-[var(--v2-gain-soft)]" : "bg-[var(--v2-loss-soft)]",
        )}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-text-faint)]">
            {label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-white/[0.06] px-2 py-0.5 text-[10px] font-semibold",
              tone.chip,
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {positive ? "house +" : "house −"}
          </span>
        </div>
        <div
          className={cn(
            "v2-num-display mt-3 font-bold tracking-tight",
            compact ? "text-2xl" : "text-4xl",
            tone.text,
          )}
        >
          {isLoading ? "…" : formatInr(value)}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--v2-text-mute)]">
          <ArrowIcon className={cn("h-3.5 w-3.5", tone.text)} />
          <span>
            broker P&L = −Σ(client P&L) ·{" "}
            <span className="font-mono">live</span>
          </span>
        </div>
      </div>
    </div>
  )
}
