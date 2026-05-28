/**
 * @file OrderHeader.tsx
 * @module components/trading/order-form
 * @description Market-standard Bid / LTP / Ask price panel for the order form.
 *              All three prices share the same visual weight; execution side gets
 *              a solid colour highlight (emerald BUY, rose SELL).
 *              LTP shows live price with directional flash animation.
 * @author StockTrade
 * @created 2026-02-02
 * @updated 2026-04-15 — Market-standard equal-weight redesign
 */

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp, ArrowDown } from "lucide-react"
import { resolveDisplayQuoteSnapshot } from "@/lib/market-data/utils/quote-lookup"
import { cn } from "@/lib/utils"

interface OrderHeaderProps {
  stock: any
  orderSide: "BUY" | "SELL"
  quote?: {
    last_trade_price?: unknown
    display_price?: unknown
    actual_price?: unknown
  } | null
  bidPrice: number | null
  askPrice: number | null
}

export function OrderHeader({ stock, orderSide, quote, bidPrice, askPrice }: OrderHeaderProps) {
  const quoteSnapshot = resolveDisplayQuoteSnapshot({
    quote: quote ?? null,
    fallbackPrice: stock?.ltp,
    fallbackClose: stock?.close,
    liveMaxAgeMs: 5_000,
    displayMaxAgeMs: 60_000,
  })
  const displayLtp = quoteSnapshot.uiPrice
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  const prevPriceRef = React.useRef<number | null>(null)

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

  if (!stock) return null

  const isBuy = orderSide === "BUY"
  const prevClose = stock?.close ?? stock?.ltp
  const changeAbs = displayLtp != null && prevClose != null && prevClose > 0 ? displayLtp - prevClose : null
  const changePct = changeAbs != null && prevClose != null && prevClose > 0 ? (changeAbs / prevClose) * 100 : null
  const isLtpUp = (changePct ?? 0) >= 0
  const ltpStr =
    !quoteSnapshot.isDisplayable || displayLtp == null
      ? "--"
      : `₹${displayLtp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const fmtPrice = (p: number | null) =>
    p == null ? "--" : `₹${p.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const spread = bidPrice != null && askPrice != null ? askPrice - bidPrice : null
  const spreadPct =
    spread != null && displayLtp != null && displayLtp > 0
      ? (spread / displayLtp) * 100
      : null

  return (
    <div className="space-y-2.5">
      {/* ── 3-column price grid ── */}
      <div className="grid grid-cols-3 gap-1.5">

        {/* BID ─ hero on SELL */}
        <div className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border py-3 px-2 gap-1 transition-all duration-200 overflow-hidden",
          !isBuy
            ? "bg-rose-500 dark:bg-rose-600 border-transparent shadow-lg shadow-rose-500/25"
            : "bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800"
        )}>
          {/* Active-side accent bar at top */}
          {!isBuy && (
            <div className="absolute top-0 inset-x-0 h-0.5 bg-rose-300/60 rounded-t-2xl" />
          )}
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-[0.15em]",
            !isBuy ? "text-rose-100" : "text-gray-400 dark:text-gray-600"
          )}>
            Bid
          </span>
          <span className={cn(
            "font-mono font-bold tabular-nums leading-none text-center",
            !isBuy
              ? "text-lg text-white"
              : "text-base text-gray-400 dark:text-gray-500"
          )}>
            {fmtPrice(bidPrice)}
          </span>
          {!isBuy && (
            <span className="text-[9px] font-medium text-rose-100/70 uppercase tracking-wide">
              SELL HERE
            </span>
          )}
        </div>

        {/* LTP ─ centre reference */}
        <div className="flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-3 px-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
            LTP
          </span>

          <div className="flex flex-col items-center gap-0.5">
            {/* Price with flash */}
            <div className="flex items-center gap-0.5">
              <AnimatePresence mode="wait">
                {flash === "up" && (
                  <motion.div key="up" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <ArrowUp className="h-2.5 w-2.5 text-emerald-500" />
                  </motion.div>
                )}
                {flash === "down" && (
                  <motion.div key="dn" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <ArrowDown className="h-2.5 w-2.5 text-rose-500" />
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.span
                key={displayLtp}
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "font-mono font-bold text-sm tabular-nums leading-none transition-colors duration-200",
                  flash === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : flash === "down"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-800 dark:text-gray-200"
                )}
              >
                {ltpStr}
              </motion.span>
            </div>

            {/* Change % */}
            {changePct != null && (
              <span className={cn(
                "text-[9px] font-mono tabular-nums font-semibold",
                isLtpUp ? "text-emerald-500" : "text-rose-500"
              )}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* ASK ─ hero on BUY */}
        <div className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border py-3 px-2 gap-1 transition-all duration-200 overflow-hidden",
          isBuy
            ? "bg-emerald-500 dark:bg-emerald-600 border-transparent shadow-lg shadow-emerald-500/25"
            : "bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800"
        )}>
          {isBuy && (
            <div className="absolute top-0 inset-x-0 h-0.5 bg-emerald-300/60 rounded-t-2xl" />
          )}
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-[0.15em]",
            isBuy ? "text-emerald-100" : "text-gray-400 dark:text-gray-600"
          )}>
            Ask
          </span>
          <span className={cn(
            "font-mono font-bold tabular-nums leading-none text-center",
            isBuy
              ? "text-lg text-white"
              : "text-base text-gray-400 dark:text-gray-500"
          )}>
            {fmtPrice(askPrice)}
          </span>
          {isBuy && (
            <span className="text-[9px] font-medium text-emerald-100/70 uppercase tracking-wide">
              BUY HERE
            </span>
          )}
        </div>
      </div>

      {/* ── Spread bar ── */}
      {spread != null && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          <span className="font-mono font-medium">
            <span className="text-rose-400 dark:text-rose-500">B</span>
            <span className="text-gray-400 dark:text-gray-500"> · </span>
            <span className="text-emerald-500 dark:text-emerald-400">A</span>
            <span className="text-gray-500 dark:text-gray-400"> spread ₹{spread.toFixed(2)}</span>
          </span>
          {spreadPct != null && (
            <span className="text-gray-400 dark:text-gray-500 font-mono">
              ({spreadPct.toFixed(3)}%)
            </span>
          )}
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        </div>
      )}
    </div>
  )
}
