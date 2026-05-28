/**
 * @file market-data-number-utils.test.ts
 * @module tests-market-data
 * @description Unit tests for market-data token and quote-age numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeMarketDataFiniteNumber,
  normalizeMarketDataPositiveToken,
  normalizeMarketDataQuoteMaxAgeMs,
} from "@/lib/market-data/market-data-number-utils"

describe("market-data-number-utils", () => {
  it("normalizes finite market-data numeric values", () => {
    expect(normalizeMarketDataFiniteNumber(10.5)).toBe(10.5)
    expect(normalizeMarketDataFiniteNumber("22.75")).toBe(22.75)
    expect(normalizeMarketDataFiniteNumber("NaN")).toBeNull()
  })

  it("normalizes strict positive token values", () => {
    expect(normalizeMarketDataPositiveToken("26000")).toBe(26000)
    expect(normalizeMarketDataPositiveToken(11536)).toBe(11536)
    expect(normalizeMarketDataPositiveToken("26e3")).toBeNull()
    expect(normalizeMarketDataPositiveToken(-1)).toBeNull()
  })

  it("normalizes quote max-age milliseconds with fallback", () => {
    expect(normalizeMarketDataQuoteMaxAgeMs("8000")).toBe(8000)
    expect(normalizeMarketDataQuoteMaxAgeMs(1200.9)).toBe(1200)
    expect(normalizeMarketDataQuoteMaxAgeMs("bad", 7500)).toBe(7500)
    expect(normalizeMarketDataQuoteMaxAgeMs(-10, 7500)).toBe(7500)
  })
})
