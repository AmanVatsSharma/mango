/**
 * @file tests/market-data/quote-lookup.test.ts
 * @module tests-market-data
 * @description Unit tests for token-first quote resolution helper.
 * @author StockTrade
 * @created 2026-02-15
 */

import {
  isQuoteFresh,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveQuotePriceSnapshot,
  resolveSubscriptionToken,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
  resolveDisplayQuoteSnapshot,
} from "@/lib/market-data/utils/quote-lookup"

describe("resolveQuoteFromMap", () => {
  it("prefers direct token key when provided", () => {
    const quote = { last_trade_price: 250.5 }
    const quotes = {
      "26000": quote,
      "NSE_EQ-26000": { last_trade_price: 200.1 },
    }

    const result = resolveQuoteFromMap(quotes, { token: 26000, instrumentId: "NSE_EQ-26000" })
    expect(result).toBe(quote)
  })

  it("falls back to token parsed from instrument id", () => {
    const quote = { last_trade_price: 410.3 }
    const quotes = { "12345": quote }
    const result = resolveQuoteFromMap(quotes, { instrumentId: "NSE_EQ-12345" })
    expect(result).toBe(quote)
  })

  it("falls back to instrument id key when token keys missing", () => {
    const quote = { last_trade_price: 99.1 }
    const quotes = { "NSE_EQ-99999": quote }
    const result = resolveQuoteFromMap(quotes, { instrumentId: "NSE_EQ-99999" })
    expect(result).toBe(quote)
  })

  it("does not coerce partial instrument suffix tokens", () => {
    const tokenKeyQuote = { last_trade_price: 300.1 }
    const instrumentKeyQuote = { last_trade_price: 301.2 }
    const quotes = {
      "26000": tokenKeyQuote,
      "NSE_EQ-26000abc": instrumentKeyQuote,
    }

    const result = resolveQuoteFromMap(quotes, { instrumentId: "NSE_EQ-26000abc" })
    expect(result).toBe(instrumentKeyQuote)
  })

  it("returns undefined when map is missing or quote not found", () => {
    expect(resolveQuoteFromMap(undefined, { token: 10 })).toBeUndefined()
    expect(resolveQuoteFromMap({}, { instrumentId: "NSE_EQ-10" })).toBeUndefined()
  })

  it("parses strict positive integer tokens without scientific notation", () => {
    expect(parsePositiveIntegerMarketNumber("26000")).toBe(26000)
    expect(parsePositiveIntegerMarketNumber("1e3")).toBeNull()
    expect(parsePositiveIntegerMarketNumber("26000.5")).toBeNull()
  })

  it("extracts strict token suffix from instrument identifiers", () => {
    expect(parseTokenFromInstrumentId("NSE_EQ-26000")).toBe(26000)
    expect(parseTokenFromInstrumentId("NSE_EQ--NaN--7800")).toBe(7800)
    expect(parseTokenFromInstrumentId("NSE_EQ-1e3")).toBeNull()
  })

  it("resolves subscription token using instrumentId fallback when token is absent", () => {
    expect(resolveSubscriptionToken({ token: null, instrumentId: "NSE_EQ-26000" })).toBe(26000)
    expect(resolveSubscriptionToken({ token: "29000", instrumentId: "NSE_EQ-26000" })).toBe(29000)
    expect(resolveSubscriptionToken({ token: null, instrumentId: "NSE_EQ-1e3" })).toBeNull()
  })

  it("resolves display price from display/last-trade/actual quote fallback chain", () => {
    expect(resolveDisplayPriceFromQuote({ display_price: "125.5" }, 100)).toBe(125.5)
    expect(resolveDisplayPriceFromQuote({ last_trade_price: 122.3 }, 100)).toBe(122.3)
    expect(resolveDisplayPriceFromQuote({ actual_price: "121.1" }, 100)).toBe(121.1)
    expect(resolveDisplayPriceFromQuote({ display_price: "Infinity" }, "119.5")).toBe(119.5)
  })

  it("flags stale quotes by update timestamp and rejects missing timestamps", () => {
    const nowMs = 1_700_000_000_000
    expect(isQuoteFresh({ last_trade_price: 100, lastUpdateTime: nowMs - 2_000 }, { maxAgeMs: 15_000, nowMs })).toBe(true)
    expect(isQuoteFresh({ last_trade_price: 100, timestamp: nowMs - 30_000 }, { maxAgeMs: 15_000, nowMs })).toBe(false)
    expect(isQuoteFresh({ last_trade_price: 100 }, { maxAgeMs: 15_000, nowMs })).toBe(false)
  })

  it("isQuoteFresh with 5s threshold used by dashboard index display", () => {
    const nowMs = 1_700_000_000_000
    const maxAgeMs = 5_000
    expect(isQuoteFresh({ last_trade_price: 100, lastUpdateTime: nowMs - 2_000 }, { maxAgeMs, nowMs })).toBe(true)
    expect(isQuoteFresh({ last_trade_price: 100, lastUpdateTime: nowMs - 10_000 }, { maxAgeMs, nowMs })).toBe(false)
  })

  it("builds a canonical quote snapshot for UI and trade prices", () => {
    const nowMs = 1_700_000_000_000
    const snapshot = resolveQuotePriceSnapshot({
      quote: {
        display_price: "101.25",
        last_trade_price: "100.9",
        prev_close_price: "98.5",
        lastUpdateTime: nowMs - 1_000,
      },
      fallbackPrice: 95,
      fallbackClose: 94,
      maxAgeMs: 5_000,
      nowMs,
    })

    expect(snapshot).toMatchObject({
      uiPrice: 101.25,
      tradePrice: 100.9,
      referencePrice: 100.9,
      prevClose: 98.5,
      isFresh: true,
      isDisplayable: true,
      source: "LIVE",
    })
  })

  it("marks stale quote snapshots and falls back when quote is unavailable", () => {
    const nowMs = 1_700_000_000_000
    const staleSnapshot = resolveQuotePriceSnapshot({
      quote: {
        display_price: 201,
        last_trade_price: 200.5,
        prev_close_price: 198,
        lastUpdateTime: nowMs - 20_000,
      },
      fallbackPrice: 199,
      fallbackClose: 197,
      maxAgeMs: 5_000,
      nowMs,
    })
    expect(staleSnapshot.source).toBe("SNAPSHOT")
    expect(staleSnapshot.isFresh).toBe(false)
    expect(staleSnapshot.isDisplayable).toBe(true)
    expect(staleSnapshot.uiPrice).toBe(201)
    expect(staleSnapshot.tradePrice).toBe(200.5)

    const fallbackSnapshot = resolveQuotePriceSnapshot({
      quote: null,
      fallbackPrice: 88,
      fallbackClose: 87,
      nowMs,
    })
    expect(fallbackSnapshot).toMatchObject({
      source: "FALLBACK",
      isFresh: false,
      isDisplayable: false,
      uiPrice: 88,
      tradePrice: 88,
      prevClose: 87,
    })
  })
})

describe("resolveDisplayQuoteSnapshot", () => {
  const nowMs = 1_700_000_000_000
  const quote = {
    display_price: 150,
    last_trade_price: 149.5,
    prev_close_price: 140,
    lastUpdateTime: nowMs - 120_000,
  }

  it("strict hides prices when quote is older than display max age", () => {
    const snap = resolveDisplayQuoteSnapshot({
      quote,
      liveMaxAgeMs: 5_000,
      displayMaxAgeMs: 60_000,
      nowMs,
      staleQuotePriceMode: "strict",
    })
    expect(snap.isDisplayable).toBe(false)
    expect(snap.uiPrice).toBeNull()
    expect(snap.source).toBe("STALE")
  })

  it("last_tick keeps last prices when older than display max age", () => {
    const snap = resolveDisplayQuoteSnapshot({
      quote,
      liveMaxAgeMs: 5_000,
      displayMaxAgeMs: 60_000,
      nowMs,
      staleQuotePriceMode: "last_tick",
    })
    expect(snap.isDisplayable).toBe(true)
    expect(snap.uiPrice).toBe(150)
    expect(snap.tradePrice).toBe(149.5)
    expect(snap.source).toBe("STALE")
  })
})

