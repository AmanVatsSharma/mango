/**
 * File:        components/trading/widgets/terminal-order-ticket.tsx
 * Module:      components/trading/widgets
 * Purpose:     Inline order ticket for the desktop trading terminal right column.
 *              Shows BUY/SELL toggle, product type, qty/price inputs, order type,
 *              and a margin summary strip. On submit it opens OrderDialog pre-seeded
 *              with the chosen side — no duplicate order logic lives here.
 *
 * Exports:
 *   - TerminalOrderTicket(props) — self-contained inline order entry UI
 *
 * Depends on:
 *   - @/types/trading — Stock
 *   - @/components/ui/button — Button
 *   - @/lib/utils — cn
 *
 * Side-effects:
 *   - none (calls parent callbacks only)
 *
 * Key invariants:
 *   - Price tracks live ltp prop until the user manually edits it
 *   - Qty resets to "1" (or lotSize-aware default) when stock changes
 *   - onOpenOrderDialog receives (stock, side) — OrderDialog owns final order logic
 *
 * Read order:
 *   1. TerminalOrderTicketProps — data contract
 *   2. TerminalOrderTicket — render
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-22
 */

"use client"

import React, { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Stock } from "@/types/trading"

export interface TerminalOrderTicketProps {
  stock: Stock
  ltp: number | null
  availableMargin: number
  initialSide?: "BUY" | "SELL"
  onOpenOrderDialog: (stock: Stock, side: "BUY" | "SELL") => void
  onClear: () => void
}

type ProductType = "MIS" | "CNC" | "NRML"
type OrderType = "LIMIT" | "MARKET" | "SL" | "SL-M"

const PRODUCT_LABELS: ProductType[] = ["MIS", "CNC", "NRML"]
const ORDER_TYPES: OrderType[] = ["LIMIT", "MARKET", "SL", "SL-M"]

const fmtPrice = (n: number | null): string =>
  n == null ? "" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtCurrency = (n: number): string =>
  `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export function TerminalOrderTicket({
  stock,
  ltp,
  availableMargin,
  initialSide = "BUY",
  onOpenOrderDialog,
  onClear,
}: TerminalOrderTicketProps) {
  const [side, setSide] = useState<"BUY" | "SELL">(initialSide)
  const [product, setProduct] = useState<ProductType>("MIS")
  const [orderType, setOrderType] = useState<OrderType>("LIMIT")
  const [qty, setQty] = useState("1")
  const [price, setPrice] = useState(fmtPrice(ltp))
  const [priceEdited, setPriceEdited] = useState(false)

  // Reset form when stock changes
  useEffect(() => {
    setSide(initialSide)
    setQty(stock.lotSize ? String(stock.lotSize) : "1")
    setPriceEdited(false)
    setPrice(fmtPrice(ltp))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.instrumentId, initialSide])

  // Track live price changes unless user has manually edited
  useEffect(() => {
    if (!priceEdited && ltp != null) {
      setPrice(fmtPrice(ltp))
    }
  }, [ltp, priceEdited])

  const handlePriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPrice(e.target.value)
    setPriceEdited(true)
  }, [])

  const handleSubmit = useCallback(() => {
    onOpenOrderDialog(stock, side)
  }, [stock, side, onOpenOrderDialog])

  const isBuy = side === "BUY"
  const accentColor = isBuy ? "#10B981" : "#EF4444"

  // Rough margin estimate (displayed only; real calc is in OrderDialog)
  const qtyNum = Math.max(0, parseInt(qty, 10) || 0)
  const priceNum = parseFloat(price.replace(/,/g, "")) || ltp || 0
  const estimatedValue = qtyNum * priceNum
  const marginEstimate = product === "MIS" ? estimatedValue * 0.2 : estimatedValue

  // Resolve exchange/segment label
  const segment = stock.segment?.toUpperCase() ?? "NSE"

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--terminal-surface)]">
      {/* ── BUY / SELL toggle ── */}
      <div className="flex shrink-0">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "flex-1 py-3 text-sm font-bold transition-colors duration-150",
              side === s
                ? s === "BUY"
                  ? "bg-emerald-500 text-white"
                  : "bg-rose-500 text-white"
                : "bg-[color:var(--terminal-surface-hi)] text-[color:var(--terminal-text-muted)] hover:text-[color:var(--terminal-text)]",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* ── Symbol header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[15px] font-bold text-[color:var(--terminal-text)] leading-tight">{stock.symbol}</div>
            <div className="text-[11px] text-[color:var(--terminal-text-muted)] mt-0.5">
              {segment} · {stock.name?.split(" ").slice(0, 2).join(" ") ?? "Equity"}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div
              className="text-sm font-mono font-bold tabular-nums"
              style={{ color: accentColor }}
            >
              {ltp != null ? fmtPrice(ltp) : "—"}
            </div>
            <button
              onClick={onClear}
              title="Clear selection"
              className="mt-0.5 text-[color:var(--terminal-text-muted)] hover:text-[color:var(--terminal-text)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Product type ── */}
        <div className="flex gap-1 bg-[color:var(--terminal-surface-hi)] p-0.5 rounded-lg">
          {PRODUCT_LABELS.map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors duration-100",
                product === p
                  ? "bg-[color:var(--terminal-hover)] text-[#22D3EE]"
                  : "text-[color:var(--terminal-text-muted)] hover:text-[color:var(--terminal-text)]",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* ── Qty + Price inputs ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-[color:var(--terminal-border)] rounded-lg px-3 py-2 bg-[color:var(--terminal-bg)]">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-[color:var(--terminal-text-muted)] mb-0.5">
              Qty
            </div>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-transparent text-sm font-mono font-bold text-[color:var(--terminal-text)] outline-none tabular-nums"
            />
          </div>
          <div className="border border-[color:var(--terminal-border)] rounded-lg px-3 py-2 bg-[color:var(--terminal-bg)]">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-[color:var(--terminal-text-muted)] mb-0.5">
              {orderType === "MARKET" ? "Price · MKT" : `Price · ${orderType}`}
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={orderType === "MARKET" ? "Market" : price}
              onChange={handlePriceChange}
              disabled={orderType === "MARKET"}
              className="w-full bg-transparent text-sm font-mono font-bold text-[color:var(--terminal-text)] outline-none tabular-nums disabled:opacity-40"
            />
          </div>
        </div>

        {/* ── Order type pills ── */}
        <div className="flex gap-1">
          {ORDER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={cn(
                "flex-1 py-1.5 border rounded-md text-[10px] font-bold transition-colors duration-100",
                orderType === t
                  ? "border-[#22D3EE]/40 bg-[#22D3EE]/10 text-[#22D3EE]"
                  : "border-[color:var(--terminal-border)] text-[color:var(--terminal-text-muted)] hover:text-[color:var(--terminal-text)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Margin strip ── */}
        <div className="border-t border-b border-[color:var(--terminal-border)] py-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-[color:var(--terminal-text-muted)]">Est. margin req</span>
            <span className="font-semibold text-[color:var(--terminal-text)] tabular-nums">
              {marginEstimate > 0 ? fmtCurrency(marginEstimate) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-[color:var(--terminal-text-muted)]">Available</span>
            <span className="font-semibold text-[#22D3EE] tabular-nums">
              {fmtCurrency(availableMargin)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-[oklch(0.5_0_0)]">Est. value</span>
            <span className="font-semibold text-white tabular-nums">
              {estimatedValue > 0 ? fmtCurrency(estimatedValue) : "—"}
            </span>
          </div>
        </div>

        {/* ── Insufficient margin warning ── */}
        {marginEstimate > availableMargin && availableMargin > 0 && (
          <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5">
            Estimated margin may exceed available funds. Verify in order preview.
          </div>
        )}

        {/* ── Submit ── */}
        <button
          onClick={handleSubmit}
          className={cn(
            "w-full py-3 rounded-lg text-sm font-bold text-white transition-all duration-150 active:scale-[0.98]",
            isBuy
              ? "bg-emerald-500 hover:bg-emerald-400 shadow-[0_10px_18px_-12px_#10B981]"
              : "bg-rose-500 hover:bg-rose-400 shadow-[0_10px_18px_-12px_#EF4444]",
          )}
        >
          {side} · Preview Order
        </button>

        <p className="text-center text-[10px] text-[oklch(0.4_0_0)]">
          Review charges and confirm in the next step
        </p>
      </div>
    </div>
  )
}
