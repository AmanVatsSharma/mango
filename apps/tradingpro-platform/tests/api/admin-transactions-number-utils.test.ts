/**
 * @file tests/api/admin-transactions-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin transactions route numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminTransactionsAmountFilter,
  normalizeAdminTransactionsDateFilter,
  normalizeAdminTransactionsLimitParam,
  normalizeAdminTransactionsPageParam,
  normalizeAdminTransactionsPatchAmount,
  normalizeAdminTransactionsSortOrder,
} from "@/lib/server/admin-transactions-number-utils"

describe("admin-transactions-number-utils", () => {
  it("normalizes pagination params with safe fallback and clamping", () => {
    expect(normalizeAdminTransactionsPageParam("3")).toBe(3)
    expect(normalizeAdminTransactionsPageParam("0")).toBe(1)
    expect(normalizeAdminTransactionsPageParam("abc")).toBe(1)
    expect(normalizeAdminTransactionsLimitParam("10")).toBe(10)
    expect(normalizeAdminTransactionsLimitParam("1000")).toBe(200)
    expect(normalizeAdminTransactionsLimitParam("-2")).toBe(1)
    expect(normalizeAdminTransactionsLimitParam("NaN")).toBe(50)
  })

  it("normalizes amount/date filters and patch amount values", () => {
    expect(normalizeAdminTransactionsAmountFilter("123.5")).toBe(123.5)
    expect(normalizeAdminTransactionsAmountFilter("")).toBeNull()
    expect(normalizeAdminTransactionsAmountFilter("NaN")).toBeNull()
    expect(normalizeAdminTransactionsDateFilter("2026-02-15")).toBeInstanceOf(Date)
    expect(normalizeAdminTransactionsDateFilter("bad-date")).toBeNull()
    expect(normalizeAdminTransactionsPatchAmount("250")).toBe(250)
    expect(normalizeAdminTransactionsPatchAmount("-1")).toBeNull()
    expect(normalizeAdminTransactionsPatchAmount(undefined)).toBeNull()
  })

  it("normalizes sort order defensively", () => {
    expect(normalizeAdminTransactionsSortOrder("asc")).toBe("asc")
    expect(normalizeAdminTransactionsSortOrder("ASC")).toBe("asc")
    expect(normalizeAdminTransactionsSortOrder("desc")).toBe("desc")
    expect(normalizeAdminTransactionsSortOrder("other")).toBe("desc")
  })
})
