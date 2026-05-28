/**
 * @file tests/workers/orders-management-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin orders-management numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeOrdersManagementEditPrice,
  normalizeOrdersManagementEditQuantity,
  normalizeOrdersManagementNonNegative,
  normalizeOrdersManagementNullableNonNegative,
  normalizeOrdersManagementPage,
} from "@/components/admin-console/orders-management-number-utils"

describe("orders-management-number-utils", () => {
  it("normalizes pagination and row numeric values safely", () => {
    expect(normalizeOrdersManagementPage("3")).toBe(3)
    expect(normalizeOrdersManagementPage("0")).toBe(1)
    expect(normalizeOrdersManagementPage("NaN")).toBe(1)
    expect(normalizeOrdersManagementNonNegative("12.5")).toBe(12.5)
    expect(normalizeOrdersManagementNonNegative("-1", 9)).toBe(9)
    expect(normalizeOrdersManagementNullableNonNegative("100")).toBe(100)
    expect(normalizeOrdersManagementNullableNonNegative("-5")).toBeNull()
  })

  it("normalizes edit quantity and price values with strict guards", () => {
    expect(normalizeOrdersManagementEditQuantity("10")).toBe(10)
    expect(normalizeOrdersManagementEditQuantity("10.5")).toBeNull()
    expect(normalizeOrdersManagementEditQuantity("-1")).toBeNull()
    expect(normalizeOrdersManagementEditPrice("250.75")).toBe(250.75)
    expect(normalizeOrdersManagementEditPrice("Infinity")).toBeNull()
  })
})
