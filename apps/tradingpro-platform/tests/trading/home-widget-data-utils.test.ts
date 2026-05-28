/**
 * @file tests/trading/home-widget-data-utils.test.ts
 * @module tests-trading
 * @description Unit tests for Home widget data utility helpers (symbol resolution + market stats).
 * @author StockTrade
 * @created 2026-02-17
 */

import { DEFAULT_HOME_DASHBOARD_CONFIG } from "@/lib/home-dashboard/home-dashboard-config-schema"
import {
  buildHomeChartSymbols,
  buildHomeMoversUniverse,
  buildHomeTickerItemsFromConfig,
  summarizeHomeMarketStats,
} from "@/components/trading/widgets/home-widget-data-utils"

describe("home-widget-data-utils", () => {
  const watchlists = [
    {
      items: [
        { token: 12345, symbol: "SBIN", name: "State Bank" },
        { token: 23456, symbol: "ITC", name: "ITC" },
      ],
    },
  ]

  it("resolves ticker items from static map and watchlist symbols", () => {
    const items = buildHomeTickerItemsFromConfig(["NSE:NIFTY", "NSE:SBIN"], watchlists)
    expect(items).toEqual([
      { label: "NIFTY", token: 26000 },
      { label: "SBIN", token: 12345 },
    ])
  })

  it("builds chart symbols with configured chart symbol priority", () => {
    const chart = buildHomeChartSymbols(
      {
        ...DEFAULT_HOME_DASHBOARD_CONFIG,
        tickerTapeSymbols: ["NSE:NIFTY", "NSE:SBIN"],
        chartSymbol: "NSE:SBIN",
      },
      watchlists,
      buildHomeTickerItemsFromConfig(["NSE:NIFTY", "NSE:SBIN"], watchlists),
    )

    expect(chart.symbols[0]).toEqual({ key: "token-12345", label: "SBIN", token: 12345 })
    expect(chart.defaultSymbolKey).toBe("token-12345")
  })

  it("builds movers universe from ticker items plus unique watchlist tokens", () => {
    const movers = buildHomeMoversUniverse([{ label: "NIFTY", token: 26000 }], watchlists)
    expect(movers).toEqual([
      { label: "NIFTY", token: 26000 },
      { label: "SBIN", token: 12345 },
      { label: "ITC", token: 23456 },
    ])
  })

  it("summarizes market stats for advances/declines/best/worst", () => {
    const summary = summarizeHomeMarketStats([
      { label: "A", token: 1, ltp: 100, changePct: 2 },
      { label: "B", token: 2, ltp: 100, changePct: -1.5 },
      { label: "C", token: 3, ltp: 100, changePct: 0 },
    ])

    expect(summary.advances).toBe(1)
    expect(summary.declines).toBe(1)
    expect(summary.unchanged).toBe(1)
    expect(summary.averageChangePct).toBeCloseTo(0.166666, 4)
    expect(summary.bestPerformer?.label).toBe("A")
    expect(summary.worstPerformer?.label).toBe("B")
  })
})
