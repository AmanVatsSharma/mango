/**
 * @file tests/workers/positions-management-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin positions-management numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeCreatePositionLotSize,
  normalizeCreatePositionPrice,
  normalizeCreatePositionQuantity,
  normalizePositionsManagementFinite,
  normalizePositionsManagementNonNegative,
  normalizePositionsManagementNullableNonNegative,
  normalizePositionsManagementPage,
} from "@/components/admin-console/positions-management-number-utils"

describe("positions-management-number-utils", () => {
  it("normalizes pagination and row numeric values safely", () => {
    expect(normalizePositionsManagementPage("2")).toBe(2)
    expect(normalizePositionsManagementPage("0")).toBe(1)
    expect(normalizePositionsManagementPage("NaN")).toBe(1)
    expect(normalizePositionsManagementNonNegative("125.5")).toBe(125.5)
    expect(normalizePositionsManagementNonNegative("-1", 9)).toBe(9)
    expect(normalizePositionsManagementFinite("-125.5")).toBe(-125.5)
    expect(normalizePositionsManagementFinite("NaN", 7)).toBe(7)
    expect(normalizePositionsManagementNullableNonNegative("100")).toBe(100)
    expect(normalizePositionsManagementNullableNonNegative("-5")).toBeNull()
  })

  it("normalizes create-position numeric values with strict guards", () => {
    expect(normalizeCreatePositionQuantity("10")).toBe(10)
    expect(normalizeCreatePositionQuantity("10.5")).toBeNull()
    expect(normalizeCreatePositionQuantity("1e3")).toBeNull()
    expect(normalizeCreatePositionQuantity("0")).toBeNull()
    expect(normalizeCreatePositionPrice("250.75")).toBe(250.75)
    expect(normalizeCreatePositionPrice("0")).toBeNull()
    expect(normalizeCreatePositionLotSize("75")).toBe(75)
    expect(normalizeCreatePositionLotSize("1e3")).toBeUndefined()
    expect(normalizeCreatePositionLotSize("0")).toBeUndefined()
  })
})
