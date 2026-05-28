/**
 * @file position-pnl-redis-snapshot.test.ts
 * @module tests-lib
 * @description Snapshot tick-age gating for `positions:pnl` Redis payloads.
 * @author StockTrade
 * @created 2026-03-30
 */

import { parseRedisPositionPnLSnapshot } from "@/lib/server/position-pnl-redis-snapshot"

describe("parseRedisPositionPnLSnapshot", () => {
  const basePayload = {
    unrealizedPnL: 10,
    dayPnL: 5,
    currentPrice: 250.5,
    updatedAtMs: 1_000_000,
    quoteReceivedAtMs: 1_000_000,
  }

  it("strips currentPrice when tick age exceeds positionPnlQuoteMaxAgeMs", () => {
    const raw = JSON.stringify(basePayload)
    const nowMs = 1_000_000 + 20_000
    const snap = parseRedisPositionPnLSnapshot(raw, 120_000, nowMs, {
      positionPnlQuoteMaxAgeMs: 15_000,
    })
    expect(snap).not.toBeNull()
    expect(snap!.currentPrice).toBeUndefined()
    expect(snap!.unrealizedPnL).toBe(10)
  })

  it("keeps currentPrice when tick is fresh", () => {
    const raw = JSON.stringify(basePayload)
    const nowMs = 1_000_000 + 5_000
    const snap = parseRedisPositionPnLSnapshot(raw, 120_000, nowMs, {
      positionPnlQuoteMaxAgeMs: 15_000,
    })
    expect(snap?.currentPrice).toBe(250.5)
  })
})
