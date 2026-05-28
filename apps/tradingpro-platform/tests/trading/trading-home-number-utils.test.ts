/**
 * @file tests/trading/trading-home-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for TradingHome strict numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  buildTradingHomePortfolioSummary,
  buildTradingHomeWatchlistHeatmapItems,
} from "@/components/trading/trading-home-number-utils"

describe("trading-home-number-utils", () => {
  it("builds portfolio summary with finite fallbacks", () => {
    expect(
      buildTradingHomePortfolioSummary({
        portfolio: { account: { balance: "120000.5" } },
        pnl: { totalPnL: "2500.25", dayPnL: "120.5" },
      }),
    ).toEqual({
      totalPnL: 2500.25,
      dayPnL: 120.5,
      invested: 120000.5,
      currentValue: 122500.75,
      returnsNumber: (2500.25 / 120000.5) * 100,
    })
  })

  it("falls back safely for malformed portfolio and pnl values", () => {
    expect(
      buildTradingHomePortfolioSummary({
        portfolio: { account: { balance: "Infinity", totalValue: "50000" } },
        pnl: { totalPnL: "NaN", dayPnL: Symbol("bad") },
      }),
    ).toEqual({
      totalPnL: 0,
      dayPnL: 0,
      invested: 50000,
      currentValue: 50000,
      returnsNumber: 0,
    })
  })

  it("builds unique token heatmap items with strict token parsing", () => {
    const items = buildTradingHomeWatchlistHeatmapItems([
      { items: [{ token: "26000", symbol: "NIFTY" }, { token: "26000", symbol: "NIFTY DUP" }] },
      { items: [{ token: "1e3", symbol: "BAD" }, { token: "35000", name: "BANKNIFTY" }] },
    ])

    expect(items).toEqual([
      { label: "NIFTY", token: 26000 },
      { label: "BANKNIFTY", token: 35000 },
    ])
  })
})
