/**
 * @file tests/trading/order-management-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for order-management dialog numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  filterOrdersByTab,
  getOrderTabCounts,
  normalizeOrderManagementInputNumber,
  normalizeOrderManagementModifyPayload,
} from "@/components/order-management-number-utils"

describe("order-management-number-utils", () => {
  it("normalizes finite dialog input values", () => {
    expect(normalizeOrderManagementInputNumber("12.5")).toBe(12.5)
    expect(normalizeOrderManagementInputNumber("0")).toBe(0)
    expect(normalizeOrderManagementInputNumber("Infinity")).toBe(0)
  })

  it("normalizes modify payload with strict positive guards", () => {
    expect(normalizeOrderManagementModifyPayload({ quantity: "2", price: "125.5" })).toEqual({
      quantity: 2,
      price: 125.5,
    })
    expect(normalizeOrderManagementModifyPayload({ quantity: "2.5", price: "0" })).toBeNull()
    expect(normalizeOrderManagementModifyPayload({ quantity: "abc", price: "200" })).toEqual({ price: 200 })
  })

  it("filters order collections by tab status rules", () => {
    const orders = [
      { id: "1", status: "PENDING", isOptimistic: true },
      { id: "2", status: "executed" },
      { id: "3", status: "CANCELLED" },
      { id: "4", status: "REJECTED" },
      { id: "5", status: "OPEN" },
    ]

    expect(filterOrdersByTab(orders, "all")).toHaveLength(5)
    expect(filterOrdersByTab(orders, "pending").map(order => order.id)).toEqual(["1"])
    expect(filterOrdersByTab(orders, "executed").map(order => order.id)).toEqual(["2"])
    expect(filterOrdersByTab(orders, "cancelled").map(order => order.id)).toEqual(["3", "4"])
  })

  it("derives tab counts for desktop status chips", () => {
    const orders = [
      { status: "pending", isOptimistic: true },
      { status: "PENDING" },
      { status: "EXECUTED" },
      { status: "cancelled" },
      { status: "REJECTED" },
      { status: "OPEN" },
    ]

    expect(getOrderTabCounts(orders)).toEqual({
      all: 6,
      pending: 2,
      executed: 1,
      cancelled: 2,
    })
  })
})
