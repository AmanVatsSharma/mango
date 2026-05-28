/**
 * File:        components/trading/order-drawer/QuickOrderOverlay.tsx
 * Module:      Trading · Order Drawer · Quick Order Overlay
 * Purpose:     Compact 3-field order entry shown within the peek state (50% snap).
 *              Renders Qty stepper + chips, Market/Limit toggle, and Swipe-to-confirm.
 *              Tapping "Advanced →" calls onAdvanced() to promote to the full OrderScreen.
 *
 * Exports:
 *   - QuickOrderOverlay(props: QuickOrderOverlayProps) — the overlay
 *   - QuickOrderOverlayProps
 *
 * Depends on:
 *   - @/components/trading/order-drawer/SwipeToConfirm — existing swipe button
 *   - @/lib/hooks/use-trading-data — placeOrder function
 *   - @/lib/market-data/hooks/useFeedStatus — isStale / isOffline guard
 *   - @/lib/services/risk/risk-config-defaults — getDefaultLeverage for fallback
 *
 * Side-effects: POST to /api/trading/orders via placeOrder()
 *              Fetches /api/risk/config for leverage + brokerage preview
 *
 * Key invariants:
 *   - Market button is disabled when STALE or OFFLINE — protects against stale price orders
 *   - DEGRADED = 30s grace window; market orders still allowed in DEGRADED state
 *   - lotSize defaults to 1 for equity; caller must provide correct lot size for F&O
 *   - SwipeToConfirmProps: { side, label?, threshold?, disabled?, busy?, onConfirm }
 *
 * Read order:
 *   1. QuickOrderOverlayProps
 *   2. computeMaxQty / computeHalfQty helpers
 *   3. QuickOrderOverlay
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-12 — add leverage + brokerage display from RiskConfig
 */

"use client"

import React, { useState, useMemo } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Minus, Plus } from "lucide-react"
import { SwipeToConfirm } from "./SwipeToConfirm"
import { placeOrder } from "@/lib/hooks/use-trading-data"
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"
import { getSegmentMarketSession } from "@/lib/hooks/market-timing"
import { getDefaultLeverage } from "@/lib/services/risk/risk-config-defaults"

export interface QuickOrderOverlayProps {
  symbol: string
  instrumentId?: string | null
  token?: number | null
  exchange?: string | null
  segment?: string | null
  direction: "BUY" | "SELL"
  feedPrice: number
  availableMargin: number
  lotSize?: number
  /** Called with order metadata on successful placement */
  onPlaced: (meta: { orderId: string; symbol: string; side: "BUY" | "SELL"; quantity: number }) => void
  /** User tapped "Advanced →" — caller promotes to full OrderScreen */
  onAdvanced: () => void
  session?: any
  tradingAccountId?: string
  /** Product type for leverage lookup — defaults to MIS for intraday */
  productType?: string
}

interface RiskConfigPreview {
  leverage: number
  brokerageFlat: number | null
  brokerageRate: number | null
  brokerageCap: number | null
}

const riskConfigFetcher = (url: string) =>
  fetch(url, { cache: "no-store", credentials: "include" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    .then((d) => d?.data ?? null)

function computeMaxQty(price: number, margin: number, lotSize: number): number {
  if (price <= 0 || margin <= 0 || lotSize <= 0) return 0
  return Math.floor(Math.floor(margin / price) / lotSize) * lotSize
}

function computeHalfQty(maxQty: number, lotSize: number): number {
  return Math.max(lotSize, Math.floor(maxQty / 2 / lotSize) * lotSize)
}

export function QuickOrderOverlay({
  symbol,
  instrumentId,
  token,
  exchange,
  segment,
  direction,
  feedPrice,
  availableMargin,
  lotSize = 1,
  onPlaced,
  onAdvanced,
  session,
  tradingAccountId,
  productType = "MIS",
}: QuickOrderOverlayProps) {
  const [qty, setQty] = useState(lotSize)
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET")
  const [limitPrice, setLimitPrice] = useState(feedPrice)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const segmentUpper = (segment ?? "NSE").toUpperCase()
  const productUpper = productType.toUpperCase()

  // Fetch risk config for leverage + brokerage preview
  const { data: riskConfig } = useSWR<RiskConfigPreview | null>(
    segment ? `/api/risk/config?segment=${encodeURIComponent(segmentUpper)}&productType=${encodeURIComponent(productUpper)}` : null,
    riskConfigFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  )

  const leverage = riskConfig?.leverage ?? getDefaultLeverage(segmentUpper, productUpper)

  // Compute margin required: turnover / leverage
  const currentPrice = orderType === "MARKET" ? feedPrice : limitPrice
  const turnover = qty * currentPrice
  const marginRequired = leverage > 0 ? turnover / leverage : turnover

  // Compute brokerage
  const brokerage = useMemo(() => {
    if (!riskConfig) return 0
    if (riskConfig.brokerageFlat != null) return riskConfig.brokerageFlat
    if (riskConfig.brokerageRate != null) {
      let b = turnover * riskConfig.brokerageRate
      if (riskConfig.brokerageCap != null) b = Math.min(b, riskConfig.brokerageCap)
      return b
    }
    return 0
  }, [riskConfig, turnover])

  // Estimate non-brokerage charges (rough 2.5% of turnover for typical equity)
  const estimatedCharges = turnover * 0.025
  const totalRequired = marginRequired + brokerage + estimatedCharges

  const { status: feedStatus } = useFeedStatus()
  const isStale = feedStatus === "STALE" || feedStatus === "OFFLINE"
  const isOffline = feedStatus === "OFFLINE"

  const allowDevOrders = typeof process !== "undefined" && process.env.NEXT_PUBLIC_ALLOW_DEV_ORDERS === "true"
  const marketSession = useMemo(
    () => getSegmentMarketSession(segment ?? undefined),
    [segment],
  )
  const isMarketBlocked = !allowDevOrders && marketSession.session !== "open"

  const maxQty = computeMaxQty(feedPrice, availableMargin, lotSize)
  const halfQty = computeHalfQty(maxQty, lotSize)

  const handleSwipe = async () => {
    if (isSubmitting || isOffline) return
    if (isMarketBlocked) {
      setError(marketSession.reason ?? "Market is closed — orders allowed only during trading hours")
      return
    }
    if (orderType === "MARKET" && isStale) {
      setError("Feed is stale — switch to Limit or wait for reconnect")
      return
    }
    setIsSubmitting(true)
    setError(null)
    const submitTs = Date.now()
    try {
      const result = await placeOrder({
        symbol,
        instrumentId,
        token,
        exchange,
        segment,
        quantity: qty,
        price: orderType === "LIMIT" ? limitPrice : null,
        orderType: orderType === "MARKET" ? "MARKET" : "LIMIT",
        orderSide: direction,
        productType: "CNC",
        tradingAccountId,
        session,
        ltp: feedPrice > 0 ? feedPrice : undefined,
        ltpTimestamp: feedPrice > 0 ? submitTs : undefined,
        ltpAgeMs: feedPrice > 0 ? 0 : undefined,
        ltpSource: feedPrice > 0 ? "LIVE_QUOTE" : undefined,
      })
      if (result?.orderId) {
        onPlaced({ orderId: result.orderId, symbol, side: direction, quantity: qty })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed — try again")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="px-4 pt-3 pb-4 bg-background border-t-2 border-border space-y-3">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 rounded px-3 py-1.5 border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {/* Leverage + Margin + Charges compact row */}
      <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400 font-semibold">⚡ {leverage}x</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            Margin: <span className="font-mono font-semibold text-foreground">₹{marginRequired.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          </span>
        </div>
        <div className="text-muted-foreground">
          Charges: <span className="font-mono font-semibold text-foreground">₹{(brokerage + estimatedCharges).toFixed(0)}</span>
        </div>
      </div>

      {/* Order type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOrderType("MARKET")}
          disabled={isStale}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            orderType === "MARKET" && !isStale
              ? "bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300"
              : "bg-muted border border-border text-muted-foreground",
            isStale && "line-through opacity-40 cursor-not-allowed"
          )}
        >
          Market{isStale ? " (stale)" : ""}
        </button>
        <button
          type="button"
          onClick={() => setOrderType("LIMIT")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
            orderType === "LIMIT"
              ? "bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300"
              : "bg-muted border border-border text-muted-foreground"
          )}
        >
          Limit
        </button>
      </div>

      {/* Limit price stepper — tick step 0.05 */}
      {orderType === "LIMIT" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground"
            onClick={() => setLimitPrice((p) => Math.max(0.05, Number((p - 0.05).toFixed(2))))}
          >
            <Minus size={12} />
          </button>
          <div className="flex-1 bg-muted border border-blue-500 dark:border-blue-700 rounded-lg py-1.5 text-center text-sm font-bold text-foreground tabular-nums">
            ₹{limitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground"
            onClick={() => setLimitPrice((p) => Number((p + 0.05).toFixed(2)))}
          >
            <Plus size={12} />
          </button>
        </div>
      )}

      {/* Quantity row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground"
          onClick={() => setQty((q) => Math.max(lotSize, q - lotSize))}
        >
          <Minus size={12} />
        </button>
        <div className="flex-1 bg-muted border border-border rounded-lg py-1.5 text-center text-sm font-bold text-foreground tabular-nums">
          {qty}
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground"
          onClick={() => setQty((q) => q + lotSize)}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Quick qty chips */}
      <div className="flex gap-2">
        {[
          { label: "Max", chipQty: maxQty },
          { label: "½ cap", chipQty: halfQty },
          { label: "1 lot", chipQty: lotSize },
        ].map(({ label, chipQty }) => (
          <button
            key={label}
            type="button"
            disabled={chipQty <= 0}
            onClick={() => chipQty > 0 && setQty(chipQty)}
            className="flex-1 flex flex-col items-center rounded-md bg-muted border border-border py-1 text-[10px] text-muted-foreground disabled:opacity-30"
          >
            <span>{label}</span>
            <span className="text-foreground font-bold text-xs">{chipQty > 0 ? chipQty : "—"}</span>
          </button>
        ))}
      </div>

      {/* Total required vs available */}
      <div className="text-xs text-muted-foreground text-right tabular-nums">
        Total: <span className="font-mono font-semibold text-foreground">₹{totalRequired.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        {" · "}
        <span className="text-muted-foreground/60">
          ₹{availableMargin.toLocaleString("en-IN", { maximumFractionDigits: 0 })} available
        </span>
      </div>

      {/* SwipeToConfirm */}
      <SwipeToConfirm
        side={direction}
        label={isMarketBlocked ? "Market closed" : `Swipe to ${direction} · ₹${totalRequired.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
        onConfirm={handleSwipe}
        disabled={isOffline || isMarketBlocked || isSubmitting || qty <= 0}
        busy={isSubmitting}
      />

      <button
        type="button"
        onClick={onAdvanced}
        className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground py-1"
      >
        Advanced options ↓
      </button>
    </div>
  )
}
