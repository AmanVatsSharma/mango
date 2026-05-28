/**
 * @file tests/trading/watchlist-card-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for watchlist card numeric price metric normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { resolveWatchlistCardPriceMetrics } from "@/components/watchlist/watchlist-card-number-utils"

describe("watchlist-card-number-utils", () => {
  it("resolves metrics from display price and previous close", () => {
    const metrics = resolveWatchlistCardPriceMetrics({
      item: { ltp: 250, close: 245 },
      quote: { display_price: "252.5", prev_close_price: "248.0" },
    })

    expect(metrics).toEqual({
      ltp: 252.5,
      prevClose: 248,
      change: 4.5,
      changePercent: (4.5 / 248) * 100,
      isPositive: true,
      chartSeedPrice: 248,
    })
  })

  it("falls back safely for malformed quote and close values", () => {
    const metrics = resolveWatchlistCardPriceMetrics({
      item: { ltp: "Infinity", close: "NaN" },
      quote: { last_trade_price: "Infinity", prev_close_price: "Infinity" },
    })

    expect(metrics).toEqual({
      ltp: 0,
      prevClose: 0,
      change: 0,
      changePercent: 0,
      isPositive: true,
      chartSeedPrice: 1,
    })
  })
})
