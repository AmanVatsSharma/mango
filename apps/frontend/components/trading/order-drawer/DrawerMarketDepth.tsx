"use client"

/**
 * File:        components/trading/order-drawer/DrawerMarketDepth.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Expanded-snap content — 5-level market depth ladder, Day's Range slider, Open / Prev close / Volume strip.
 *              Modeled after Kite Zerodha's expanded sheet.
 *
 * Exports:
 *   - DrawerMarketDepth (props: { depth, dayRange, ohlc, volume, onShow20Depth? }) — the full expanded body
 *   - MarketDepthRow (internal, exported for testability) — one bid/ask row
 *
 * Depends on:
 *   - lib/utils (cn)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Always renders 5 bid + 5 ask rows even when depth is sparse (pads with zeros) so the layout never reflows mid-update — depth quotes are very chatty and reflow would jitter the UI.
 *   - Day's range slider position uses (ltp - low) / (high - low). When high == low, falls back to 50% (mid).
 *   - Total bid/ask quantity is shown as a footer row to mirror Kite's "Total" cells.
 *
 * Read order:
 *   1. DrawerMarketDepthProps + DepthLevel
 *   2. padDepth helper — guarantees 5-row stability
 *   3. JSX — depth grid, range slider, OHLC strip
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface DepthLevel {
  price: number
  quantity: number
  orders: number
}

export interface DrawerMarketDepthProps {
  depth?: {
    bid: DepthLevel[]
    ask: DepthLevel[]
  }
  /**
   * Best bid / ask — synthesized from LTP × spread when broker depth isn't available.
   * Used to populate row 1 of the ladder so the user always sees A/B values matching
   * what's shown in the watchlist row (which uses the same synthetic spread mechanism).
   */
  bestBid?: number | null
  bestAsk?: number | null
  dayRange?: {
    low: number | null
    high: number | null
    ltp: number | null
    prevClose: number | null
  }
  ohlc?: {
    open: number | null
    prevClose: number | null
    volume: number | null
  }
  onShow20Depth?: () => void
}

const EMPTY_LEVEL: DepthLevel = { price: 0, quantity: 0, orders: 0 }

/**
 * Guarantee exactly 5 rows so the grid never reflows when depth quotes update.
 * If the broker depth is empty AND we have a synthesized best bid/ask, populate
 * row 0 with that price (qty/orders unknown → 0). This mirrors what Kite shows.
 */
function padDepth(
  levels: DepthLevel[] | undefined,
  fallbackPrice?: number | null,
): DepthLevel[] {
  const safe = levels ?? []
  if (safe.length === 0 && fallbackPrice != null && Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
    return [
      { price: fallbackPrice, quantity: 0, orders: 0 },
      EMPTY_LEVEL,
      EMPTY_LEVEL,
      EMPTY_LEVEL,
      EMPTY_LEVEL,
    ]
  }
  return Array.from({ length: 5 }, (_, i) => safe[i] ?? EMPTY_LEVEL)
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return Math.trunc(v).toLocaleString("en-IN")
}

export function DrawerMarketDepth({
  depth,
  bestBid,
  bestAsk,
  dayRange,
  ohlc,
  onShow20Depth,
}: DrawerMarketDepthProps) {
  const bids = padDepth(depth?.bid, bestBid)
  const asks = padDepth(depth?.ask, bestAsk)
  const totalBidQty = bids.reduce((s, l) => s + (l.quantity || 0), 0)
  const totalAskQty = asks.reduce((s, l) => s + (l.quantity || 0), 0)

  // Day's range geometry
  const low = dayRange?.low ?? null
  const high = dayRange?.high ?? null
  const ltp = dayRange?.ltp ?? null
  const prev = dayRange?.prevClose ?? null
  const rangeValid = low != null && high != null && high > low
  const ltpPct = rangeValid && ltp != null ? Math.min(100, Math.max(0, ((ltp - low!) / (high! - low!)) * 100)) : 50
  const prevPct = rangeValid && prev != null ? Math.min(100, Math.max(0, ((prev - low!) / (high! - low!)) * 100)) : 50

  return (
    <div className="space-y-5 px-5 pb-5">
      {/* Depth ladder — Bid columns (3) | Ask columns (3) */}
      <div>
        <div className="grid grid-cols-6 gap-x-2 text-[11px] text-muted-foreground">
          <div>Bid</div>
          <div className="text-right">Orders</div>
          <div className="text-right">Qty</div>
          <div>Offer</div>
          <div className="text-right">Orders</div>
          <div className="text-right">Qty</div>
        </div>

        <div className="mt-1.5 space-y-0.5 text-xs font-mono tabular-nums">
          {bids.map((bid, i) => {
            // Match Kite reference: bid side in primary brand colour, ask side in rose.
            // (We avoid Tailwind's blue-* classes because globals.css remaps them to a pale brand tint.)
            const hasBid = bid.price > 0
            const hasAsk = asks[i].price > 0
            const bidActive = "text-primary"
            const askActive = "text-rose-500 dark:text-rose-400"
            return (
              <div key={i} className="grid grid-cols-6 gap-x-2 py-0.5">
                <span className={cn("font-medium", hasBid ? bidActive : "text-muted-foreground/50")}>
                  {fmtNum(bid.price)}
                </span>
                <span className={cn("text-right", hasBid ? `${bidActive} opacity-80` : "text-muted-foreground/50")}>
                  {fmtInt(bid.orders)}
                </span>
                <span className={cn("text-right", hasBid ? `${bidActive} opacity-80` : "text-muted-foreground/50")}>
                  {fmtInt(bid.quantity)}
                </span>
                <span className={cn("font-medium", hasAsk ? askActive : "text-muted-foreground/50")}>
                  {fmtNum(asks[i].price)}
                </span>
                <span className={cn("text-right", hasAsk ? `${askActive} opacity-80` : "text-muted-foreground/50")}>
                  {fmtInt(asks[i].orders)}
                </span>
                <span className={cn("text-right", hasAsk ? `${askActive} opacity-80` : "text-muted-foreground/50")}>
                  {fmtInt(asks[i].quantity)}
                </span>
              </div>
            )
          })}

          <div className="grid grid-cols-6 gap-x-2 border-t border-border pt-1.5 text-[11px] font-medium uppercase tracking-wide">
            <span className="text-primary">Total</span>
            <span />
            <span className="text-right text-primary">{fmtInt(totalBidQty)}</span>
            <span className="text-rose-500 dark:text-rose-400">Total</span>
            <span />
            <span className="text-right text-rose-500 dark:text-rose-400">{fmtInt(totalAskQty)}</span>
          </div>
        </div>

        {/* "Show 20 depth" — visual element matching Kite reference. Disabled (greyed) until a 20-depth
            handler is wired (paid-tier feature). When provided, becomes an active brand-coloured link. */}
        <button
          type="button"
          onClick={onShow20Depth}
          disabled={!onShow20Depth}
          className={cn(
            "mt-3 w-full rounded-md py-2 text-center text-xs font-semibold transition-colors",
            onShow20Depth
              ? "text-primary hover:bg-muted"
              : "cursor-not-allowed text-muted-foreground/60",
          )}
        >
          Show 20 depth
        </button>
      </div>

      {/* Day's range */}
      {rangeValid && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">Day&apos;s range</h3>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Low</span>
              <span>High</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between font-mono text-sm tabular-nums text-foreground">
              <span>{fmtNum(low)}</span>
              <span>{fmtNum(high)}</span>
            </div>
            <div className="relative mt-3 h-1 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 rounded-full bg-rose-500/80"
                style={{ left: `${prevPct}%`, width: `${Math.abs(ltpPct - prevPct)}%`, transform: prevPct > ltpPct ? "translateX(-100%)" : undefined, marginLeft: prevPct > ltpPct ? `${ltpPct - prevPct}%` : 0 }}
              />
              <div
                className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-rose-500 bg-background"
                style={{ left: `${ltpPct}%` }}
                title={`LTP ${fmtNum(ltp)}`}
              />
              {prev != null && (
                <div
                  className="absolute -top-0.5 h-2 w-0.5 -translate-x-1/2 bg-muted-foreground/60"
                  style={{ left: `${prevPct}%` }}
                  title={`Prev close ${fmtNum(prev)}`}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* OHLC strip */}
      {ohlc && (
        <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
          <Stat label="Open" value={fmtNum(ohlc.open)} />
          <Stat label="Prev. close" value={fmtNum(ohlc.prevClose)} />
          <Stat label="Volume" value={fmtInt(ohlc.volume)} align="right" />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}
