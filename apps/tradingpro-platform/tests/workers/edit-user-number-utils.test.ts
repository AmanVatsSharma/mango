/**
 * @file tests/workers/edit-user-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin edit-user dialog numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeEditUserAmountForDisplay,
  normalizeEditUserLeverageMultiplierInput,
  normalizeEditUserRequiredNonNegativeAmount,
} from "@/components/admin-console/edit-user-number-utils"

describe("edit-user-number-utils", () => {
  it("normalizes required non-negative trading account amounts", () => {
    expect(normalizeEditUserRequiredNonNegativeAmount("100")).toBe(100)
    expect(normalizeEditUserRequiredNonNegativeAmount("0")).toBe(0)
    expect(normalizeEditUserRequiredNonNegativeAmount("-1")).toBeNull()
    expect(normalizeEditUserRequiredNonNegativeAmount("NaN")).toBeNull()
  })

  it("normalizes display amounts and leverage multiplier input safely", () => {
    expect(normalizeEditUserAmountForDisplay("250.5")).toBe(250.5)
    expect(normalizeEditUserAmountForDisplay("Infinity")).toBe(0)
    expect(normalizeEditUserLeverageMultiplierInput("1.5")).toBe(1.5)
    expect(normalizeEditUserLeverageMultiplierInput("")).toBeNull()
    expect(normalizeEditUserLeverageMultiplierInput("abc")).toBeNull()
  })
})
