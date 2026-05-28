/**
 * @file market-quote-redis-parse.test.ts
 * @module tests-server
 * @description Tests for `parseRedisMarketQuoteSnapshot` including expectedInstrumentToken enforcement.
 * @author StockTrade
 * @created 2026-03-30
 */

import { parseRedisMarketQuoteSnapshot } from "@/lib/server/market-quote-redis"

describe("parseRedisMarketQuoteSnapshot", () => {
  const nowMs = 1_700_000_000_000
  const maxAgeMs = 60_000

  function freshPayload(token: number, ltp: number) {
    return JSON.stringify({
      instrumentToken: token,
      last_trade_price: ltp,
      receivedAtMs: nowMs - 1000,
    })
  }

  it("parses a valid payload when expectedInstrumentToken matches", () => {
    const snap = parseRedisMarketQuoteSnapshot(freshPayload(26000, 9205), maxAgeMs, nowMs, {
      expectedInstrumentToken: 26000,
    })
    expect(snap).not.toBeNull()
    expect(snap!.last_trade_price).toBe(9205)
    expect(snap!.instrumentToken).toBe(26000)
  })

  it("returns null when embedded instrumentToken does not match expectedInstrumentToken", () => {
    const snap = parseRedisMarketQuoteSnapshot(freshPayload(11111, 8300), maxAgeMs, nowMs, {
      expectedInstrumentToken: 26000,
    })
    expect(snap).toBeNull()
  })

  it("accepts mismatched embedded token when expectedInstrumentToken is omitted (legacy)", () => {
    const snap = parseRedisMarketQuoteSnapshot(freshPayload(11111, 8300), maxAgeMs, nowMs)
    expect(snap).not.toBeNull()
    expect(snap!.instrumentToken).toBe(11111)
  })
})
