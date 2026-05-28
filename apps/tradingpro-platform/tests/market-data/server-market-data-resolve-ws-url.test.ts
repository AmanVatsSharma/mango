/**
 * File:        tests/market-data/server-market-data-resolve-ws-url.test.ts
 * Module:      Tests · Market Data · resolveWsUrl
 * Purpose:     Lock the post-2026-05 behaviour of `resolveWsUrl` after the auto-append-of-
 *              `/market-data` regression was removed. Pre-fix, a bare host env var
 *              `https://marketdata.vedpragya.com` was rewritten to
 *              `https://marketdata.vedpragya.com/market-data`. Socket.IO interprets that
 *              trailing segment as a NAMESPACE (not a path), so the backend silently
 *              connected to namespace `/market-data` and any gateway serving on `/` accepted
 *              the connection but never emitted ticks (`isConnected: true`,
 *              `lastMessageAt: null`, `cachedQuotes: 0`).
 *
 *              These tests guarantee the env var is the single source of truth.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/market-data/server-market-data.service — exposes `resolveWsUrl` for test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Bare hosts pass through unchanged — no `/market-data` is appended.
 *   - URLs with explicit paths pass through unchanged.
 *   - `ws://` and `wss://` are normalised to `http://` and `https://` respectively (Socket.IO
 *     clients require http(s) schemes — the underlying transport upgrades to WS internally).
 *   - Invalid URLs throw a descriptive error.
 *
 * Read order:
 *   1. The "no auto-append" describe — the load-bearing post-fix invariant.
 *   2. The "scheme normalization" describe — proves we still rewrite ws/wss.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import { resolveWsUrl } from "@/lib/market-data/server-market-data.service"

describe("resolveWsUrl — no auto-append of /market-data", () => {
  it("preserves a bare host as-is (the post-fix contract)", () => {
    expect(resolveWsUrl("https://marketdata.vedpragya.com")).toBe("https://marketdata.vedpragya.com")
  })

  it("preserves a host with trailing slash as-is", () => {
    expect(resolveWsUrl("https://marketdata.vedpragya.com/")).toBe("https://marketdata.vedpragya.com/")
  })

  it("preserves an explicit /market-data namespace if the operator opts in", () => {
    expect(resolveWsUrl("https://marketdata.vedpragya.com/market-data")).toBe(
      "https://marketdata.vedpragya.com/market-data",
    )
  })

  it("preserves an arbitrary custom namespace path the operator chose", () => {
    expect(resolveWsUrl("https://marketdata.example.com/feed/v2")).toBe(
      "https://marketdata.example.com/feed/v2",
    )
  })

  it("preserves a host with a port", () => {
    expect(resolveWsUrl("https://marketdata.vedpragya.com:3000")).toBe(
      "https://marketdata.vedpragya.com:3000",
    )
  })
})

describe("resolveWsUrl — scheme normalization (Socket.IO needs http(s), not ws(s))", () => {
  it("rewrites ws:// to http://", () => {
    expect(resolveWsUrl("ws://marketdata.vedpragya.com")).toBe("http://marketdata.vedpragya.com")
  })

  it("rewrites wss:// to https://", () => {
    expect(resolveWsUrl("wss://marketdata.vedpragya.com")).toBe("https://marketdata.vedpragya.com")
  })

  it("rewrites wss:// + path correctly without auto-appending namespace", () => {
    expect(resolveWsUrl("wss://marketdata.vedpragya.com/feed")).toBe(
      "https://marketdata.vedpragya.com/feed",
    )
  })

  it("trims surrounding whitespace before resolving", () => {
    expect(resolveWsUrl("   https://marketdata.vedpragya.com  ")).toBe(
      "https://marketdata.vedpragya.com",
    )
  })
})

describe("resolveWsUrl — invalid input", () => {
  it("throws a descriptive error for an unparseable URL", () => {
    expect(() => resolveWsUrl("not-a-url")).toThrow(/Invalid LIVE_MARKET_WS_URL/)
  })

  it("throws for an empty string after trimming", () => {
    expect(() => resolveWsUrl("   ")).toThrow(/Invalid LIVE_MARKET_WS_URL/)
  })
})
