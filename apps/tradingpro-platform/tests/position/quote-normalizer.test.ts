/**
 * @file quote-normalizer.test.ts
 * @module tests/position
 * @description Unit tests for quote normalization used by server-side PnL worker.
 * @author StockTrade
 * @created 2026-02-04
 */

import { normalizeQuotePrices } from "@/lib/services/position/quote-normalizer"

describe("normalizeQuotePrices", () => {
  it("prefers quote last_trade_price and prev_close_price", () => {
    const r = normalizeQuotePrices({
      quote: { last_trade_price: 110, prev_close_price: 100 },
      stockLtp: 105,
      averagePrice: 95,
    })

    expect(r.currentPrice).toBe(110)
    expect(r.prevClose).toBe(100)
    expect(r.source.currentPrice).toBe("quote")
    expect(r.source.prevClose).toBe("quote")
  })

  it("falls back to stock ltp and averagePrice", () => {
    const r = normalizeQuotePrices({
      quote: null,
      stockLtp: 101,
      averagePrice: 99,
    })

    expect(r.currentPrice).toBe(101)
    expect(r.prevClose).toBe(99)
  })

  it("handles weird shapes (LTP + ohlc.close)", () => {
    const r = normalizeQuotePrices({
      quote: { LTP: "123.5", ohlc: { close: "120" } },
      stockLtp: null,
      averagePrice: 110,
    })

    expect(r.currentPrice).toBe(123.5)
    expect(r.prevClose).toBe(120)
  })

  it("falls back safely when quote numeric fields are malformed", () => {
    const r = normalizeQuotePrices({
      quote: {
        last_trade_price: Symbol("bad-ltp"),
        prev_close_price: "NaN",
      } as any,
      stockLtp: 102,
      averagePrice: 99,
    })

    expect(r.currentPrice).toBe(102)
    expect(r.prevClose).toBe(99)
    expect(r.source.currentPrice).toBe("stock_ltp")
    expect(r.source.prevClose).toBe("average_price_fallback")
  })

  it("treats blank and sentinel quote numeric strings as invalid", () => {
    const r = normalizeQuotePrices({
      quote: {
        ltp: "   ",
        close: "undefined",
      },
      stockLtp: null,
      averagePrice: 101,
    })

    expect(r.currentPrice).toBe(101)
    expect(r.prevClose).toBe(101)
    expect(r.source.currentPrice).toBe("average_price_fallback")
    expect(r.source.prevClose).toBe("average_price_fallback")
  })
})

