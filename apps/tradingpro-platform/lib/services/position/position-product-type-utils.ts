/**
 * @file position-product-type-utils.ts
 * @module position
 * @description Product-type resolution helpers for position-side order classification.
 * @author StockTrade
 * @created 2026-02-21
 */

import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"
import {
  isIntradayRiskConfigProductType,
  normalizeRiskConfigProductType,
} from "@/lib/services/risk/risk-config-normalizer"

const EXECUTED_ORDER_STATUSES = new Set(["EXECUTED", "COMPLETE", "FILLED", "TRADED"])

type PositionEntrySide = "BUY" | "SELL"

type NormalizedExecutedOrder = {
  id?: string
  orderSide: PositionEntrySide | ""
  productType: string
  createdAtMs: number
  stableIndex: number
}

export type PositionOrderProductTypeCandidate = {
  id?: unknown
  orderSide?: unknown
  status?: unknown
  productType?: unknown
  createdAt?: unknown
}

export type ResolvedPositionProductType = {
  productType: string
  isIntraday: boolean
  source: "entry_executed_order" | "latest_executed_order" | "default"
  entrySide: PositionEntrySide
  orderId?: string
}

function normalizeUpperToken(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().toUpperCase()
}

function normalizeOrderId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedId = value.trim()
  return normalizedId.length > 0 ? normalizedId : undefined
}

function normalizeOrderTimestampToEpochMs(value: unknown): number {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return 0
    }
    const parsedTimestamp = Date.parse(normalizedValue)
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
  }
  return 0
}

function normalizePositionEntrySide(quantity: unknown): PositionEntrySide {
  const normalizedQuantity = parseFinitePositionNumber(quantity) ?? 0
  return normalizedQuantity < 0 ? "SELL" : "BUY"
}

function isExecutedOrderStatus(status: unknown): boolean {
  return EXECUTED_ORDER_STATUSES.has(normalizeUpperToken(status))
}

function normalizeExecutedOrders(rawOrders: unknown): NormalizedExecutedOrder[] {
  if (!Array.isArray(rawOrders)) {
    return []
  }

  const normalizedOrders = rawOrders
    .map((order, stableIndex) => {
      const candidate = (order ?? {}) as PositionOrderProductTypeCandidate
      return {
        id: normalizeOrderId(candidate.id),
        orderSide: normalizeUpperToken(candidate.orderSide) as PositionEntrySide | "",
        productType: normalizeUpperToken(candidate.productType),
        createdAtMs: normalizeOrderTimestampToEpochMs(candidate.createdAt),
        stableIndex,
        status: candidate.status,
      }
    })
    .filter((order) => isExecutedOrderStatus(order.status))

  normalizedOrders.sort((left, right) => {
    if (right.createdAtMs !== left.createdAtMs) {
      return right.createdAtMs - left.createdAtMs
    }
    return left.stableIndex - right.stableIndex
  })

  return normalizedOrders.map(({ id, orderSide, productType, createdAtMs, stableIndex }) => ({
    id,
    orderSide,
    productType,
    createdAtMs,
    stableIndex,
  }))
}

export function resolvePositionProductType(input: {
  quantity?: unknown
  orders?: unknown
  defaultProductType?: unknown
}): ResolvedPositionProductType {
  const entrySide = normalizePositionEntrySide(input.quantity)
  const defaultProductType = normalizeRiskConfigProductType(input.defaultProductType ?? "MIS")
  const executedOrders = normalizeExecutedOrders(input.orders)

  const entryExecutedOrder = executedOrders.find((order) => order.orderSide === entrySide)
  if (entryExecutedOrder && entryExecutedOrder.productType) {
    const normalizedProductType = normalizeRiskConfigProductType(entryExecutedOrder.productType)
    return {
      productType: normalizedProductType,
      isIntraday: isIntradayRiskConfigProductType(normalizedProductType),
      source: "entry_executed_order",
      entrySide,
      orderId: entryExecutedOrder.id,
    }
  }

  const latestExecutedOrder = executedOrders[0]
  if (latestExecutedOrder && latestExecutedOrder.productType) {
    const normalizedProductType = normalizeRiskConfigProductType(latestExecutedOrder.productType)
    return {
      productType: normalizedProductType,
      isIntraday: isIntradayRiskConfigProductType(normalizedProductType),
      source: "latest_executed_order",
      entrySide,
      orderId: latestExecutedOrder.id,
    }
  }

  return {
    productType: defaultProductType,
    isIntraday: isIntradayRiskConfigProductType(defaultProductType),
    source: "default",
    entrySide,
  }
}

