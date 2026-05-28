/**
 * @file tests/api/admin-positions-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin positions route numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminPositionCreateLotSize,
  normalizeAdminPositionCreatePrice,
  normalizeAdminPositionCreateQuantity,
  normalizeAdminPositionFinite,
  normalizeAdminPositionNonNegative,
  normalizeAdminPositionNullableNonNegativeUpdate,
  normalizeAdminPositionsDateFilter,
  normalizeAdminPositionsLimitParam,
  normalizeAdminPositionsPageParam,
  normalizeAdminPositionsSortOrder,
} from "@/lib/server/admin-positions-number-utils"

describe("admin-positions-number-utils", () => {
  it("normalizes pagination and sort-order params", () => {
    expect(normalizeAdminPositionsPageParam("3")).toBe(3)
    expect(normalizeAdminPositionsPageParam("0")).toBe(1)
    expect(normalizeAdminPositionsPageParam("NaN")).toBe(1)
    expect(normalizeAdminPositionsLimitParam("10")).toBe(10)
    expect(normalizeAdminPositionsLimitParam("1000")).toBe(200)
    expect(normalizeAdminPositionsLimitParam("0")).toBe(1)
    expect(normalizeAdminPositionsSortOrder("asc")).toBe("asc")
    expect(normalizeAdminPositionsSortOrder("DESC")).toBe("desc")
  })

  it("normalizes date and update numeric values safely", () => {
    expect(normalizeAdminPositionsDateFilter("2026-02-15")).toBeInstanceOf(Date)
    expect(normalizeAdminPositionsDateFilter("bad-date")).toBeNull()
    expect(normalizeAdminPositionFinite("100.5")).toBe(100.5)
    expect(normalizeAdminPositionFinite("Infinity")).toBeNull()
    expect(normalizeAdminPositionNonNegative("15")).toBe(15)
    expect(normalizeAdminPositionNonNegative("-1")).toBeNull()
    expect(normalizeAdminPositionNullableNonNegativeUpdate(undefined)).toBeUndefined()
    expect(normalizeAdminPositionNullableNonNegativeUpdate(null)).toBeNull()
    expect(normalizeAdminPositionNullableNonNegativeUpdate("2.5")).toBe(2.5)
    expect(normalizeAdminPositionNullableNonNegativeUpdate("bad")).toBeNull()
  })

  it("normalizes create-position quantity/price/lot-size guards", () => {
    expect(normalizeAdminPositionCreateQuantity("10")).toBe(10)
    expect(normalizeAdminPositionCreateQuantity("1e2")).toBeNull()
    expect(normalizeAdminPositionCreatePrice("250.25")).toBe(250.25)
    expect(normalizeAdminPositionCreatePrice("0")).toBeNull()
    expect(normalizeAdminPositionCreateLotSize("75")).toBe(75)
    expect(normalizeAdminPositionCreateLotSize("0")).toBeUndefined()
  })
})
