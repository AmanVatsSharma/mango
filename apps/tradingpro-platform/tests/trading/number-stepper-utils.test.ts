/**
 * @file tests/trading/number-stepper-utils.test.ts
 * @module tests-trading
 * @description Unit tests for number-stepper numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeNumberStepperInputValue,
  normalizeNumberStepperRoundedValue,
} from "@/components/ui/number-stepper-utils"

describe("number-stepper-utils", () => {
  it("normalizes rounded values to two decimal precision", () => {
    expect(normalizeNumberStepperRoundedValue(1.005)).toBe(1)
    expect(normalizeNumberStepperRoundedValue(1.006)).toBe(1.01)
    expect(normalizeNumberStepperRoundedValue(10.239)).toBe(10.24)
  })

  it("normalizes direct input values and rejects malformed input", () => {
    expect(normalizeNumberStepperInputValue("12.5")).toBe(12.5)
    expect(normalizeNumberStepperInputValue("-2")).toBe(-2)
    expect(normalizeNumberStepperInputValue("NaN")).toBeNull()
    expect(normalizeNumberStepperInputValue("Infinity")).toBeNull()
  })
})
