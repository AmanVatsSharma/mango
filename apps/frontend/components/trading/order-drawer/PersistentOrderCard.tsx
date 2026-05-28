/**
 * File:        components/trading/order-drawer/PersistentOrderCard.tsx
 * Module:      Trading · Order Drawer · Persistent Order Card
 * Purpose:     Docked bottom card that shows the most recent order's lifecycle
 *              (Pending → Executed / Rejected / Cancelled). Polls via useOrderStatus.
 *
 * Exports:
 *   - PersistentOrderCard(props: PersistentOrderCardProps) — the card; renders null when no order
 *   - PersistentOrderCardProps
 *
 * Depends on:
 *   - @/hooks/use-order-status — polling hook
 *   - @/lib/order/rejection-codes — fixable vs hard rejection routing
 *
 * Side-effects: SWR polling via useOrderStatus
 *
 * Key invariants:
 *   - Auto-dismisses 8s after EXECUTED, 4s after CANCELLED
 *   - REJECTED card stays until user taps ✕; "Retry ›" calls onRetry(symbol)
 *   - Renders null when orderId is null or after auto-dismiss
 *   - dismissed state resets whenever a new orderId arrives
 *
 * Read order:
 *   1. PersistentOrderCardProps
 *   2. PersistentOrderCard
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import React from "react"
import { useOrderStatus } from "@/hooks/use-order-status"
import { resolveRejection } from "@/lib/order/rejection-codes"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface PersistentOrderCardProps {
  orderId: string | null
  /** Initial summary shown before the first status poll returns */
  orderSummary?: {
    symbol: string
    side: "BUY" | "SELL"
    quantity: number
    estimatedTotal?: number
  }
  onRetry?: (symbol: string) => void
  onDismiss?: () => void
}

const AUTO_DISMISS_EXECUTED_MS = 8_000
const AUTO_DISMISS_CANCELLED_MS = 4_000

export function PersistentOrderCard({
  orderId,
  orderSummary,
  onRetry,
  onDismiss,
}: PersistentOrderCardProps) {
  const { data, isLoading } = useOrderStatus(orderId)
  const [dismissed, setDismissed] = React.useState(false)
  const prevOrderIdRef = React.useRef(orderId)

  // Reset dismissed state when a new orderId arrives
  if (orderId !== prevOrderIdRef.current) {
    prevOrderIdRef.current = orderId
    setDismissed(false)
  }

  React.useEffect(() => {
    if (!data) return
    let delay: number | null = null
    if (data.status === "EXECUTED") delay = AUTO_DISMISS_EXECUTED_MS
    if (data.status === "CANCELLED") delay = AUTO_DISMISS_CANCELLED_MS
    if (delay === null) return
    const id = setTimeout(() => {
      setDismissed(true)
      onDismiss?.()
    }, delay)
    return () => clearTimeout(id)
  }, [data?.status, onDismiss])

  if (!orderId || dismissed) return null

  const symbol = data?.symbol ?? orderSummary?.symbol ?? "—"
  const side = orderSummary?.side ?? "BUY"
  const qty = data?.quantity ?? orderSummary?.quantity ?? 0
  const status = data?.status ?? (isLoading ? "PENDING" : "PENDING")

  const dismiss = () => { setDismissed(true); onDismiss?.() }

  if (status === "PENDING") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-emerald-500 bg-emerald-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div>
          <div className="text-sm font-bold text-emerald-300">⏳ {side} {qty} {symbol} · Pending</div>
          {data?.orderId && <div className="text-xs text-zinc-500 mt-0.5">#{data.orderId.slice(-6)}</div>}
        </div>
        <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>
    )
  }

  if (status === "EXECUTED" || status === "PARTIALLY_FILLED") {
    const fillPrice = data?.averagePrice ?? data?.price
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-emerald-500 bg-emerald-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div>
          <div className="text-sm font-bold text-emerald-300">✓ {side} {qty} {symbol} · Filled</div>
          {fillPrice != null && (
            <div className="text-xs text-zinc-400 mt-0.5">
              @ ₹{fillPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
        <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>
    )
  }

  if (status === "REJECTED") {
    const { humanMessage } = resolveRejection(data?.failureCode)
    const reason = data?.failureReason || humanMessage
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-red-600 bg-red-950/95 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-red-300">✗ {side} {qty} {symbol} — Rejected</div>
          <div className="text-xs text-zinc-400 mt-0.5 truncate">{reason}</div>
        </div>
        <div className="flex items-center gap-3 ml-3 shrink-0">
          {onRetry && (
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-200 font-medium"
              onClick={() => onRetry(symbol)}
            >
              Retry ›
            </button>
          )}
          <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={dismiss}>
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  // CANCELLED / EXPIRED / unknown
  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-700 bg-zinc-950/95",
      "px-4 py-3 flex items-center justify-between backdrop-blur-sm"
    )}>
      <div className="text-sm text-zinc-400">— {side} {qty} {symbol} · {status}</div>
      <button type="button" className="text-zinc-600 hover:text-zinc-400" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  )
}
