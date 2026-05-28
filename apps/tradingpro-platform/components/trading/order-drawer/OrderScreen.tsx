"use client"

/**
 * File:        components/trading/order-drawer/OrderScreen.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Full-screen order entry view (Kite Zerodha–inspired). Mounted as a fixed-inset overlay above
 *              the watchlist drawer when the user taps Buy/Sell. Owns its own form state via useOrderForm.
 *
 * Layout contract:
 *   - <header> fixed at top (back arrow + symbol + 3-dot menu + NSE/BSE exchange toggle)
 *   - <main> middle is the only scroll surface (Bid/LTP/Ask panel, status pills, Quantity, Price,
 *     Intraday/Longterm radios, Stoploss/GTT/Market-protection toggles, Help/Advanced, Validity,
 *     Order Summary).
 *   - <footer> fixed at bottom (Amount strip + SwipeToConfirm pill)
 *   The header and footer are sticky / position:fixed inside an absolutely-positioned overlay so the
 *   middle scroll never lifts them off-screen and so the swipe-to-confirm gesture cannot be confused
 *   with the page-scroll gesture.
 *
 * Exports:
 *   - OrderScreen (props: { stock, side, portfolio, session, onClose, onOrderPlaced }) — the full screen
 *
 * Depends on:
 *   - lib/hooks/use-order-form (useOrderForm) — single source of truth for price/margin/validation/submit
 *   - lib/market-data/hooks/useFeedStatus — blocks market orders when STALE or OFFLINE
 *   - components/trading/order-form/OrderHeader (Bid/LTP/Ask 3-column panel) — reused from legacy OrderDialog
 *   - components/trading/order-form/OrderSummary (Required-margin + per-line charges breakdown) — reused
 *   - components/trading/order-drawer/SwipeToConfirm — commit affordance
 *   - lucide-react — icons
 *   - lib/utils (cn)
 *
 * Side-effects:
 *   - useOrderForm subscribes to live market data and fires the order placement HTTP call on submit.
 *
 * Key invariants:
 *   - The exchange toggle (NSE / BSE) is currently VISUAL ONLY — useOrderForm does not yet accept an
 *     exchange override, so we display the value but do not wire it to submission.
 *   - We deliberately removed the Regular / MTF / Iceberg / Cover variety tabs from an earlier draft —
 *     the order placement service only supports "Regular" today (Market/Limit × Intraday/Delivery).
 *     Adding visual placeholders for unsupported variants confused the design and contradicted the
 *     codebase. When the broker integration adds real Cover/Bracket/Iceberg support we'll reintroduce
 *     them as proper tabs.
 *   - The codebase's globals.css remaps every `bg-blue-*` / `text-blue-*` to a faded brand-tinted color
 *     via `!important`. To get a SOLID brand-coloured surface we use the design tokens (bg-primary,
 *     text-primary, border-primary, ring-primary) — never `bg-blue-XXX` or `text-blue-XXX`.
 *
 * Read order:
 *   1. OrderScreenProps + ProductType / ValidityType — public contract
 *   2. useOrderForm wiring inside the component
 *   3. JSX header → main → footer
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

import * as React from "react"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Info,
  MoreVertical,
  Pencil,
  RefreshCcw,
  TrendingUp,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useOrderForm } from "@/lib/hooks/use-order-form"
import { OrderHeader } from "@/components/trading/order-form/OrderHeader"
import { OrderSummary } from "@/components/trading/order-form/OrderSummary"
import { SwipeToConfirm } from "./SwipeToConfirm"
import { resolveVenueDisplayLabel } from "@/lib/server/instrument-segment-normalize"
import { useFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"

type ProductType = "INTRADAY" | "LONGTERM"
type ValidityType = "DAY" | "IOC" | "MINUTES"

function LogoAvatar({ src }: { src: string }) {
  const [errored, setErrored] = React.useState(false)
  if (errored) return null
  return (
    <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden bg-muted/40 border border-border/30">
      <Image src={src} alt="" fill sizes="32px" className="object-contain p-0.5" onError={() => setErrored(true)} />
    </div>
  )
}

export interface OrderScreenProps {
  stock: any
  side: "BUY" | "SELL"
  portfolio: any | null
  session?: any
  onClose: () => void
  onOrderPlaced: () => void
}

export function OrderScreen({ stock, side, portfolio, session, onClose, onOrderPlaced }: OrderScreenProps) {
  // useOrderForm owns the real domain logic; we wrap its UI.
  const form = useOrderForm({
    isOpen: true,
    stock,
    initialOrderSide: side,
    portfolio,
    onClose,
    onOrderPlaced,
    session,
  })

  // Feed status guard — block market orders when STALE or OFFLINE
  // DEGRADED = reconnecting within 30s grace window; market orders still allowed
  const { status: feedStatus } = useFeedStatus()
  const marketOrderBlocked = feedStatus === "STALE" || feedStatus === "OFFLINE"
  React.useEffect(() => {
    if (marketOrderBlocked && form.isMarket) {
      form.setIsMarket(false)
    }
  }, [marketOrderBlocked, form.isMarket, form.setIsMarket])

  // Single venue label resolved from the instrument's actual segment + exchange. Replaces
  // the pre-2026-05 hardcoded NSE/BSE toggle which always rendered both buttons regardless
  // of the underlying instrument — confusing for BTC (CRYPTO), gold (MCX), USDINR (CDS) etc.
  // The order placement service routes by `segment` alone, so this is purely informational.
  const venueLabel = resolveVenueDisplayLabel(stock?.segment, stock?.exchange)
  // Derive initial UI product from the form's starting order type so the radio
  // shows the right selection immediately (equity starts MIS→Intraday, F&O starts NRML→Longterm).
  const [product, setProduct] = React.useState<ProductType>(
    form.currentOrderType === "MIS" ? "INTRADAY" : "LONGTERM"
  )

  // Wire the UI product selection to the form's order-type so it actually reaches the server.
  // Equity: Intraday → MIS, Longterm → CNC. F&O: Intraday → MIS, Longterm → NRML.
  const handleProductChange = React.useCallback((p: ProductType) => {
    setProduct(p)
    if (p === "INTRADAY") {
      form.setCurrentOrderType("MIS")
    } else {
      form.setCurrentOrderType(form.isDerivatives ? "NRML" : "CNC")
    }
  }, [form])

  const [stoploss, setStoploss] = React.useState(false)
  const [gtt, setGtt] = React.useState(false)
  const [marketProtection, setMarketProtection] = React.useState(false)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [validity, setValidity] = React.useState<ValidityType>("DAY")
  const [disclosedQty, setDisclosedQty] = React.useState("0")
  const [validityMinutes, setValidityMinutes] = React.useState("1")
  const [busy, setBusy] = React.useState(false)

  const isBuy = side === "BUY"
  const liveLtpRaw = form.liveQuote?.last_trade_price
  const liveLtp = typeof liveLtpRaw === "number" && Number.isFinite(liveLtpRaw) ? liveLtpRaw : null
  const ltp: number | null = stock?.ltp ?? liveLtp
  const exchangePrice = ltp != null ? `₹${Number(ltp).toFixed(2)}` : "—"

  const totalCost = form.totalCost ?? 0
  const charges = form.brokerage + form.additionalCharges
  const baseAmount = Math.max(0, totalCost - charges)
  const avail = form.availableMargin ?? 0
  const segmentUpper = stock?.segment?.toUpperCase?.() || "NSE"

  // Mirror the legacy OrderDialog warm-up logic so users see the same "Syncing live quote / market closed"
  // status pills they get from the old form. This avoids surprise when comparing the two flows.
  const showQuoteWarmupState = Boolean(
    form.isMarket && (!form.quoteFreshness || !form.quoteFreshness.isDisplayable),
  )
  const submitDisabled =
    busy ||
    totalCost > avail ||
    !!form.isMarketBlocked ||
    showQuoteWarmupState

  const handleSwipeConfirm = async () => {
    if (submitDisabled) return
    setBusy(true)
    try {
      await form.handleSubmit()
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="fixed inset-0 z-[60] flex flex-col bg-background"
    >
      {/* === Fixed Header === */}
      {/* Modernized 2026-05-06: replaced chunky NSE/BSE toggle with a single venue chip + a
          high-contrast LTP strip. The toggle was wrong for any non-NSE/BSE instrument
          (CRYPTO, MCX, CDS, NCO, ...) and visually heavy. The new layout keeps the symbol
          dominant, the venue compact and accurate, and the price front-and-center — which
          is what traders actually scan when they open the screen. */}
      <header className={cn(
        "relative shrink-0 border-b border-border/60",
        "bg-gradient-to-b from-card to-card/95 backdrop-blur-md",
      )}>
        <div className="flex items-start gap-2 px-4 pt-3 pb-2.5">
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {stock?.logo_url && <LogoAvatar src={stock.logo_url} />}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                {stock?.symbol ?? "—"}
              </h1>
              {/* Venue chip — single label, color-coded by family for at-a-glance recognition */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider tabular-nums",
                  venueLabel === "BINANCE" || venueLabel === "CRYPTO"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : venueLabel === "MCX" || venueLabel === "NCO"
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                      : venueLabel === "CDS" || venueLabel === "BCD" || venueLabel === "FX"
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : venueLabel === "NASDAQ" || venueLabel === "NYSE" || venueLabel === "US"
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                          : "border-border bg-muted text-muted-foreground",
                )}
                title={`Venue: ${venueLabel}`}
              >
                <span className="h-1 w-1 rounded-full bg-current opacity-80" aria-hidden />
                {venueLabel}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">
                {(stock as any)?.name || (stock as any)?.companyName || stock?.symbol || ""}
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 text-right">
            <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-foreground">
              {exchangePrice}
            </span>
          </div>

          <button
            type="button"
            className="-mr-1 mt-0.5 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted active:scale-95"
            aria-label="More"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* === Scrollable Middle === */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
        {/* Bid / LTP / Ask panel — same component used by the legacy OrderDialog */}
        <section className="bg-background px-4 pt-4 pb-3">
          <OrderHeader
            stock={stock}
            orderSide={side}
            quote={form.liveQuote as any}
            bidPrice={form.bidPrice}
            askPrice={form.askPrice}
          />
        </section>

        {/* Leverage + Margin row — transparency so users see what leverage multiplier is applied */}
        <div className="mx-4 mt-2 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">⚡ Leverage</span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">
              {form.leverage}x
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground">Margin req. </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              ₹{form.marginRequired.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Status pills — surface market-closed / waiting-for-quote / dev-override warnings */}
        <AnimatePresence>
          {(form.isMarketBlocked || showQuoteWarmupState ||
            (!form.isMarketBlocked && form.sessionStatus !== "open" && form.allowDevOrders)) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-2 px-4 pb-3"
            >
              {form.isMarketBlocked && (
                <StatusPill tone="warn">
                  Market closed —{" "}
                  {form.sessionStatus === "pre-open"
                    ? "Pre-Open (09:00–09:15 IST): orders blocked."
                    : resolveMarketClosedHint(segmentUpper)}
                </StatusPill>
              )}
              {showQuoteWarmupState && (
                <StatusPill tone="info">
                  Waiting for live quote — market orders unlock momentarily.
                </StatusPill>
              )}
              {!form.isMarketBlocked && form.sessionStatus !== "open" && form.allowDevOrders && (
                <StatusPill tone="info">
                  Dev override — orders enabled outside market hours.
                </StatusPill>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quantity & Price card */}
        <section className="m-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <FieldLabel>Quantity</FieldLabel>
          <NumberRow
            value={form.isDerivatives ? String(form.lots) : String(form.quantity)}
            onChange={(v) => {
              const n = Number(v)
              if (!Number.isFinite(n)) return
              if (form.isDerivatives) form.setLots(Math.max(1, Math.trunc(n)))
              else form.setQuantity(Math.max(1, Math.trunc(n)))
            }}
            tone="default"
          />

          <div className="mt-4 flex items-center gap-1">
            <FieldLabel>
              {form.isMarket ? "Market" : "Price"}
              {marketOrderBlocked && (
                <span className="text-[9px] text-amber-500 ml-1">(stale — limit only)</span>
              )}
            </FieldLabel>
            <button
              type="button"
              onClick={() => {
                if (marketOrderBlocked && !form.isMarket) return
                form.setIsMarket(!form.isMarket)
              }}
              disabled={marketOrderBlocked && !form.isMarket}
              className={cn(
                "rounded p-0.5 text-muted-foreground hover:bg-muted",
                marketOrderBlocked && !form.isMarket && "opacity-30 cursor-not-allowed"
              )}
              aria-label={form.isMarket ? "Switch to Limit" : "Switch to Market"}
              title={
                marketOrderBlocked && !form.isMarket
                  ? "Market orders disabled — feed is stale"
                  : form.isMarket
                  ? "Switch to Limit"
                  : "Switch to Market"
              }
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <NumberRow
            value={form.isMarket ? "" : form.price != null ? String(form.price) : ""}
            onChange={(v) => {
              if (v === "") {
                form.setPrice(null)
                return
              }
              const n = Number(v)
              if (Number.isFinite(n)) form.setPrice(n)
            }}
            placeholder={form.isMarket ? "0.00" : ""}
            disabled={form.isMarket}
            tone={form.isMarket ? "striped" : "default"}
          />

          <div className="mt-4 flex items-center justify-end gap-6 border-t border-border pt-3">
            <RadioPill
              label="Intraday"
              active={product === "INTRADAY"}
              onClick={() => handleProductChange("INTRADAY")}
            />
            <RadioPill
              label="Longterm"
              active={product === "LONGTERM"}
              onClick={() => handleProductChange("LONGTERM")}
            />
          </div>
        </section>

        {/* Toggles */}
        <section className="mx-3 space-y-1 px-1 pb-1">
          <ToggleRow label="Stoploss" value={stoploss} onChange={setStoploss} />
          <ToggleRow label="GTT" value={gtt} onChange={setGtt} />
          <ToggleRow
            label="Market protection"
            value={marketProtection}
            onChange={setMarketProtection}
          />
        </section>

        {/* Help / Advanced */}
        <div className="mx-3 mt-2 flex items-center justify-between px-1 pb-3">
          <button type="button" className="text-sm font-medium text-primary">
            Help
          </button>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-primary"
          >
            {advancedOpen ? "Less" : "Advanced"}
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Advanced section */}
        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.section
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-3 mb-4 overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
            >
              <div className="space-y-4 p-4">
                <FieldLabel className="text-foreground">Validity</FieldLabel>
                <div className="flex items-center gap-2">
                  {(["DAY", "IOC", "MINUTES"] as const).map((v) => {
                    const active = validity === v
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setValidity(v)}
                        className={cn(
                          "rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {v === "MINUTES" ? "Minutes" : v}
                      </button>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <FieldLabel>Disclosed Qty.</FieldLabel>
                    <NumberRow
                      value={disclosedQty}
                      onChange={setDisclosedQty}
                      tone="default"
                      compact
                    />
                  </div>
                  <div>
                    <FieldLabel>Minutes</FieldLabel>
                    <NumberRow
                      value={validityMinutes}
                      onChange={setValidityMinutes}
                      placeholder="1 minute"
                      disabled={validity !== "MINUTES"}
                      tone={validity !== "MINUTES" ? "striped" : "default"}
                      compact
                    />
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Order Summary — required margin + per-line charge breakdown.
            Reused as-is from the legacy OrderDialog so users get the same numbers in both flows. */}
        <section className="mx-3 mb-4">
          <OrderSummary
            price={form.price}
            units={form.units}
            marginRequired={form.marginRequired}
            brokerage={form.brokerage}
            additionalCharges={form.additionalCharges}
            chargeLineItems={form.chargeLineItems}
            totalCost={form.totalCost}
            availableMargin={form.availableMargin}
            orderSide={side}
          />
        </section>

        <div className="h-4" />
      </main>

      {/* === Fixed Footer === */}
      <footer className="relative shrink-0 border-t border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-baseline gap-1">
            <span className="font-medium">Amount</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              ₹{baseAmount.toFixed(2)}
            </span>
            <span className="opacity-60">+</span>
            <span className="font-mono tabular-nums">₹{charges.toFixed(2)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-medium">Avail.</span>
            <span className="font-mono tabular-nums text-foreground">₹{avail.toFixed(2)}</span>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Refresh balance"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-1">
          <SwipeToConfirm
            side={side}
            disabled={submitDisabled}
            busy={busy}
            onConfirm={handleSwipeConfirm}
          />
        </div>

        <button
          type="button"
          className="absolute -top-5 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md hover:text-primary"
          aria-label="View chart"
          title="View chart"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
      </footer>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI primitives — kept inline because they have no use outside this file.

/**
 * Map a segment to the operator-friendly closed-market hint shown when the order is placed
 * outside trading hours. Pre-2026-05 only "MCX 09:00–23:55 IST" and "NSE 09:15–15:30 IST"
 * existed — the rest of the watchlist's venues (CDS / BCD / NCO / CRYPTO) silently fell
 * into the NSE branch and showed a wrong window. Mirrors the per-venue trading-window
 * dispatch in `lib/server/market-timing.ts`.
 */
function resolveMarketClosedHint(segmentUpper: string): string {
  const seg = (segmentUpper || "").toUpperCase()
  if (seg.includes("MCX")) return "MCX 09:00–23:55 IST"
  if (seg.startsWith("NCO")) return "NCO 09:00–23:55 IST"
  if (seg.startsWith("CDS")) return "CDS 09:00–17:00 IST"
  if (seg.startsWith("BCD")) return "BCD 09:00–17:00 IST"
  if (seg === "CRYPTO" || seg === "BINANCE" || seg === "SPOT") return "Crypto trades 24/7 — try again shortly"
  if (seg === "IDX" || seg === "INDICES") return "Indices spot — not directly tradable"
  if (seg === "NASDAQ") return "NASDAQ 19:00–01:30 IST (US session)"
  if (seg === "NYSE") return "NYSE 19:00–01:30 IST (US session)"
  if (seg === "FX" || seg === "FOREX") return "FX spot — admin must enable trading window"
  if (seg === "NSEIX") return "NSEIX (GIFT) — admin must enable trading window"
  return "NSE 09:15–15:30 IST"
}

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </div>
  )
}

function NumberRow({
  value,
  onChange,
  placeholder,
  disabled = false,
  tone = "default",
  compact = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  tone?: "default" | "striped"
  compact?: boolean
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border bg-background px-3 font-mono tabular-nums tracking-tight text-foreground",
          "border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
          compact ? "h-9 text-sm" : "h-11 text-base",
          tone === "striped" &&
            "bg-[repeating-linear-gradient(135deg,oklch(0.95_0_0)_0_8px,oklch(0.92_0_0)_8px_16px)] dark:bg-[repeating-linear-gradient(135deg,oklch(0.18_0_0)_0_8px,oklch(0.20_0_0)_8px_16px)]",
          disabled && "cursor-not-allowed text-muted-foreground",
        )}
      />
      <button
        type="button"
        className="shrink-0 rounded-md border border-border p-2 text-primary hover:bg-muted"
        aria-label="Toggle"
        title="Toggle"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function RadioPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-sm"
    >
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-full border-2",
          active ? "border-primary bg-primary ring-2 ring-primary/30" : "border-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className={cn("font-medium", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </button>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background px-3 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Info className="h-3.5 w-3.5 text-primary" aria-hidden />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          value ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            value ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  )
}

function StatusPill({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium",
        tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </div>
  )
}
