/**
 * @file tests/trading/instrument-search-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for instrument-search numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeInstrumentSearchLotSize,
  normalizeInstrumentSearchNonNegativeNumber,
  normalizeInstrumentSearchOptionType,
  normalizeInstrumentSearchToken,
} from "@/lib/hooks/instrument-search-number-utils"

describe("instrument-search-number-utils", () => {
  it("normalizes token and lot-size values using strict positive integers", () => {
    expect(normalizeInstrumentSearchToken("26000")).toBe(26000)
    expect(normalizeInstrumentSearchToken("1e3")).toBeUndefined()
    expect(normalizeInstrumentSearchLotSize("75")).toBe(75)
    expect(normalizeInstrumentSearchLotSize("0")).toBeUndefined()
  })

  it("normalizes non-negative numeric values with finite guardrails", () => {
    expect(normalizeInstrumentSearchNonNegativeNumber("250.5")).toBe(250.5)
    expect(normalizeInstrumentSearchNonNegativeNumber("NaN")).toBeUndefined()
    expect(normalizeInstrumentSearchNonNegativeNumber("Infinity")).toBeUndefined()
  })

  it("normalizes option types in strict and legacy modes", () => {
    expect(normalizeInstrumentSearchOptionType("ce", "strict")).toBe("CE")
    expect(normalizeInstrumentSearchOptionType("xx", "strict")).toBeUndefined()
    expect(normalizeInstrumentSearchOptionType("xx", "legacy")).toBeUndefined()
    expect(normalizeInstrumentSearchOptionType("pe", "legacy")).toBe("PE")
  })
})
