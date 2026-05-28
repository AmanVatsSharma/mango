/**
 * @file quote-normalizer-stop-triggers.test.ts
 * @module tests-position
 * @description Unit tests for SL/TP quote reliability helper.
 * @author StockTrade
 * @created 2026-03-25
 */

import {
  isQuoteSourceSuitableForStopTriggers,
  normalizeQuotePrices,
} from "@/lib/services/position/quote-normalizer"

describe("isQuoteSourceSuitableForStopTriggers", () => {
  it("returns true when currentPrice is from live quote", () => {
    const n = normalizeQuotePrices({
      quote: { last_trade_price: 100 },
      stockLtp: null,
      averagePrice: 50,
    })
    expect(isQuoteSourceSuitableForStopTriggers(n)).toBe(true)
  })

  it("returns true when currentPrice is from stock LTP", () => {
    const n = normalizeQuotePrices({
      quote: null,
      stockLtp: 88,
      averagePrice: 50,
    })
    expect(isQuoteSourceSuitableForStopTriggers(n)).toBe(true)
  })

  it("returns false when currentPrice falls back to average only", () => {
    const n = normalizeQuotePrices({
      quote: null,
      stockLtp: null,
      averagePrice: 50,
    })
    expect(n.source.currentPrice).toBe("average_price_fallback")
    expect(isQuoteSourceSuitableForStopTriggers(n)).toBe(false)
  })
})
