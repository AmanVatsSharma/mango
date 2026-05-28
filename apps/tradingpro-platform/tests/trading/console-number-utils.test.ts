/**
 * @file tests/trading/console-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for console numeric/date normalization helpers used by account, statements, deposits, and withdrawals views.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeConsoleAmountInput,
  normalizeConsoleNonNegativeNumber,
  normalizeConsoleNumber,
  normalizeConsoleTimestamp,
} from "@/components/console/console-number-utils"

describe("console-number-utils", () => {
  it("normalizes finite and non-negative numeric values safely", () => {
    expect(normalizeConsoleNumber("125.5")).toBe(125.5)
    expect(normalizeConsoleNumber("Infinity")).toBe(0)
    expect(normalizeConsoleNumber(Symbol("bad"), 10)).toBe(10)
    expect(normalizeConsoleNonNegativeNumber("-10")).toBe(0)
    expect(normalizeConsoleNonNegativeNumber("250.75")).toBe(250.75)
  })

  it("normalizes console amount inputs and timestamp values", () => {
    expect(normalizeConsoleAmountInput("1500.25")).toBe(1500.25)
    expect(normalizeConsoleAmountInput("NaN")).toBe(0)
    expect(normalizeConsoleTimestamp("2026-02-16T10:00:00.000Z")?.toISOString()).toBe("2026-02-16T10:00:00.000Z")
    expect(normalizeConsoleTimestamp("not-a-date")).toBeNull()
    expect(normalizeConsoleTimestamp("")).toBeNull()
  })
})
