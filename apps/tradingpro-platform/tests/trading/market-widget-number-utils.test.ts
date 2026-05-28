/**
 * @file tests/trading/market-widget-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for strict market widget numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  buildTickerWidgetRows,
  normalizeScreenerChangePercentForBadge,
  normalizeScreenerWidgetRows,
  resolveMarketWidgetLivePrice,
  resolveMarketWidgetLivePriceForInstrument,
} from "@/components/trading/widgets/market-widget-number-utils"

describe("market-widget-number-utils", () => {
  it("builds ticker rows with strict token and quote normalization", () => {
    const rows = buildTickerWidgetRows(
      [
        { label: "NIFTY", token: "26000" },
        { label: "INVALID", token: "1e3" },
        { label: "MISSING", token: "27000" },
      ],
      {
        "26000": { display_price: "250.5", prev_close_price: "245.0" },
      },
    )

    expect(rows).toEqual([
      {
        label: "NIFTY",
        token: 26000,
        ltp: 250.5,
        changePct: ((250.5 - 245) / 245) * 100,
      },
    ])
  })

  it("normalizes screener rows with strict finite parsing", () => {
    const rows = normalizeScreenerWidgetRows([
      {
        id: "s-1",
        symbol: "  RELIANCE ",
        name: " Reliance Industries ",
        ltp: "2750.5",
        changePercent: "1.25",
        segment: " nse_eq ",
        exchange: " nse ",
      },
      {
        id: "s-2",
        ticker: "TCS",
        ltp: "Infinity",
        changePercent: "NaN",
      },
    ])

    expect(rows).toEqual([
      {
        id: "s-1",
        symbol: "RELIANCE",
        name: "Reliance Industries",
        ltp: 2750.5,
        catalogLtp: 2750.5,
        changePercent: 1.25,
        segment: "NSE_EQ",
        exchange: "NSE",
        token: null,
      },
      {
        id: "s-2",
        symbol: "TCS",
        name: "Unknown",
        ltp: undefined,
        catalogLtp: undefined,
        changePercent: undefined,
        segment: undefined,
        exchange: undefined,
        token: null,
      },
    ])
  })

  it("extracts token from search-result rows for live overlay (Trading-d9s)", () => {
    const rows = normalizeScreenerWidgetRows([
      { id: "s-3", symbol: "INFY", name: "Infosys", ltp: 1500, token: 408065 },
      { id: "s-4", symbol: "HDFC", name: "HDFC Bank", ltp: 1700, instrumentToken: 341249 },
      { id: "s-5", symbol: "TCS", name: "TCS", ltp: 4100, instrument_token: 2953217 },
      // Negative / zero / non-numeric → null (no false-positive subscribe)
      { id: "s-6", symbol: "BAD", name: "Bad", ltp: 1, token: -1 },
      { id: "s-7", symbol: "BAD2", name: "Bad2", ltp: 1, token: "abc" },
    ])
    expect(rows.map((r) => r.token)).toEqual([408065, 341249, 2953217, null, null])
    // catalogLtp mirrors the catalog ltp, used as the fallback when no live tick yet
    expect(rows.map((r) => r.catalogLtp)).toEqual([1500, 1700, 4100, 1, 1])
  })

  it("normalizes screener change-percent badge values safely", () => {
    expect(normalizeScreenerChangePercentForBadge("2.5")).toBe(2.5)
    expect(normalizeScreenerChangePercentForBadge("Infinity")).toBe(0)
    expect(normalizeScreenerChangePercentForBadge(Symbol("bad"))).toBe(0)
  })

  it("resolves market widget live price strictly from quote maps", () => {
    expect(
      resolveMarketWidgetLivePrice(
        {
          "26000": { display_price: "250.25" },
        },
        "26000",
      ),
    ).toBe(250.25)
    expect(resolveMarketWidgetLivePrice({ "26000": { display_price: "Infinity" } }, "26000")).toBeNull()
    expect(resolveMarketWidgetLivePrice({}, "1e3")).toBeNull()
  })

  it("resolves live price by token and/or instrumentId like watchlist rows", () => {
    expect(
      resolveMarketWidgetLivePriceForInstrument(
        { "26000": { display_price: "100.5" } },
        { token: 26000, instrumentId: null },
      ),
    ).toBe(100.5)
    expect(
      resolveMarketWidgetLivePriceForInstrument(
        { "NSE_EQ-26000": { display_price: "101" } },
        { token: undefined, instrumentId: "NSE_EQ-26000" },
      ),
    ).toBe(101)
    expect(resolveMarketWidgetLivePriceForInstrument({}, { token: 26000, instrumentId: "NSE_EQ-26000" })).toBeNull()
  })
})
