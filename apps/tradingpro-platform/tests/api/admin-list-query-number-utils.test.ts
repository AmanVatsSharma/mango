/**
 * @file tests/api/admin-list-query-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for shared admin list-query numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminListDateFilter,
  normalizeAdminListDaysParam,
  normalizeAdminListLimitParam,
  normalizeAdminListPageParam,
} from "@/lib/server/admin-list-query-number-utils"

describe("admin-list-query-number-utils", () => {
  it("normalizes page and limit params with fallback and clamping", () => {
    expect(normalizeAdminListPageParam("3")).toBe(3)
    expect(normalizeAdminListPageParam("0")).toBe(1)
    expect(normalizeAdminListPageParam("bad")).toBe(1)
    expect(normalizeAdminListLimitParam("25", 50, 200)).toBe(25)
    expect(normalizeAdminListLimitParam("1000", 50, 200)).toBe(200)
    expect(normalizeAdminListLimitParam("-3", 50, 200)).toBe(1)
    expect(normalizeAdminListLimitParam("bad", 50, 200)).toBe(50)
  })

  it("normalizes days and date filters safely", () => {
    expect(normalizeAdminListDaysParam("30", 7, 365)).toBe(30)
    expect(normalizeAdminListDaysParam("0", 7, 365)).toBe(1)
    expect(normalizeAdminListDaysParam("999", 7, 365)).toBe(365)
    expect(normalizeAdminListDaysParam("bad", 7, 365)).toBe(7)
    expect(normalizeAdminListDateFilter("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeAdminListDateFilter("")).toBeUndefined()
    expect(normalizeAdminListDateFilter("bad-date")).toBeUndefined()
  })
})
