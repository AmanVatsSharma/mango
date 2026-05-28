/**
 * @file tests/trading/realtime-position-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for realtime position numeric and closed-state helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteRealtimePositionNumber,
  resolveRealtimePositionClosedState,
} from "@/lib/hooks/realtime-position-number-utils"

describe("realtime-position-number-utils", () => {
  it("parses finite numeric candidates and rejects malformed values", () => {
    expect(parseFiniteRealtimePositionNumber("10.5")).toBe(10.5)
    expect(parseFiniteRealtimePositionNumber(0)).toBe(0)
    expect(parseFiniteRealtimePositionNumber("Infinity")).toBeNull()
    expect(parseFiniteRealtimePositionNumber(Symbol("bad"))).toBeNull()
  })

  it("resolves closed state from event and strict quantity parsing", () => {
    expect(resolveRealtimePositionClosedState("position_closed", undefined)).toBe(true)
    expect(resolveRealtimePositionClosedState("position_updated", "0")).toBe(true)
    expect(resolveRealtimePositionClosedState("position_updated", undefined)).toBe(false)
    expect(resolveRealtimePositionClosedState("position_updated", "NaN")).toBe(false)
  })
})
