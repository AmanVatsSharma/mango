/**
 * @file tests/workers/risk-management-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin risk-management numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-08 — `riskConfigNullableNumberInputString` + zero brokerage parsing.
 */

import {
  normalizeRiskConfigLeverageInput,
  normalizeRiskConfigNullableNonNegativeInput,
  normalizeRiskConfigNullableNonNegativeIntegerInput,
  normalizeRiskLimitNonNegativeInput,
  normalizeRiskLimitNonNegativeIntegerInput,
  normalizeRiskManagementFractionThresholdInput,
  riskConfigNullableNumberInputString,
} from "@/components/admin-console/risk-management-number-utils"

describe("risk-management-number-utils", () => {
  it("normalizes threshold percentage inputs into bounded fractions", () => {
    expect(normalizeRiskManagementFractionThresholdInput("80", 0.75)).toBe(0.8)
    expect(normalizeRiskManagementFractionThresholdInput("150", 0.75)).toBe(1)
    expect(normalizeRiskManagementFractionThresholdInput("-5", 0.75)).toBe(0)
    expect(normalizeRiskManagementFractionThresholdInput("NaN", 0.75)).toBe(0.75)
  })

  it("formats nullable numbers for controlled inputs without dropping zero", () => {
    expect(riskConfigNullableNumberInputString(null)).toBe("")
    expect(riskConfigNullableNumberInputString(undefined)).toBe("")
    expect(riskConfigNullableNumberInputString(0)).toBe("0")
    expect(riskConfigNullableNumberInputString(0.5)).toBe("0.5")
  })

  it("normalizes risk config numeric fields with strict nullable guards", () => {
    expect(normalizeRiskConfigLeverageInput("5", 2)).toBe(5)
    expect(normalizeRiskConfigLeverageInput("0", 2)).toBe(2)
    expect(normalizeRiskConfigNullableNonNegativeInput("1250.5")).toBe(1250.5)
    expect(normalizeRiskConfigNullableNonNegativeInput("0")).toBe(0)
    expect(normalizeRiskConfigNullableNonNegativeInput("")).toBeNull()
    expect(normalizeRiskConfigNullableNonNegativeInput("-1")).toBeNull()
    expect(normalizeRiskConfigNullableNonNegativeIntegerInput("10")).toBe(10)
    expect(normalizeRiskConfigNullableNonNegativeIntegerInput("10.5")).toBeNull()
    expect(normalizeRiskConfigNullableNonNegativeIntegerInput("")).toBeNull()
  })

  it("normalizes risk limit numeric fields with fallback behavior", () => {
    expect(normalizeRiskLimitNonNegativeInput("25000", 1)).toBe(25000)
    expect(normalizeRiskLimitNonNegativeInput("-1", 1)).toBe(1)
    expect(normalizeRiskLimitNonNegativeIntegerInput("7", 2)).toBe(7)
    expect(normalizeRiskLimitNonNegativeIntegerInput("abc", 2)).toBe(2)
    expect(normalizeRiskLimitNonNegativeIntegerInput("7.2", 2)).toBe(2)
  })
})
