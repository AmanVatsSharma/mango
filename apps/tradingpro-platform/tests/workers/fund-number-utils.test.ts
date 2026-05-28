/**
 * @file tests/workers/fund-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin fund-management numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminAddFundsAmountInput,
  normalizeAdminFundAmount,
  normalizeAdminOptionalNonNegativeAmountInput,
} from "@/components/admin-console/fund-number-utils"

describe("fund-number-utils", () => {
  it("normalizes admin fund amounts with non-negative fallback behavior", () => {
    expect(normalizeAdminFundAmount("1250.5")).toBe(1250.5)
    expect(normalizeAdminFundAmount("-10", 5)).toBe(5)
    expect(normalizeAdminFundAmount("Infinity", 7)).toBe(7)
  })

  it("normalizes add-funds input amount with strict positive guard", () => {
    expect(normalizeAdminAddFundsAmountInput("500")).toBe(500)
    expect(normalizeAdminAddFundsAmountInput("0")).toBeNull()
    expect(normalizeAdminAddFundsAmountInput("-5")).toBeNull()
    expect(normalizeAdminAddFundsAmountInput("NaN")).toBeNull()
  })

  it("normalizes optional non-negative amounts for optional payload fields", () => {
    expect(normalizeAdminOptionalNonNegativeAmountInput("750")).toBe(750)
    expect(normalizeAdminOptionalNonNegativeAmountInput("")).toBeUndefined()
    expect(normalizeAdminOptionalNonNegativeAmountInput("-10")).toBeUndefined()
    expect(normalizeAdminOptionalNonNegativeAmountInput("Infinity")).toBeUndefined()
  })
})
