/**
 * @file tests/trading/home-dashboard-config-utils.test.ts
 * @module tests-trading
 * @description Unit tests for Home dashboard config schema normalization + merge helpers.
 * @author StockTrade
 * @created 2026-02-17
 */

import {
  DEFAULT_HOME_DASHBOARD_CONFIG,
  mergeHomeDashboardConfig,
  normalizeHomeDashboardConfig,
  normalizeHomeDashboardConfigOverride,
  parseHomeDashboardConfigString,
  parseHomeDashboardOverrideString,
} from "@/lib/home-dashboard/home-dashboard-config-schema"

describe("home-dashboard-config-schema", () => {
  it("normalizes config symbols/toggles with strict defaults", () => {
    const normalized = normalizeHomeDashboardConfig({
      tickerTapeSymbols: [" nse:nifty ", "bad symbol", "26000"],
      chartSymbol: "nse:banknifty",
      enabledWidgets: {
        tickerTape: "false",
        chart: true,
        heatmap: "1",
      },
      defaultSectors: ["it", " banking "],
    })

    expect(normalized).toEqual({
      tickerTapeSymbols: ["NSE:NIFTY", "BADSYMBOL", "26000"],
      chartSymbol: "NSE:BANKNIFTY",
      enabledWidgets: {
        tickerTape: false,
        chart: true,
        heatmap: true,
        screener: true,
        topMovers: true,
        marketStats: true,
      },
      defaultSectors: ["IT", "BANKING"],
    })
  })

  it("returns defaults when config values are malformed", () => {
    const normalized = normalizeHomeDashboardConfig({
      tickerTapeSymbols: [Symbol("bad")],
      chartSymbol: {},
      enabledWidgets: [],
      defaultSectors: null,
    })

    expect(normalized).toEqual(DEFAULT_HOME_DASHBOARD_CONFIG)
  })

  it("normalizes overrides and merges over global config safely", () => {
    const override = normalizeHomeDashboardConfigOverride({
      tickerTapeSymbols: ["NSE:RELIANCE", "nse:tcs"],
      enabledWidgets: {
        screener: "false",
        topMovers: "0",
      },
    })

    const merged = mergeHomeDashboardConfig(DEFAULT_HOME_DASHBOARD_CONFIG, override)
    expect(merged.tickerTapeSymbols).toEqual(["NSE:RELIANCE", "NSE:TCS"])
    expect(merged.enabledWidgets.screener).toBe(false)
    expect(merged.enabledWidgets.topMovers).toBe(false)
    expect(merged.enabledWidgets.chart).toBe(true)
  })

  it("falls back to defaults for invalid JSON strings", () => {
    expect(parseHomeDashboardConfigString("{invalid-json}")).toEqual(DEFAULT_HOME_DASHBOARD_CONFIG)
    expect(parseHomeDashboardOverrideString("{invalid-json}")).toBeNull()
  })
})
