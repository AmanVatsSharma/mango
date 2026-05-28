/**
 * File:        components/trading/widgets/terminal-order-panel.tsx
 * Module:      Trading · Desktop Terminal
 * Purpose:     Compact inline order panel for the desktop terminal right column.
 *              Renders all sections directly from useOrderForm hook output without
 *              delegating to shared OrderHeader/OrderInputs/OrderSummary/AnimatedBuySellSwitcher
 *              (those components are sized for the mobile OrderDialog drawer).
 *
 * Exports:
 *   - TerminalOrderPanel(props) — inline compact order panel
 *   - TerminalOrderPanelProps   — prop contract
 *
 * Depends on:
 *   - @/lib/hooks/use-order-form — useOrderForm (order placement + all calculations)
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider — subscribe/unsubscribe
 *   - @/lib/market-data/utils/quote-lookup — normalizeSubscriptionKey, resolveSubscriptionIdentity, resolveDisplayQuoteSnapshot
 *   - @/types/trading — Stock
 *   - @/lib/utils — cn
 *
 * Side-effects:
 *   - WebSocket subscription for active symbol quote while panel is mounted
 *   - API fetches via useOrderForm (risk config, order charges config)
 *   - Order placement via POST /api/trading/orders
 *
 * Key invariants:
 *   - Uses --terminal-* CSS variables for light + dark theme support
 *   - isOpen=true always — panel is mounted only when a stock is selected
 *   - onClose maps to onClear (deselects stock); onOrderPlaced triggers position refresh
 *   - shouldBlockMarketOnStale: market orders blocked when quote not yet received
 *   - NRML product tab maps to setCurrentOrderType("NRML") which the hook passes as "DELIVERY"
 *
 * Read order:
 *   1. TerminalOrderPanelProps — data contract
 *   2. TerminalOrderPanel — sections: header → side tabs → product tabs → inputs → order type → status → margin → charges → CTA
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-23
 */

"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { X, ChevronDown, Loader2, Zap } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useOrderForm } from "@/lib/hooks/use-order-form"
import { useMarketDataStable } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import {
  normalizeSubscriptionKey,
  resolveSubscriptionIdentity,
  resolveDisplayQuoteSnapshot,
} from "@/lib/market-data/utils/quote-lookup"
import type { Stock } from "@/types/trading"

export interface TerminalOrderPanelProps {
  stock: Stock
  ltp: number | null
  initialSide?: "BUY" | "SELL"
  portfolio: any
  session: any
  onOrderPlaced: () => void
  onClear: () => void
}

const ORDER_DIALOG_QUOTE_WARMUP_MS = 2_500

// ── Inline helpers ──────────────────────────────────────────────────────────

function fmtPrice(p: number | null): string {
  if (p == null) return "--"
  return `₹${p.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtAmount(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Compact product + order-type tab row ────────────────────────────────────

interface FlatTabsProps {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  activeClass: string
}

function FlatTabs({ options, value, onChange, activeClass }: FlatTabsProps) {
  return (
    <div
      className="flex rounded-md overflow-hidden border"
      style={{ borderColor: "var(--terminal-border)" }}
    >
      {options.map((opt, i) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          style={
            value === opt.id
              ? undefined
              : { color: "var(--terminal-text-muted)" }
          }
          className={cn(
            "flex-1 h-7 text-[11px] font-semibold transition-colors duration-150 select-none",
            i > 0 && "border-l",
            value === opt.id ? activeClass : "hover:opacity-80",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Compact number input ────────────────────────────────────────────────────

interface CompactInputProps {
  label: string
  value: string | number
  onChange: (v: number) => void
  min?: number
  step?: number
  disabled?: boolean
  formatDisplay?: (v: number) => string
  placeholder?: string
}

function CompactInput({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  disabled = false,
}: CompactInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--terminal-text-muted)" }}
      >
        {label}
      </span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        className={cn(
          "w-full h-9 px-2 rounded-md text-sm font-mono font-semibold bg-transparent",
          "border focus:outline-none focus:ring-1 transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
        style={{
          borderColor: "var(--terminal-border)",
          color: "var(--terminal-text)",
        } as React.CSSProperties}
      />
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function TerminalOrderPanel({
  stock,
  ltp: _ltp,
  initialSide = "BUY",
  portfolio,
  session,
  onOrderPlaced,
  onClear,
}: TerminalOrderPanelProps) {
  const {
    orderSide,
    setOrderSide,
    quantity,
    setQuantity,
    lots,
    setLots,
    price,
    setPrice,
    currentOrderType,
    setCurrentOrderType,
    selectedStock,
    isMarket,
    setIsMarket,
    riskConfig,
    liveQuote,
    availableMargin,
    marginRequired,
    brokerage,
    additionalCharges,
    chargeLineItems,
    totalCost,
    quoteFreshness,
    isMarketBlocked,
    sessionStatus,
    allowDevOrders,
    isDerivatives,
    lotSize,
    units,
    bidPrice,
    askPrice,
    handleSubmit,
  } = useOrderForm({
    stock,
    portfolio,
    onOrderPlaced,
    onClose: onClear,
    session,
    initialOrderSide: initialSide,
    isOpen: true,
  })

  // ── WebSocket subscription ──────────────────────────────────────────────
  const { subscribe, unsubscribe } = useMarketDataStable()
  const subscribedKeys = useMemo(() => {
    const identity = resolveSubscriptionIdentity({
      token: (stock as any)?.token,
      uirId: (stock as any)?.uirId,
      instrumentId: stock?.instrumentId,
      exchange: (stock as any)?.exchange,
      segment: stock?.segment,
    })
    if (identity.subscriptionKey == null) return []
    const key =
      typeof identity.subscriptionKey === "string"
        ? normalizeSubscriptionKey(identity.subscriptionKey)
        : identity.subscriptionKey
    return [key]
  }, [stock?.instrumentId, (stock as any)?.token, (stock as any)?.uirId, (stock as any)?.exchange, stock?.segment])

  useEffect(() => {
    if (subscribedKeys.length === 0) return
    subscribe(subscribedKeys, "ltp")
    return () => { unsubscribe(subscribedKeys, "ltp") }
  }, [subscribedKeys, subscribe, unsubscribe])

  // ── Quote warmup (mirrors OrderDialog) ─────────────────────────────────
  const [quoteWarmupActive, setQuoteWarmupActive] = useState(false)
  useEffect(() => {
    if (!isMarket || subscribedKeys.length === 0) {
      setQuoteWarmupActive(false)
      return
    }
    setQuoteWarmupActive(true)
    const t = setTimeout(() => setQuoteWarmupActive(false), ORDER_DIALOG_QUOTE_WARMUP_MS)
    return () => clearTimeout(t)
  }, [isMarket, subscribedKeys])

  useEffect(() => {
    if (quoteFreshness?.isDisplayable) setQuoteWarmupActive(false)
  }, [quoteFreshness?.isDisplayable])

  // ── LTP display ─────────────────────────────────────────────────────────
  const quoteSnapshot = resolveDisplayQuoteSnapshot({
    quote: liveQuote as any ?? null,
    fallbackPrice: selectedStock?.ltp,
    fallbackClose: selectedStock?.close,
    liveMaxAgeMs: 5_000,
    displayMaxAgeMs: 60_000,
  })
  const displayLtp = quoteSnapshot.uiPrice

  // Flash animation on price change
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  const prevPriceRef = useRef<number | null>(null)
  useEffect(() => {
    if (displayLtp == null) return
    const prev = prevPriceRef.current
    prevPriceRef.current = displayLtp
    if (prev == null) return
    if (displayLtp > prev) setFlash("up")
    else if (displayLtp < prev) setFlash("down")
    else return
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [displayLtp])

  // ── Charges collapsible ─────────────────────────────────────────────────
  const [chargesOpen, setChargesOpen] = useState(false)

  // ── Derived values ──────────────────────────────────────────────────────
  const isBuy = orderSide === "BUY"
  const segmentUpper = (selectedStock?.segment?.toUpperCase() || "NSE") as string

  const showQuoteWarmupState = Boolean(
    isMarket && quoteWarmupActive && (!quoteFreshness || !quoteFreshness.isDisplayable),
  )
  const shouldBlockMarketOnStale = Boolean(
    isMarket && !quoteWarmupActive && (!quoteFreshness || !quoteFreshness.isDisplayable),
  )

  const isDisabled = totalCost > availableMargin || isMarketBlocked || shouldBlockMarketOnStale
  const isInsufficient = totalCost > availableMargin

  const prevClose = selectedStock?.close ?? selectedStock?.ltp
  const changeAbs =
    displayLtp != null && prevClose != null && prevClose > 0 ? displayLtp - prevClose : null
  const changePct =
    changeAbs != null && prevClose != null && prevClose > 0
      ? (changeAbs / prevClose) * 100
      : null
  const isLtpUp = (changePct ?? 0) >= 0

  const ltpStr =
    !quoteSnapshot.isDisplayable || displayLtp == null ? "--" : fmtPrice(displayLtp)

  const leverage = riskConfig?.leverage

  const sideAccentBg = isBuy ? "bg-emerald-500" : "bg-rose-500"
  const sideAccentText = isBuy ? "text-emerald-500" : "text-rose-500"
  const sideBorderClass = isBuy ? "border-l-emerald-500" : "border-l-rose-500"
  const sideActiveTab = isBuy
    ? "bg-emerald-500 text-white"
    : "bg-rose-500 text-white"

  // For derivatives: NRML is the only non-intraday product (shown as "CNC" id, labeled "NRML")
  const productTabs = isDerivatives
    ? [{ id: "MIS", label: "MIS" }, { id: "CNC", label: "NRML" }]
    : [{ id: "MIS", label: "MIS" }, { id: "CNC", label: "CNC" }, { id: "NRML", label: "NRML" }]

  // Normalize: for derivatives, NRML state maps visually to the "CNC" tab (labeled NRML)
  const productTabValue =
    isDerivatives && currentOrderType === "NRML" ? "CNC" : currentOrderType

  const orderTypeTabs = [
    { id: "MARKET", label: "Market" },
    { id: "LIMIT", label: "Limit" },
  ]

  if (!selectedStock) return null

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--terminal-surface)" }}
    >
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div
        className={cn("shrink-0 px-3 pt-3 pb-2.5 border-b border-l-2", sideBorderClass)}
        style={{
          borderBottomColor: "var(--terminal-border)",
          borderLeftColor: isBuy ? "rgb(16 185 129)" : "rgb(244 63 94)",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Symbol + segment info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span
                className="text-sm font-bold tracking-tight truncate"
                style={{ color: "var(--terminal-text)" }}
              >
                {selectedStock.symbol}
              </span>
              {selectedStock.exchange && (
                <span
                  className="text-[10px] font-medium shrink-0"
                  style={{ color: "var(--terminal-text-muted)" }}
                >
                  {selectedStock.exchange}
                </span>
              )}
            </div>
            <p
              className="text-[10px] mt-0.5 leading-none"
              style={{ color: "var(--terminal-text-muted)" }}
            >
              {selectedStock.segment === "NFO" ? (
                <span className="flex gap-1.5 flex-wrap">
                  {selectedStock.expiry && (
                    <span>
                      Exp:{" "}
                      {new Date(selectedStock.expiry).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                  )}
                  {selectedStock.strikePrice != null && selectedStock.optionType && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>₹{selectedStock.strikePrice} {selectedStock.optionType}</span>
                    </>
                  )}
                  {selectedStock.lotSize && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>Lot {selectedStock.lotSize}</span>
                    </>
                  )}
                </span>
              ) : (
                selectedStock.name || selectedStock.segment || ""
              )}
            </p>
          </div>

          {/* LTP + change */}
          <div className="text-right shrink-0">
            <motion.p
              key={displayLtp}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "text-base font-mono font-bold tabular-nums leading-none transition-colors duration-200",
                flash === "up"
                  ? "text-emerald-500"
                  : flash === "down"
                  ? "text-rose-500"
                  : sideAccentText,
              )}
            >
              {ltpStr}
            </motion.p>
            {changePct != null && (
              <p
                className={cn(
                  "text-[10px] font-mono tabular-nums mt-0.5",
                  isLtpUp ? "text-emerald-500" : "text-rose-500",
                )}
              >
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClear}
            className="shrink-0 p-1 rounded-full transition-colors mt-0.5"
            style={{ color: "var(--terminal-text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Thin Bid · LTP · Ask bar */}
        <p
          className="text-[10px] font-mono tabular-nums mt-2 leading-none"
          style={{ color: "var(--terminal-text-muted)" }}
        >
          <span>Bid {fmtPrice(bidPrice)}</span>
          <span className="mx-1.5 opacity-40">·</span>
          <span style={{ color: "var(--terminal-text)" }}>{ltpStr}</span>
          <span className="mx-1.5 opacity-40">·</span>
          <span>Ask {fmtPrice(askPrice)}</span>
        </p>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        style={{ background: "var(--terminal-surface)" }}
      >
        {/* BUY / SELL segmented control */}
        <div
          className="grid grid-cols-2 rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--terminal-border)" }}
        >
          <button
            type="button"
            onClick={() => setOrderSide("BUY")}
            className={cn(
              "h-9 text-sm font-bold transition-colors duration-150 select-none",
              isBuy
                ? "bg-emerald-500 text-white"
                : "hover:opacity-80",
            )}
            style={isBuy ? undefined : { color: "var(--terminal-text-muted)" }}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setOrderSide("SELL")}
            className={cn(
              "h-9 text-sm font-bold border-l transition-colors duration-150 select-none",
              !isBuy
                ? "bg-rose-500 text-white"
                : "hover:opacity-80",
            )}
            style={{
              borderColor: "var(--terminal-border)",
              ...(!isBuy ? {} : { color: "var(--terminal-text-muted)" }),
            }}
          >
            SELL
          </button>
        </div>

        {/* Product type tabs */}
        <FlatTabs
          options={productTabs}
          value={productTabValue}
          onChange={(id) => setCurrentOrderType(id)}
          activeClass={sideActiveTab}
        />

        {/* QTY + PRICE inputs */}
        <div className="grid grid-cols-2 gap-2.5">
          <CompactInput
            label={isDerivatives ? `Lots (×${lotSize})` : "QTY"}
            value={isDerivatives ? lots : quantity}
            onChange={(v) => isDerivatives ? setLots(Math.max(1, Math.round(v))) : setQuantity(Math.max(1, Math.round(v)))}
            min={1}
            step={1}
            disabled={isMarketBlocked}
          />
          <div className="flex flex-col gap-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--terminal-text-muted)" }}
            >
              {isMarket ? "Price · Market" : "Price · Limit"}
            </span>
            <AnimatePresence mode="wait">
              {isMarket ? (
                <motion.div
                  key="mkt"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="h-9 w-full rounded-md border flex items-center justify-center gap-1.5"
                  style={{
                    borderColor: "var(--terminal-border)",
                    color: "var(--terminal-text-muted)",
                    background: "var(--terminal-surface-hi)",
                  }}
                >
                  <Zap className="h-3 w-3" />
                  <span className="text-[11px] font-medium">Best Available</span>
                </motion.div>
              ) : (
                <motion.div
                  key="lmt"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <input
                    type="number"
                    value={price ?? ""}
                    min={0.05}
                    step={0.05}
                    disabled={isMarketBlocked}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v > 0) setPrice(v)
                    }}
                    className="w-full h-9 px-2 rounded-md text-sm font-mono font-semibold bg-transparent border focus:outline-none focus:ring-1 transition-colors disabled:opacity-40"
                    style={{
                      borderColor: "var(--terminal-border)",
                      color: "var(--terminal-text)",
                    } as React.CSSProperties}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Order type tabs — MARKET | LIMIT */}
        <FlatTabs
          options={orderTypeTabs}
          value={isMarket ? "MARKET" : "LIMIT"}
          onChange={(id) => !isMarketBlocked && setIsMarket(id === "MARKET")}
          activeClass={sideActiveTab}
        />

        {/* Status pills */}
        <AnimatePresence>
          {isMarketBlocked && (
            <motion.div
              key="blocked"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[10px] font-medium"
            >
              <span>⚠️</span>
              <span>
                {sessionStatus === "pre-open"
                  ? "Pre-Open (09:00–09:15 IST): orders blocked."
                  : segmentUpper.includes("MCX")
                  ? "Market closed — MCX: 09:00–23:55 IST"
                  : "Market closed — NSE: 09:15–15:30 IST"}
              </span>
            </motion.div>
          )}
          {showQuoteWarmupState && (
            <motion.div
              key="warmup"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-300 text-[10px] font-medium"
            >
              <span>⌛</span>
              <span>Syncing live quote — market orders unlock shortly.</span>
            </motion.div>
          )}
          {shouldBlockMarketOnStale && !showQuoteWarmupState && (
            <motion.div
              key="stale"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[10px] font-medium"
            >
              <span>ℹ️</span>
              <span>Waiting for quote — market orders blocked until received.</span>
            </motion.div>
          )}
          {!isMarketBlocked && sessionStatus !== "open" && allowDevOrders && (
            <motion.div
              key="dev"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-300 text-[10px] font-medium"
            >
              <span>🛠</span>
              <span>Dev override — orders enabled outside market hours.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="border-t" style={{ borderColor: "var(--terminal-border)" }} />

        {/* Margin rows — flat, no card */}
        <div className="space-y-0">
          <div className="flex justify-between items-center py-1.5">
            <span
              className="text-xs"
              style={{ color: "var(--terminal-text-muted)" }}
            >
              Margin required
            </span>
            <span
              className={cn("text-xs font-mono font-semibold tabular-nums", isInsufficient ? "text-red-500" : "")}
              style={isInsufficient ? undefined : { color: "var(--terminal-text)" }}
            >
              {fmtAmount(marginRequired)}
            </span>
          </div>
          {isInsufficient && (
            <p className="text-[10px] text-red-500 text-right -mt-1 mb-0.5">
              Short by {fmtAmount(totalCost - availableMargin)}
            </p>
          )}
          <div
            className="flex justify-between items-center py-1.5 border-t"
            style={{ borderColor: "var(--terminal-border)" }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--terminal-text-muted)" }}
            >
              Available
            </span>
            <span className="text-xs font-mono font-semibold tabular-nums text-emerald-500">
              {fmtAmount(availableMargin)}
            </span>
          </div>
          {leverage != null && (
            <div
              className="flex justify-between items-center py-1.5 border-t"
              style={{ borderColor: "var(--terminal-border)" }}
            >
              <span
                className="text-xs"
                style={{ color: "var(--terminal-text-muted)" }}
              >
                Leverage
              </span>
              <span
                className="text-xs font-mono font-semibold tabular-nums"
                style={{ color: "var(--terminal-text)" }}
              >
                {leverage}×
              </span>
            </div>
          )}
        </div>

        {/* Charges collapsible */}
        <div
          className="border-t rounded-md overflow-hidden"
          style={{ borderColor: "var(--terminal-border)" }}
        >
          <button
            type="button"
            onClick={() => setChargesOpen((o) => !o)}
            className="w-full flex items-center justify-between px-0 py-1.5 text-[11px] transition-colors"
            style={{ color: "var(--terminal-text-muted)" }}
          >
            <span className="font-medium">Charges & Taxes</span>
            <div className="flex items-center gap-1.5">
              <span
                className="font-mono font-semibold tabular-nums"
                style={{ color: "var(--terminal-text)" }}
              >
                {fmtAmount(brokerage + additionalCharges)}
              </span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  chargesOpen && "rotate-180",
                )}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {chargesOpen && (
              <motion.div
                key="charges"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div
                  className="pt-1 pb-2 space-y-1 text-[11px] border-t"
                  style={{ borderColor: "var(--terminal-border)" }}
                >
                  <div
                    className="flex justify-between py-0.5"
                    style={{ color: "var(--terminal-text-muted)" }}
                  >
                    <span>Order Value</span>
                    <span className="font-mono">
                      {fmtAmount((price || 0) * units)}
                    </span>
                  </div>
                  <div
                    className="flex justify-between py-0.5"
                    style={{ color: "var(--terminal-text-muted)" }}
                  >
                    <span>Brokerage</span>
                    <span className="font-mono">{fmtAmount(brokerage)}</span>
                  </div>
                  <div
                    className="flex justify-between py-0.5"
                    style={{ color: "var(--terminal-text-muted)" }}
                  >
                    <span>Govt. Charges</span>
                    <span className="font-mono">{fmtAmount(additionalCharges)}</span>
                  </div>
                  {chargeLineItems.length > 0 && (
                    <div className="pl-2 pt-0.5 space-y-0.5">
                      {chargeLineItems.map((row) => (
                        <div
                          key={`${row.id}-${row.code}`}
                          className="flex justify-between"
                          style={{ color: "var(--terminal-text-muted)" }}
                        >
                          <span className="opacity-70">{row.label ?? row.code}</span>
                          <span className="font-mono opacity-70">{fmtAmount(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className="flex justify-between py-0.5 border-t font-semibold"
                    style={{
                      borderColor: "var(--terminal-border)",
                      color: "var(--terminal-text)",
                    }}
                  >
                    <span>Total Required</span>
                    <span className={cn("font-mono", isBuy ? "text-emerald-500" : "text-rose-500")}>
                      {fmtAmount(totalCost)}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Sticky footer: CTA ─────────────────────────────────────────── */}
      <div
        className="shrink-0 p-3 border-t z-10"
        style={{
          background: "var(--terminal-surface-hi)",
          borderColor: "var(--terminal-border)",
        }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isDisabled}
          className={cn(
            "w-full h-11 rounded-lg text-sm font-bold text-white transition-all duration-150 select-none",
            "flex items-center justify-center gap-2",
            isBuy
              ? "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700"
              : "bg-rose-500 hover:bg-rose-600 active:bg-rose-700",
            isDisabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <Loader2 className="h-4 w-4 animate-spin hidden" />
          {isBuy ? "BUY" : "SELL"} · Place Order
        </button>
      </div>
    </div>
  )
}
