/**
 * @file tests/trading/realtime-account-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for realtime account SSE numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeRealtimeAccountPatchValue,
  parseFiniteRealtimeAccountNumber,
} from "@/lib/hooks/realtime-account-number-utils"

describe("realtime-account-number-utils", () => {
  it("parses finite realtime account numbers", () => {
    expect(parseFiniteRealtimeAccountNumber("1200.5")).toBe(1200.5)
    expect(parseFiniteRealtimeAccountNumber(0)).toBe(0)
    expect(parseFiniteRealtimeAccountNumber("Infinity")).toBeNull()
  })

  it("falls back to prior values for malformed patch values", () => {
    expect(normalizeRealtimeAccountPatchValue("1500.75", 1000)).toBe(1500.75)
    expect(normalizeRealtimeAccountPatchValue("NaN", 1000)).toBe(1000)
    expect(normalizeRealtimeAccountPatchValue(Symbol("bad"), 1000)).toBe(1000)
  })
})
