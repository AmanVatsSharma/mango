/**
 * File:        tests/market-data/server-market-data-subscribe-payload.test.ts
 * Module:      Tests · Market Data · Server Subscribe Payload
 * Purpose:     Lock the `symbols[]` vs `instruments[]` split that the server-side
 *              market-data client uses when emitting upstream `subscribe` /
 *              `unsubscribe` events. Mirrors the frontend SocketIOClient behaviour
 *              so canonical symbols (strings containing `:`) reach the upstream in
 *              `symbols[]` and numeric / exchange-qualified keys reach it via
 *              `instruments[]`. Pre-2026-05 the backend always emitted everything
 *              as `instruments[]`, which left the server silently un-subscribed for
 *              every watchlist row keyed by canonical symbol — and surfaced at
 *              order placement as a misleading "stale quote" rejection.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/market-data/server-market-data.service — exposes the helper for test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - When a single key is canonical, only `symbols` is set on the payload.
 *   - When a single key is numeric or exchange-qualified, only `instruments` is set.
 *   - Mixed input produces both arrays; ordering inside each array preserves input
 *     order (so tests can assert deterministic shape).
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import { buildUpstreamSubscribePayload } from "@/lib/market-data/server-market-data.service"

describe("buildUpstreamSubscribePayload — symbols[] vs instruments[] split", () => {
  it("routes canonical NSE equity symbol to symbols[]", () => {
    const out = buildUpstreamSubscribePayload(["NSE:RELIANCE"])
    expect(out).toEqual({ symbols: ["NSE:RELIANCE"] })
    expect(out.instruments).toBeUndefined()
  })

  it("routes canonical BSE F&O option symbol to symbols[]", () => {
    const out = buildUpstreamSubscribePayload(["BSE_FO:SENSEX25MAY80000CE"])
    expect(out).toEqual({ symbols: ["BSE_FO:SENSEX25MAY80000CE"] })
  })

  it("routes canonical NCO commodity symbol to symbols[]", () => {
    const out = buildUpstreamSubscribePayload(["NCO:CASTOR25JUNFUT"])
    expect(out).toEqual({ symbols: ["NCO:CASTOR25JUNFUT"] })
  })

  it("routes numeric tokens to instruments[]", () => {
    const out = buildUpstreamSubscribePayload([738561, 2953217])
    expect(out).toEqual({ instruments: [738561, 2953217] })
    expect(out.symbols).toBeUndefined()
  })

  it("routes exchange-qualified string keys to instruments[]", () => {
    const out = buildUpstreamSubscribePayload(["NSE_EQ-738561", "MCX_FO-2953217"])
    expect(out).toEqual({ instruments: ["NSE_EQ-738561", "MCX_FO-2953217"] })
  })

  it("splits mixed input into both arrays preserving order", () => {
    const out = buildUpstreamSubscribePayload([
      "NSE:RELIANCE",          // canonical
      738561,                  // numeric token
      "BSE_FO:SENSEX25MAY80000CE", // canonical
      "NSE_EQ-2885",           // exchange-qualified
      "BINANCE:BTCUSDT",       // canonical (crypto)
    ])
    expect(out.symbols).toEqual(["NSE:RELIANCE", "BSE_FO:SENSEX25MAY80000CE", "BINANCE:BTCUSDT"])
    expect(out.instruments).toEqual([738561, "NSE_EQ-2885"])
  })

  it("returns an empty object for an empty input list", () => {
    expect(buildUpstreamSubscribePayload([])).toEqual({})
  })

  it("does not set an empty array key — matches the frontend's sparse-payload contract", () => {
    // Symbol-only input must NOT carry an `instruments: []` field, and vice-versa.
    const symbolsOnly = buildUpstreamSubscribePayload(["NSE:TCS"])
    expect("instruments" in symbolsOnly).toBe(false)
    const tokensOnly = buildUpstreamSubscribePayload([738561])
    expect("symbols" in tokensOnly).toBe(false)
  })
})
