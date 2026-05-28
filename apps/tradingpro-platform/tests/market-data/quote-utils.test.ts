/**
 * @file tests/market-data/quote-utils.test.ts
 * @module tests-market-data
 * @description Unit tests for market quote token/instrument normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteMarketNumber,
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
} from "@/lib/market-data/quote-utils"

describe("market quote utils", () => {
  it("parses finite market numbers and rejects sentinels", () => {
    expect(parseFiniteMarketNumber(" 123.5 ")).toBe(123.5)
    expect(parseFiniteMarketNumber("NaN")).toBeNull()
    expect(parseFiniteMarketNumber("Infinity")).toBeNull()
    expect(parseFiniteMarketNumber("")).toBeNull()
  })

  it("normalizes non-negative and positive-integer numeric constraints", () => {
    expect(parseNonNegativeMarketNumber("-1")).toBeNull()
    expect(parseNonNegativeMarketNumber("0")).toBe(0)
    expect(parsePositiveIntegerMarketNumber("10")).toBe(10)
    expect(parsePositiveIntegerMarketNumber("10.5")).toBeNull()
  })

  it("extracts strict token suffix from instrument ids", () => {
    expect(parseTokenFromInstrumentId("NSE_EQ-26000")).toBe(26000)
    expect(parseTokenFromInstrumentId("NSE_EQ--NaN--7600")).toBe(7600)
    expect(parseTokenFromInstrumentId("NSE_EQ-1e3")).toBeNull()
    expect(parseTokenFromInstrumentId("NSE_EQ-0")).toBeNull()
  })

  it("resolves quotes with token precedence and instrument fallback", () => {
    const quotes = {
      "26000": { last_trade_price: 120.5 },
      "NSE_EQ-26000": { last_trade_price: 118.2 },
      "NSE_EQ-30000": { display_price: 99.5 },
    }

    expect(
      resolveQuoteFromMap(quotes, { token: "26000", instrumentId: "NSE_EQ-26000" }),
    ).toEqual({ last_trade_price: 120.5 })
    expect(resolveQuoteFromMap(quotes, { instrumentId: "NSE_EQ-30000" })).toEqual({ display_price: 99.5 })
    expect(resolveQuoteFromMap(quotes, { instrumentId: "NSE_EQ-40000" })).toBeNull()
  })

  it("resolves display price from prioritized quote fields with fallback", () => {
    expect(resolveDisplayPriceFromQuote({ display_price: "125.5" }, 100)).toBe(125.5)
    expect(resolveDisplayPriceFromQuote({ last_trade_price: 122.25 }, 100)).toBe(122.25)
    expect(resolveDisplayPriceFromQuote({ actual_price: "121.75" }, 100)).toBe(121.75)
    expect(resolveDisplayPriceFromQuote({ display_price: "NaN" }, "120.5")).toBe(120.5)
    expect(resolveDisplayPriceFromQuote(null, "Infinity")).toBe(0)
  })
})
