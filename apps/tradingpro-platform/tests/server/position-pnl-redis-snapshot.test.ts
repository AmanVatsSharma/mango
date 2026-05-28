/**
 * @file position-pnl-redis-snapshot.test.ts
 * @module tests-server
 * @description Unit tests for Redis position PnL snapshot JSON parsing and freshness.
 * @author StockTrade
 * @created 2026-03-24
 */

import {
  parseRedisPositionPnLSnapshot,
  positionPnlRedisKey,
} from "@/lib/server/position-pnl-redis-snapshot"

describe("position-pnl-redis-snapshot", () => {
  const nowMs = 1_000_000

  it("positionPnlRedisKey prefixes id", () => {
    expect(positionPnlRedisKey("abc")).toBe("positions:pnl:abc")
  })

  it("parseRedisPositionPnLSnapshot returns null for stale updatedAtMs", () => {
    const raw = JSON.stringify({
      unrealizedPnL: 1,
      dayPnL: 2,
      currentPrice: 99.5,
      updatedAtMs: nowMs - 120_000,
    })
    expect(parseRedisPositionPnLSnapshot(raw, 60_000, nowMs)).toBeNull()
  })

  it("parseRedisPositionPnLSnapshot returns shape when fresh", () => {
    const raw = JSON.stringify({
      unrealizedPnL: 1,
      dayPnL: 2,
      currentPrice: 99.5,
      updatedAtMs: nowMs - 10_000,
    })
    const snap = parseRedisPositionPnLSnapshot(raw, 60_000, nowMs)
    expect(snap).toEqual({
      unrealizedPnL: 1,
      dayPnL: 2,
      currentPrice: 99.5,
      updatedAtMs: nowMs - 10_000,
    })
  })

  it("parseRedisPositionPnLSnapshot omits currentPrice when absent but keeps pnl fields", () => {
    const raw = JSON.stringify({
      unrealizedPnL: 0,
      dayPnL: 0,
      updatedAtMs: nowMs - 1000,
    })
    const snap = parseRedisPositionPnLSnapshot(raw, 60_000, nowMs)
    expect(snap?.currentPrice).toBeUndefined()
    expect(snap?.unrealizedPnL).toBe(0)
  })
})
