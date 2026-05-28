/**
 * File:        tests/trading/position-pnl-ltp-consistency.test.ts
 * Module:      Tests · Trading · Position PnL LTP Consistency
 * Purpose:     Lock the post-2026-05 invariant that the PnL number shown on a position row is
 *              ALWAYS computed from the same price the row's LTP is showing — i.e.
 *              `(LTP_shown - avgPrice) × quantity === PnL_shown` to within ₹0.01. Pre-fix the
 *              UI displayed `displayQuote.uiPrice` (loose ~30s window) as the LTP while PnL
 *              came from `livePrice` (strict ~5s window); when the live freshness window
 *              expired the PnL silently fell back to the worker snapshot, but the LTP kept
 *              rendering the displayable value, producing the user-reported "numbers don't
 *              add up" mismatch.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/components/trading/trading-dashboard-number-utils — `resolveTradingPositionPnl`
 *
 * Side-effects: none (pure function tests).
 *
 * Key invariants:
 *   - When a displayable LTP is shown, PnL ≈ (LTP - avg) × qty (mental-check parity).
 *   - When NO displayable LTP exists, PnL falls back to the server snapshot — both the LTP
 *     and the PnL are then explicitly "snapshot-based" together (via the feed-stale badge),
 *     never one-fresh-one-stale.
 *
 * Read order:
 *   1. The "fresh quote" describe — the trivial happy path
 *   2. The "stale-but-displayable" describe — the bug-fix surface
 *   3. The "no quote" describe — the only acceptable divergence (server fallback for both)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import {
  computeTradingPositionsPnlSummary,
  resolveTradingPositionPnl,
} from "@/components/trading/trading-dashboard-number-utils"

const NOW = 1_780_000_000_000

const buildPosition = (overrides: Record<string, unknown> = {}) => ({
  id: "pos-1",
  symbol: "RELIANCE",
  quantity: 100,
  averagePrice: 2_500,
  unrealizedPnL: 0,
  dayPnL: 0,
  bookedPnL: 0,
  isClosed: false,
  isIntraday: true,
  productType: "MIS",
  segment: "NSE",
  token: 738561,
  stock: { token: 738561, instrumentId: "NSE-738561" },
  ...overrides,
})

const buildQuote = (
  ltp: number,
  ageMs: number,
  prevClose = 2_490,
): { quote: any } => ({
  quote: {
    last_trade_price: ltp,
    actual_price: ltp,
    display_price: ltp,
    prev_close_price: prevClose,
    close: prevClose,
    timestamp: NOW - ageMs,
    receivedAt: NOW - ageMs,
  },
})

describe("resolveTradingPositionPnl — fresh quote (happy path)", () => {
  it("PnL = (LTP - avg) × qty when the quote is well within the freshness window", () => {
    const position = buildPosition()
    const ltp = 2_550
    const quotes = { 738561: buildQuote(ltp, 1_000).quote }
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: quotes as any,
      pnlMeta: { workerHealthy: true, pnlMaxAgeMs: 30_000 } as any,
      nowMs: NOW,
    })
    const expectedPnl = (ltp - position.averagePrice) * position.quantity
    expect(resolved.totalPnl).toBeCloseTo(expectedPnl, 2)
    expect(resolved.displayPrice).toBeCloseTo(ltp, 2)
    expect((resolved.displayPrice ?? 0) - position.averagePrice).toBeCloseTo(
      resolved.totalPnl / position.quantity,
      2,
    )
  })

  it("matches the user's mental check for SHORT positions too", () => {
    const position = buildPosition({ quantity: -50, averagePrice: 2_500 })
    const ltp = 2_450
    const quotes = { 738561: buildQuote(ltp, 500).quote }
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: quotes as any,
      pnlMeta: { workerHealthy: true, pnlMaxAgeMs: 30_000 } as any,
      nowMs: NOW,
    })
    // SHORT at 2500, price down to 2450 → +profit
    const expectedPnl = (ltp - 2_500) * -50 // = (-50) * (-50) = +2500
    expect(resolved.totalPnl).toBeCloseTo(expectedPnl, 2)
    expect(resolved.totalPnl).toBeGreaterThan(0)
  })
})

describe("resolveTradingPositionPnl — stale-but-displayable quote (the bug-fix surface)", () => {
  it("LTP and PnL stay aligned when the quote is past strict freshness but still displayable", () => {
    const position = buildPosition()
    const ltp = 2_555
    // 10s old → past the strict 5s live window but within the looser 30s display window
    const quotes = { 738561: buildQuote(ltp, 10_000).quote }
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: quotes as any,
      pnlMeta: {
        workerHealthy: true,
        pnlMaxAgeMs: 30_000,
        liveQuoteMaxAgeMs: 5_000,
        displayQuoteMaxAgeMs: 30_000,
      } as any,
      nowMs: NOW,
    })

    // Pre-fix: liveUnrealized would be null → PnL would jump to serverUnrealized = 0,
    //          but the row would render LTP = 2555 → user sees `(2555-2500)×100=5500` mentally
    //          but the row says PnL = 0. THAT'S the bug.
    // Post-fix: the displayable LTP drives the PnL, so the math reconciles.
    expect(resolved.displayPrice).toBeCloseTo(ltp, 2)
    expect(resolved.totalPnl).toBeCloseTo((ltp - position.averagePrice) * position.quantity, 2)
    const reconstructed = ((resolved.displayPrice ?? 0) - position.averagePrice) * position.quantity
    expect(Math.abs(resolved.totalPnl - reconstructed)).toBeLessThan(0.01)
  })

  it("displayPrice and PnL never disagree when the server snapshot is also stale", () => {
    const position = buildPosition({ unrealizedPnL: 9_999 /* misleading server value */ })
    const ltp = 2_530
    const quotes = { 738561: buildQuote(ltp, 8_000).quote } // past strict live, within display
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: quotes as any,
      pnlMeta: {
        workerHealthy: false /* server snapshot stale */,
        pnlMaxAgeMs: 30_000,
      } as any,
      nowMs: NOW,
    })
    // Bug-shape: would have shown LTP=2530 but PnL=9999 from the misleading server row.
    // Fixed: PnL is computed from the same 2530 the user sees.
    expect(resolved.totalPnl).toBeCloseTo((ltp - 2_500) * 100, 2)
    expect(resolved.totalPnl).not.toBeCloseTo(9_999, 0)
  })
})

describe("resolveTradingPositionPnl — no quote at all (acceptable divergence)", () => {
  it("falls back to server snapshot for BOTH the price and the PnL — no fresh-stale split", () => {
    const position = buildPosition({
      unrealizedPnL: 1_234,
      currentPrice: 2_512,
    })
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: {} as any,
      pnlMeta: { workerHealthy: true, pnlMaxAgeMs: 30_000 } as any,
      nowMs: NOW,
    })
    // No live + no displayable quote → both displayPrice null and PnL from server snapshot.
    // The row will render "—" for LTP and the server PnL — explicit "no live data" state,
    // not a misleading mismatch.
    expect(resolved.displayPrice).toBeNull()
    expect(resolved.totalPnl).toBe(1_234)
  })
})

describe("computeTradingPositionsPnlSummary — aggregate stays self-consistent", () => {
  it("sum of resolved row PnLs equals the summary's totalPnL when all rows have displayable quotes", () => {
    const positions = [
      buildPosition({ id: "p1", quantity: 100, averagePrice: 2_500 }),
      buildPosition({
        id: "p2",
        quantity: -50,
        averagePrice: 2_510,
        token: 738562,
        stock: { token: 738562, instrumentId: "NSE-738562" },
      }),
    ]
    const quotes = {
      738561: buildQuote(2_555, 8_000).quote,
      738562: buildQuote(2_500, 12_000).quote,
    }
    const summary = computeTradingPositionsPnlSummary({
      positions,
      quotes: quotes as any,
      pnlMeta: { workerHealthy: true, pnlMaxAgeMs: 30_000 } as any,
      nowMs: NOW,
    })
    const rowSum = positions.reduce((acc, pos) => {
      const row = summary.resolvedByPositionId.get(pos.id)
      return acc + (row?.totalPnl ?? 0)
    }, 0)
    expect(summary.totalPnL).toBeCloseTo(rowSum, 2)
  })
})
