/**
 * @file tests/api/admin-analytics-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin analytics/report numeric + token/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminAnalyticsDateFilter,
  normalizeAdminAnalyticsNumericValue,
  normalizeAdminAnalyticsRangeToken,
  normalizeAdminFinancialPeriodToken,
} from "@/lib/server/admin-analytics-number-utils"

describe("admin-analytics-number-utils", () => {
  it("normalizes analytics range and report period tokens", () => {
    expect(normalizeAdminAnalyticsRangeToken("24h")).toBe("24h")
    expect(normalizeAdminAnalyticsRangeToken("30d")).toBe("30d")
    expect(normalizeAdminAnalyticsRangeToken("other")).toBe("7d")
    expect(normalizeAdminFinancialPeriodToken("day")).toBe("day")
    expect(normalizeAdminFinancialPeriodToken("quarter")).toBe("quarter")
    expect(normalizeAdminFinancialPeriodToken("bad")).toBe("month")
  })

  it("normalizes analytics date filters and numeric aggregates", () => {
    expect(normalizeAdminAnalyticsDateFilter("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeAdminAnalyticsDateFilter("")).toBeUndefined()
    expect(normalizeAdminAnalyticsDateFilter("bad-date")).toBeUndefined()
    expect(normalizeAdminAnalyticsNumericValue("100.25")).toBe(100.25)
    expect(normalizeAdminAnalyticsNumericValue(null, 7)).toBe(7)
    expect(normalizeAdminAnalyticsNumericValue("bad", 9)).toBe(9)
  })
})
