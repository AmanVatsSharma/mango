/**
 * @file tests/trading/trading-dashboard-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for TradingDashboard strict numeric helper utilities.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  computeTradingPositionsPnlSummary,
  computeTradingDashboardPnL,
  resolveIndexDisplayState,
  resolveIndexQuote,
  resolveIndexTokenCandidate,
  resolveTradingPositionPnl,
} from "@/components/trading/trading-dashboard-number-utils"
import { isQuoteFresh } from "@/lib/market-data/utils/quote-lookup"

describe("trading-dashboard-number-utils", () => {
  it("parses index token candidates strictly", () => {
    expect(resolveIndexTokenCandidate("NSE_EQ-26000")).toBe(26000)
    expect(resolveIndexTokenCandidate("NSE_EQ-1e3")).toBeNull()
    expect(resolveIndexTokenCandidate("NSE_EQ-0")).toBeNull()
  })

  it("resolves index quote token-first with instrument fallback", () => {
    const quotes = {
      "26000": { display_price: 250.5, prev_close_price: 248.1 },
      "NSE_EQ-26000": { last_trade_price: 249.8, prev_close_price: 248.1 },
    }

    expect(resolveIndexQuote(quotes, { token: 26000, instrumentId: "NSE_EQ-26000" })).toEqual(
      quotes["26000"],
    )
    expect(resolveIndexQuote(quotes, { instrumentId: "NSE_EQ-26000" })).toEqual(quotes["26000"])
    expect(resolveIndexQuote(quotes, { instrumentId: "NSE_EQ-99999" })).toBeNull()
  })

  it("computes dashboard pnl from live quotes with strict numeric parsing", () => {
    const fallback = { totalPnL: 10, dayPnL: 5 }
    const pnl = computeTradingDashboardPnL({
      fallback,
      quotes: {
        "26000": {
          display_price: "255.5",
          prev_close_price: "248",
          lastUpdateTime: Date.now() - 500,
        },
      },
      positions: [
        {
          stock: { instrumentId: "NSE_EQ-26000" },
          averagePrice: "250",
          quantity: "2",
        },
      ],
      pnlMeta: { liveQuoteMaxAgeMs: 5_000 },
    })

    expect(pnl).toEqual({
      totalPnL: (255.5 - 250) * 2,
      dayPnL: (255.5 - 248) * 2,
    })
  })

  it("prefers server snapshot MTM when positionsTabMtmDisplayMode is server_snapshot_preferred and snapshot fresh", () => {
    const nowMs = Date.now()
    const resolved = resolveTradingPositionPnl({
      position: {
        id: "pos-1",
        quantity: 10,
        averagePrice: 100,
        unrealizedPnL: 99,
        dayPnL: 88,
        pnlUpdatedAtMs: nowMs - 2_000,
        stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
      },
      quotes: {
        "26000": {
          display_price: 101,
          prev_close_price: 99,
          lastUpdateTime: nowMs - 1_000,
        },
      },
      pnlMeta: {
        positionsTabMtmDisplayMode: "server_snapshot_preferred",
        pnlMode: "server",
        workerHealthy: true,
        pnlMaxAgeMs: 15_000,
      },
      nowMs,
    })

    expect(resolved.source).toBe("server")
    expect(resolved.unrealizedPnl).toBe(99)
    expect(resolved.dayPnl).toBe(88)
  })

  it("falls back to live quote MTM when server_snapshot_preferred but snapshot stale", () => {
    const nowMs = Date.now()
    const resolved = resolveTradingPositionPnl({
      position: {
        id: "pos-1",
        quantity: 10,
        averagePrice: 100,
        unrealizedPnL: 40,
        dayPnL: 25,
        pnlUpdatedAtMs: nowMs - 60_000,
        stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
      },
      quotes: {
        "26000": {
          display_price: 101,
          prev_close_price: 99,
          lastUpdateTime: nowMs - 1_000,
        },
      },
      pnlMeta: {
        positionsTabMtmDisplayMode: "server_snapshot_preferred",
        pnlMode: "server",
        workerHealthy: true,
        pnlMaxAgeMs: 15_000,
      },
      nowMs,
    })

    expect(resolved.source).toBe("live")
    expect(resolved.unrealizedPnl).toBe(10)
  })

  it("prefers live quote MTM even when server snapshot is fresh", () => {
    const nowMs = Date.now()
    const resolved = resolveTradingPositionPnl({
      position: {
        id: "pos-1",
        quantity: 10,
        averagePrice: 100,
        unrealizedPnL: 40,
        dayPnL: 25,
        pnlUpdatedAtMs: nowMs - 2_000,
        stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
      },
      quotes: {
        "26000": {
          display_price: 101,
          prev_close_price: 99,
          lastUpdateTime: nowMs - 1_000,
        },
      },
      pnlMeta: { pnlMode: "server", workerHealthy: true, pnlMaxAgeMs: 15_000 },
      nowMs,
    })

    expect(resolved.source).toBe("live")
    expect(resolved.unrealizedPnl).toBe(10)
    expect(resolved.dayPnl).toBe(20)
  })

  it("falls back to live values when server snapshot is stale", () => {
    const nowMs = Date.now()
    const resolved = resolveTradingPositionPnl({
      position: {
        id: "pos-1",
        quantity: 10,
        averagePrice: 100,
        unrealizedPnL: 40,
        dayPnL: 25,
        pnlUpdatedAtMs: nowMs - 60_000,
        stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
      },
      quotes: {
        "26000": {
          display_price: 101,
          prev_close_price: 99,
          lastUpdateTime: nowMs - 1_000,
        },
      },
      pnlMeta: { pnlMode: "server", workerHealthy: true, pnlMaxAgeMs: 15_000 },
      nowMs,
    })

    expect(resolved.source).toBe("live")
    expect(resolved.unrealizedPnl).toBe(10)
    expect(resolved.dayPnl).toBe(20)
  })

  it("falls back to server snapshot when no live quote exists", () => {
    const nowMs = Date.now()
    const resolved = resolveTradingPositionPnl({
      position: {
        id: "pos-1",
        quantity: 10,
        averagePrice: 100,
        unrealizedPnL: 40,
        dayPnL: 25,
        pnlUpdatedAtMs: nowMs - 2_000,
        stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
      },
      quotes: {},
      pnlMeta: { pnlMode: "server", workerHealthy: true, pnlMaxAgeMs: 15_000 },
      nowMs,
    })

    expect(resolved.source).toBe("server")
    expect(resolved.unrealizedPnl).toBe(40)
    expect(resolved.dayPnl).toBe(25)
  })

  it("keeps aggregate totals aligned with resolved row values", () => {
    const nowMs = Date.now()
    const summary = computeTradingPositionsPnlSummary({
      positions: [
        {
          id: "open-1",
          quantity: 10,
          averagePrice: 100,
          unrealizedPnL: 0,
          dayPnL: 0,
          pnlUpdatedAtMs: nowMs - 60_000,
          stock: { instrumentId: "NSE_EQ-26000", token: 26000 },
        },
        {
          id: "closed-1",
          quantity: 0,
          isClosed: true,
          averagePrice: 150,
          bookedPnL: 30,
          realizedPnL: 30,
          unrealizedPnL: 30,
          dayPnL: 30,
        },
      ],
      quotes: {
        "26000": { display_price: 101, prev_close_price: 99 },
      },
      pnlMeta: { pnlMode: "server", workerHealthy: true, pnlMaxAgeMs: 15_000 },
      nowMs,
    })

    const openResolved = summary.resolvedByPositionId.get("open-1")
    const closedResolved = summary.resolvedByPositionId.get("closed-1")
    expect(openResolved).toBeDefined()
    expect(closedResolved).toBeDefined()
    expect(summary.totalPnL).toBe((openResolved?.totalPnl ?? 0) + (closedResolved?.totalPnl ?? 0))
    expect(summary.dayPnL).toBe((openResolved?.dayPnl ?? 0) + (closedResolved?.dayPnl ?? 0))
    expect(summary.openMtm).toBe(openResolved?.unrealizedPnl ?? 0)
    expect(summary.bookedToday).toBe(closedResolved?.bookedPnl ?? 0)
  })

  it("falls back to API pnl when no usable live quote exists", () => {
    const fallback = { totalPnL: 12, dayPnL: 6 }
    expect(
      computeTradingDashboardPnL({
        fallback,
        quotes: {
          "26000": { display_price: "Infinity" },
        },
        positions: [{ stock: { instrumentId: "NSE_EQ-26000" }, averagePrice: 250, quantity: 2 }],
      }),
    ).toEqual({ totalPnL: 0, dayPnL: 0 })
  })

  it("resolves index display state with finite defaults", () => {
    expect(resolveIndexDisplayState({ quote: { display_price: "255.5", prev_close_price: "250" } })).toEqual({
      price: 255.5,
      prevClose: 250,
      change: ((255.5 - 250) / 250) * 100,
    })
    expect(resolveIndexDisplayState({ quote: { display_price: "Infinity", prev_close_price: "Infinity" } })).toEqual({
      price: 0,
      prevClose: 0,
      change: 0,
    })
  })

  describe("index display freshness (header sync)", () => {
    const INDEX_QUOTE_MAX_AGE_MS = 5_000

    it("treats quote as stale when older than threshold so dashboard shows offline/stale state", () => {
      const nowMs = Date.now()
      const oldQuote = { display_price: 255, lastUpdateTime: nowMs - 10_000 }
      expect(isQuoteFresh(oldQuote, { maxAgeMs: INDEX_QUOTE_MAX_AGE_MS, nowMs })).toBe(false)
    })

    it("treats quote as fresh when within threshold", () => {
      const nowMs = Date.now()
      const recentQuote = { display_price: 255, lastUpdateTime: nowMs - 2_000 }
      expect(isQuoteFresh(recentQuote, { maxAgeMs: INDEX_QUOTE_MAX_AGE_MS, nowMs })).toBe(true)
    })
  })
})
