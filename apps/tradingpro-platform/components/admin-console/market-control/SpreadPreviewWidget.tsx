/**
 * File:        components/admin-console/market-control/SpreadPreviewWidget.tsx
 * Module:      Admin Console · Market Control
 * Purpose:     Interactive Bid/Ask price preview showing the full stochastic range
 *              (min / avg / max spread) at a user-entered base price. Admin can type
 *              any LTP to see exact execution prices before committing a config change.
 *
 * Exports:
 *   - SpreadPreviewWidget(props) — compact 3-row price table with editable base price
 *
 * Depends on:
 *   - framer-motion — fade-in flash when min/max props change
 *   - @/lib/utils   — cn()
 *
 * Side-effects:
 *   - none (no API calls; all computation is local)
 *
 * Key invariants:
 *   - spread % values are plain percentages (e.g. 0.20 = 0.20%, NOT 20%)
 *   - half = spreadPct / 2 / 100  →  bid = base*(1-half), ask = base*(1+half)
 *   - basePrice prop sets the initial reference; user can override via input
 *
 * Read order:
 *   1. SpreadPreviewWidgetProps — input contract
 *   2. buildRows() — computation
 *   3. SpreadPreviewWidget — render
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-28
 */

"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface SpreadPreviewWidgetProps {
  /** Spread % minimum, e.g. 0.05 means 0.05% */
  min: number
  /** Spread % maximum, e.g. 0.20 means 0.20% */
  max: number
  /** Reference price — defaults to 1000; user can override via the inline input */
  basePrice?: number
}

interface Row {
  label: "Min" | "Avg" | "Max"
  spreadPct: number
  bid: number
  ask: number
}

function buildRows(min: number, max: number, base: number): Row[] {
  const avg = (min + max) / 2
  const toRow = (label: Row["label"], pct: number): Row => {
    const half = pct / 2 / 100
    return { label, spreadPct: pct, bid: base * (1 - half), ask: base * (1 + half) }
  }
  return [toRow("Min", min), toRow("Avg", avg), toRow("Max", max)]
}

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const rowAccent: Record<Row["label"], string> = {
  Min: "text-emerald-600 dark:text-emerald-400",
  Avg: "text-amber-600 dark:text-amber-400",
  Max: "text-rose-600 dark:text-rose-400",
}

export function SpreadPreviewWidget({ min, max, basePrice = 1000 }: SpreadPreviewWidgetProps) {
  const safeMin = Math.max(0, min)
  const safeMax = Math.max(safeMin, max)

  const [inputVal, setInputVal] = useState(String(basePrice))
  const [computedBase, setComputedBase] = useState(basePrice)

  const rows = buildRows(safeMin, safeMax, computedBase)

  function handleInputChange(raw: string) {
    setInputVal(raw)
    const n = parseFloat(raw)
    if (Number.isFinite(n) && n > 0) setComputedBase(n)
  }

  return (
    <motion.div
      key={`${safeMin}-${safeMax}`}
      initial={{ opacity: 0.4, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 px-3 py-2 space-y-1"
    >
      {/* Header + LTP input */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview @ ₹
        </span>
        <input
          type="number"
          min={1}
          step={10}
          value={inputVal}
          onChange={(e) => handleInputChange(e.target.value)}
          className="h-6 w-24 rounded border border-border bg-background px-1.5 text-right text-[11px] font-mono tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          aria-label="Reference price"
        />
        <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
          {safeMin.toFixed(2)}%–{safeMax.toFixed(2)}%
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/60" />

      {/* Price rows */}
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5 text-[11px]">
            {/* Row label */}
            <span className={cn("w-7 font-semibold shrink-0", rowAccent[row.label])}>
              {row.label}
            </span>

            {/* Bid */}
            <span className="font-mono tabular-nums text-rose-500 dark:text-rose-400">
              ₹{fmt(row.bid)}
            </span>

            {/* Spread arrow */}
            <span className="text-muted-foreground/50 text-[9px] font-mono shrink-0">
              ↔
            </span>

            {/* Ask */}
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              ₹{fmt(row.ask)}
            </span>

            {/* Spread % badge */}
            <span className="ml-auto text-[9px] font-mono text-muted-foreground/60 shrink-0">
              {row.spreadPct.toFixed(3)}%
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
