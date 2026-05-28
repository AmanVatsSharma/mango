/**
 * @file tests/trading/position-dialog-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for position dialog input numeric normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizePositionDialogInputNumber } from "@/components/position/position-dialog-number-utils"

describe("position-dialog-number-utils", () => {
  it("normalizes finite numeric strings", () => {
    expect(normalizePositionDialogInputNumber("123.45")).toBe(123.45)
    expect(normalizePositionDialogInputNumber(" 0 ")).toBe(0)
  })

  it("falls back to zero for non-finite or malformed values", () => {
    expect(normalizePositionDialogInputNumber("Infinity")).toBe(0)
    expect(normalizePositionDialogInputNumber("NaN")).toBe(0)
    expect(normalizePositionDialogInputNumber("abc")).toBe(0)
    expect(normalizePositionDialogInputNumber("")).toBe(0)
  })
})
