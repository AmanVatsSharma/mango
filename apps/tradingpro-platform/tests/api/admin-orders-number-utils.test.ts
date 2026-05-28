/**
 * @file tests/api/admin-orders-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin orders route numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminOrdersDateFilter,
  normalizeAdminOrdersExecutedAt,
  normalizeAdminOrdersLimitParam,
  normalizeAdminOrdersNonNegativeUpdate,
  normalizeAdminOrdersNullableNonNegativeUpdate,
  normalizeAdminOrdersPageParam,
  normalizeAdminOrdersSortOrder,
} from "@/lib/server/admin-orders-number-utils"

describe("admin-orders-number-utils", () => {
  it("normalizes page and limit query params with fallback/clamping", () => {
    expect(normalizeAdminOrdersPageParam("2")).toBe(2)
    expect(normalizeAdminOrdersPageParam("0")).toBe(1)
    expect(normalizeAdminOrdersPageParam("bad")).toBe(1)
    expect(normalizeAdminOrdersLimitParam("25")).toBe(25)
    expect(normalizeAdminOrdersLimitParam("999")).toBe(200)
    expect(normalizeAdminOrdersLimitParam("0")).toBe(1)
    expect(normalizeAdminOrdersLimitParam("bad")).toBe(50)
  })

  it("normalizes date and numeric update values safely", () => {
    expect(normalizeAdminOrdersDateFilter("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeAdminOrdersDateFilter("not-a-date")).toBeNull()
    expect(normalizeAdminOrdersNonNegativeUpdate("5")).toBe(5)
    expect(normalizeAdminOrdersNonNegativeUpdate("-1")).toBeNull()
    expect(normalizeAdminOrdersNullableNonNegativeUpdate(undefined)).toBeUndefined()
    expect(normalizeAdminOrdersNullableNonNegativeUpdate(null)).toBeNull()
    expect(normalizeAdminOrdersNullableNonNegativeUpdate("10.5")).toBe(10.5)
    expect(normalizeAdminOrdersNullableNonNegativeUpdate("bad")).toBeNull()
  })

  it("normalizes sort order and executedAt parsing", () => {
    expect(normalizeAdminOrdersSortOrder("asc")).toBe("asc")
    expect(normalizeAdminOrdersSortOrder("DESC")).toBe("desc")
    expect(normalizeAdminOrdersSortOrder("other")).toBe("desc")
    expect(normalizeAdminOrdersExecutedAt("2026-02-16T10:30:00.000Z")).toBeInstanceOf(Date)
    expect(normalizeAdminOrdersExecutedAt("")).toBeNull()
    expect(normalizeAdminOrdersExecutedAt(null)).toBeNull()
    expect(normalizeAdminOrdersExecutedAt("bad-date")).toBeUndefined()
    expect(normalizeAdminOrdersExecutedAt(undefined)).toBeUndefined()
  })
})
