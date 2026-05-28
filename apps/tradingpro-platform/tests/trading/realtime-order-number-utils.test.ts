/**
 * @file tests/trading/realtime-order-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for realtime order SSE numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeRealtimeOrderPrice,
  normalizeRealtimeOrderQuantity,
  parseFiniteRealtimeOrderNumber,
} from "@/lib/hooks/realtime-order-number-utils"

describe("realtime-order-number-utils", () => {
  it("parses finite realtime order numbers", () => {
    expect(parseFiniteRealtimeOrderNumber("150.5")).toBe(150.5)
    expect(parseFiniteRealtimeOrderNumber(0)).toBe(0)
    expect(parseFiniteRealtimeOrderNumber("Infinity")).toBeNull()
    expect(parseFiniteRealtimeOrderNumber(Symbol("bad"))).toBeNull()
  })

  it("normalizes realtime order quantities and prices safely", () => {
    expect(normalizeRealtimeOrderQuantity("2")).toBe(2)
    expect(normalizeRealtimeOrderQuantity("NaN")).toBe(0)
    expect(normalizeRealtimeOrderPrice("150.5")).toBe(150.5)
    expect(normalizeRealtimeOrderPrice("Infinity")).toBeNull()
  })
})
