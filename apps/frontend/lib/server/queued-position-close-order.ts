/**
 * @file queued-position-close-order.ts
 * @module server
 * @description Enqueue a CLOSE-purpose Order (Option A) for worker-driven position exits.
 * @author StockTrade
 * @created 2026-03-30
 * @updated 2026-03-31
 *
 * Notes:
 * - Uses zero admission margin/charges; execution uses the same quote path as other MARKET orders in `OrderExecutionWorker`.
 * - **Async vs sync close**: `POST` without `async` runs `resolveSquareOffExitPrice` in the API (full policy + audit in the HTTP response). Enqueueing (`async: true` / `?async=1`) defers policy to the worker: after the initial MARKET quote, `OrderExecutionWorker` calls `resolveSquareOffExitPrice` again so booked price matches global square-off rules (defer on transient `MARKET_DATA_DEGRADED`-class failures within the same retry window as stale quotes).
 */

import { OrderPurpose, OrderSide, OrderStatus, OrderType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { OrderRepository } from "@/lib/repositories/OrderRepository"
import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"
import { resolvePositionProductType } from "@/lib/services/position/position-product-type-utils"

export type EnqueueQueuedPositionCloseResult = {
  orderId: string
  positionId: string
  /** True when an identical in-flight close was already queued. */
  deduped: boolean
}

/**
 * Creates (or returns) a single PENDING CLOSE order per open position (broker-style queue).
 */
export async function enqueueQueuedPositionCloseOrder(input: {
  positionId: string
  tradingAccountId: string
  closeQuantityAbs: number
  closeMetadata?: Prisma.InputJsonValue
}): Promise<EnqueueQueuedPositionCloseResult> {
  const { positionId, tradingAccountId, closeQuantityAbs } = input

  const existing = await prisma.order.findFirst({
    where: {
      positionId,
      tradingAccountId,
      status: OrderStatus.PENDING,
      orderPurpose: OrderPurpose.CLOSE,
    },
    select: { id: true },
  })
  if (existing) {
    return { orderId: existing.id, positionId, deduped: true }
  }

  const position = await prisma.position.findFirst({
    where: { id: positionId, tradingAccountId },
    include: {
      Stock: true,
      orders: {
        select: { productType: true, orderSide: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!position) {
    throw new Error("Position not found")
  }
  const qty = Math.trunc(parseFinitePositionNumber(position.quantity) ?? 0)
  if (qty === 0) {
    throw new Error("Position is already closed")
  }
  if (!position.stockId) {
    throw new Error("Position data incomplete - missing stock reference")
  }

  const absOpen = Math.abs(qty)
  const closeAbs = Math.max(1, Math.trunc(closeQuantityAbs))
  if (closeAbs > absOpen) {
    throw new Error(`closeQuantity cannot exceed open quantity (${absOpen})`)
  }
  const lotSize = Math.max(1, Math.trunc(parseFinitePositionNumber(position.Stock?.lot_size) ?? 1))
  if (lotSize > 1 && closeAbs % lotSize !== 0) {
    throw new Error(`closeQuantity must be a multiple of lot size (${lotSize})`)
  }

  const productTypeResolution = resolvePositionProductType({
    quantity: qty,
    orders: position.orders,
    defaultProductType: position.productType || "MIS",
  })
  const productType = productTypeResolution.productType
  const exitSide = qty > 0 ? OrderSide.SELL : OrderSide.BUY

  const orderRepo = new OrderRepository()
  const created = await orderRepo.create({
    tradingAccountId,
    stockId: position.stockId,
    symbol: position.symbol,
    quantity: closeAbs,
    price: null,
    orderType: OrderType.MARKET,
    orderSide: exitSide,
    productType,
    status: OrderStatus.PENDING,
    orderPurpose: OrderPurpose.CLOSE,
    positionId,
    blockedMargin: 0,
    placementCharges: 0,
    closeMetadata: input.closeMetadata ?? undefined,
  })

  return { orderId: created.id, positionId, deduped: false }
}
