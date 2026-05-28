/**
 * @file admin-trades-derivation.ts
 * @module server
 * @description Pure functions that derive blotter row fields (side, status, averages, realized-P&L discriminator)
 *              from a Position + its orders/transactions. Kept free of Prisma/Redis so it's easy to unit-test.
 * @author StockTrade
 * @created 2026-04-15
 */

import type { TradeSide, TradeStatus } from "@/app/api/admin/trades/types"

type NumericLike = number | string | { toString(): string } | null

export interface DerivationOrderLike {
  id: string
  orderPurpose: string | null
  orderSide: "BUY" | "SELL" | string
  status: string
  quantity: number
  filledQuantity: number | null
  price: NumericLike
  averagePrice: NumericLike
  createdAt: Date | string
  executedAt: Date | string | null
}

export interface DerivationPositionLike {
  quantity: number
  averagePrice: NumericLike
  closedAt: Date | string | null
  createdAt: Date | string
}

export interface DerivationTransactionLike {
  positionId: string | null
  description: string | null
}

/**
 * Realized P&L transaction description prefixes.
 * Must match every description string written by PositionManagementService:
 *   - "Profit from X position" / "Loss from X position"  (main close path via creditTx/debitTx)
 *   - "Realized P&L (queued close): ..."                 (queued-close worker path)
 *   - "Position closed ..." / "Position partially closed ..." (legacy/alternate paths)
 */
export const REALIZED_PNL_DESCRIPTION_PREFIXES = [
  "Profit from",
  "Loss from",
  "Realized P&L",
  "Position closed",
  "Position partially closed",
] as const

export function isRealizedPnLTransaction(tx: DerivationTransactionLike): boolean {
  if (!tx.positionId) return false
  const desc = tx.description ?? ""
  for (const prefix of REALIZED_PNL_DESCRIPTION_PREFIXES) {
    if (desc.startsWith(prefix)) return true
  }
  return false
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  if (value && typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    try {
      const n = (value as { toNumber: () => number }).toNumber()
      return Number.isFinite(n) ? n : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

/**
 * Side of the trade — derived from the first OPEN-purpose order's side (if present),
 * falling back to the sign of the current quantity.
 */
export function deriveTradeSide(
  orders: DerivationOrderLike[],
  quantity: number,
): TradeSide {
  const firstOpen = orders
    .filter((o) => o.orderPurpose === "OPEN")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
  if (firstOpen) {
    return firstOpen.orderSide === "SELL" ? "SHORT" : "LONG"
  }
  return quantity < 0 ? "SHORT" : "LONG"
}

/**
 * Status of the trade — OPEN if quantity != 0 and no executed CLOSE orders,
 * CLOSED if quantity == 0, PARTIAL if at least one executed CLOSE but quantity still != 0.
 */
export function deriveTradeStatus(
  position: DerivationPositionLike,
  orders: DerivationOrderLike[],
): TradeStatus {
  const qty = Math.trunc(toNumber(position.quantity))
  const hasExecutedClose = orders.some(
    (o) => o.orderPurpose === "CLOSE" && o.status === "EXECUTED",
  )
  if (qty === 0) return "CLOSED"
  return hasExecutedClose ? "PARTIAL" : "OPEN"
}

/** Quantity-weighted average entry price from OPEN orders, fallback to Position.averagePrice. */
export function computeAverageEntryPrice(
  orders: DerivationOrderLike[],
  positionAvg: NumericLike,
): number {
  const openOrders = orders.filter(
    (o) => o.orderPurpose === "OPEN" && o.status === "EXECUTED",
  )
  if (openOrders.length === 0) return toNumber(positionAvg)
  let totalQty = 0
  let totalValue = 0
  for (const o of openOrders) {
    const qty = toNumber(o.filledQuantity ?? o.quantity)
    const avg = toNumber(o.averagePrice ?? o.price)
    if (qty > 0 && avg > 0) {
      totalQty += qty
      totalValue += qty * avg
    }
  }
  if (totalQty === 0) return toNumber(positionAvg)
  return totalValue / totalQty
}

/** Quantity-weighted average exit price from EXECUTED CLOSE orders. Null when no close orders executed. */
export function computeAverageExitPrice(orders: DerivationOrderLike[]): number | null {
  const closeOrders = orders.filter(
    (o) => o.orderPurpose === "CLOSE" && o.status === "EXECUTED",
  )
  if (closeOrders.length === 0) return null
  let totalQty = 0
  let totalValue = 0
  for (const o of closeOrders) {
    const qty = toNumber(o.filledQuantity ?? o.quantity)
    const avg = toNumber(o.averagePrice ?? o.price)
    if (qty > 0 && avg > 0) {
      totalQty += qty
      totalValue += qty * avg
    }
  }
  if (totalQty === 0) return null
  return totalValue / totalQty
}

/**
 * Held duration in milliseconds between entry and exit. For open positions, exitAt falls
 * back to "now" so the blotter can show a live "held" counter.
 */
export function computeHeldMs(entryAt: Date | string, exitAt: Date | string | null): number {
  const entryMs = new Date(entryAt).getTime()
  const exitMs = exitAt ? new Date(exitAt).getTime() : Date.now()
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs)) return 0
  return Math.max(0, exitMs - entryMs)
}

/**
 * Earliest executed OPEN order time = entry timestamp. Falls back to position.createdAt.
 */
export function deriveEntryAt(
  orders: DerivationOrderLike[],
  positionCreatedAt: Date | string,
): string {
  const openExec = orders
    .filter((o) => o.orderPurpose === "OPEN" && o.status === "EXECUTED" && o.executedAt)
    .map((o) => new Date(o.executedAt as Date | string).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (openExec.length > 0) {
    return new Date(openExec[0]).toISOString()
  }
  return new Date(positionCreatedAt).toISOString()
}

/**
 * Latest executed CLOSE order time = exit timestamp (full/partial). Null when no close executed.
 * Prefers position.closedAt when present to align with the `closedAt` column.
 */
export function deriveExitAt(
  orders: DerivationOrderLike[],
  positionClosedAt: Date | string | null,
): string | null {
  if (positionClosedAt) {
    return new Date(positionClosedAt).toISOString()
  }
  const closeExec = orders
    .filter((o) => o.orderPurpose === "CLOSE" && o.status === "EXECUTED" && o.executedAt)
    .map((o) => new Date(o.executedAt as Date | string).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)
  if (closeExec.length > 0) {
    return new Date(closeExec[0]).toISOString()
  }
  return null
}
