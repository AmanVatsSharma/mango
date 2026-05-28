/**
 * @file tests/workers/position-edit-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin position-edit dialog numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizePositionEditFundImpactInput,
  normalizePositionEditOptionalFinite,
  normalizePositionEditOptionalNonNegative,
  normalizePositionEditRequiredNonNegative,
} from "@/components/admin-console/position-edit-number-utils"

describe("position-edit-number-utils", () => {
  it("normalizes required and optional non-negative fields", () => {
    expect(normalizePositionEditRequiredNonNegative("10")).toBe(10)
    expect(normalizePositionEditRequiredNonNegative("-1")).toBeNull()
    expect(normalizePositionEditOptionalNonNegative("125.5")).toBe(125.5)
    expect(normalizePositionEditOptionalNonNegative("")).toBeNull()
    expect(normalizePositionEditOptionalNonNegative("abc")).toBeNull()
  })

  it("normalizes optional finite and fund-impact values safely", () => {
    expect(normalizePositionEditOptionalFinite("15.25")).toBe(15.25)
    expect(normalizePositionEditOptionalFinite("")).toBeUndefined()
    expect(normalizePositionEditOptionalFinite("NaN")).toBeUndefined()
    expect(normalizePositionEditFundImpactInput("100.5")).toBe(100.5)
    expect(normalizePositionEditFundImpactInput("Infinity")).toBe(0)
  })
})
