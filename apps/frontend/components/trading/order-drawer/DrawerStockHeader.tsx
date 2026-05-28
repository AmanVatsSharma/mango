"use client"

/**
 * File:        components/trading/order-drawer/DrawerStockHeader.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Sticky stock-identity strip rendered at the top of the order drawer in both peek and expanded snaps.
 *
 * Exports:
 *   - DrawerStockHeader (props: { stock, ltp, change, changePercent, holdingsQty? }) — renders SYMBOL · EXCHANGE · LTP · change · holdings badge
 *
 * Depends on:
 *   - lib/utils (cn) — class composition
 *   - lucide-react (Briefcase) — holdings icon
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - LTP and change are pre-resolved by the orchestrator from live quote → fallbacks; this component is pure presentational.
 *   - Holdings badge is hidden when holdingsQty is null/undefined (NOT when 0 — 0 still shows so user knows "you don't hold this").
 *
 * Read order:
 *   1. DrawerStockHeader props — wire shape
 *   2. JSX layout — left identity column, right price column
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

import * as React from "react"
import Image from "next/image"
import { Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"

function LogoAvatar({ src }: { src: string }) {
  const [errored, setErrored] = React.useState(false)
  if (errored) return null
  return (
    <div className="relative h-9 w-9 shrink-0 rounded-full overflow-hidden bg-muted/40 border border-border/30">
      <Image src={src} alt="" fill sizes="36px" className="object-contain p-0.5" onError={() => setErrored(true)} />
    </div>
  )
}

export interface DrawerStockHeaderProps {
  symbol: string
  exchange?: string | null
  ltp: number | null
  change: number | null
  changePercent: number | null
  holdingsQty?: number | null
  logo_url?: string | null
  /** Compact = expanded snap (less vertical breathing room since depth ladder is below). */
  compact?: boolean
}

export function DrawerStockHeader({
  symbol,
  exchange,
  ltp,
  change,
  changePercent,
  holdingsQty,
  logo_url,
  compact = false,
}: DrawerStockHeaderProps) {
  const hasChange = change != null && changePercent != null
  const isPositive = (change ?? 0) >= 0
  const priceColor = !hasChange
    ? "text-foreground"
    : isPositive
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400"

  return (
    <div
      className={cn(
        "shrink-0 px-5 bg-background/95 backdrop-blur-sm",
        compact ? "py-3" : "py-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {logo_url && <LogoAvatar src={logo_url} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {symbol}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {exchange && (
              <span className="font-medium uppercase tracking-wider">{exchange}</span>
            )}
            {hasChange && (
              <span className={cn("font-mono font-semibold tabular-nums", priceColor)}>
                {ltp != null ? ltp.toFixed(2) : "—"}
              </span>
            )}
            {hasChange && (
              <span className={cn("font-mono tabular-nums", priceColor)}>
                {isPositive ? "+" : ""}
                {change!.toFixed(2)} ({isPositive ? "+" : ""}
                {changePercent!.toFixed(2)}%)
              </span>
            )}
            {holdingsQty != null && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted"
                title="View holdings"
              >
                <Briefcase className="h-3.5 w-3.5" aria-hidden />
                <span className="tabular-nums">{holdingsQty}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
