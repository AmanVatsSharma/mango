/**
 * @file order-management-number-utils.ts
 * @module components
 * @description Strict numeric normalization helpers for order-management dialog inputs and modify payload shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export type OrderTab = "all" | "pending" | "executed" | "cancelled"

interface OrderStatusShape {
  status: string
  isOptimistic?: boolean
}

function normalizeOrderStatus(status: unknown): string {
  return typeof status === "string" ? status.toUpperCase() : ""
}

function isPendingOrder(order: OrderStatusShape): boolean {
  const normalizedStatus = normalizeOrderStatus(order.status)
  return normalizedStatus === "PENDING" || (order.isOptimistic === true && normalizedStatus === "PENDING")
}

function isExecutedOrder(order: OrderStatusShape): boolean {
  return normalizeOrderStatus(order.status) === "EXECUTED"
}

function isCancelledOrder(order: OrderStatusShape): boolean {
  const normalizedStatus = normalizeOrderStatus(order.status)
  return normalizedStatus === "CANCELLED" || normalizedStatus === "REJECTED"
}

export function normalizeOrderManagementInputNumber(value: string): number {
  return parseFiniteMarketNumber(value) ?? 0
}

export function normalizeOrderManagementModifyPayload(input: {
  price?: unknown
  quantity?: unknown
}): { price?: number; quantity?: number } | null {
  const normalizedPrice = parseFiniteMarketNumber(input.price)
  const normalizedQuantity = parseFiniteMarketNumber(input.quantity)

  const output: { price?: number; quantity?: number } = {}
  if (normalizedPrice !== null && normalizedPrice > 0) {
    output.price = normalizedPrice
  }
  if (normalizedQuantity !== null && Number.isInteger(normalizedQuantity) && normalizedQuantity > 0) {
    output.quantity = normalizedQuantity
  }

  return Object.keys(output).length > 0 ? output : null
}

export function filterOrdersByTab<T extends OrderStatusShape>(orders: T[], tab: OrderTab): T[] {
  if (tab === "all") {
    return orders
  }

  return orders.filter((order) => {
    if (tab === "pending") {
      return isPendingOrder(order)
    }
    if (tab === "executed") {
      return isExecutedOrder(order)
    }
    return isCancelledOrder(order)
  })
}

export function getOrderTabCounts<T extends OrderStatusShape>(orders: T[]): Record<OrderTab, number> {
  return {
    all: orders.length,
    pending: filterOrdersByTab(orders, "pending").length,
    executed: filterOrdersByTab(orders, "executed").length,
    cancelled: filterOrdersByTab(orders, "cancelled").length,
  }
}
