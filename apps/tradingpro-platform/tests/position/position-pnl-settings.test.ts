/**
 * @file position-pnl-settings.test.ts
 * @module tests/position
 * @description Unit tests for worker heartbeat freshness logic.
 * @author StockTrade
 * @created 2026-02-04
 */

import { isPositionPnLWorkerHealthy } from "@/lib/server/position-pnl-settings"

describe("isPositionPnLWorkerHealthy", () => {
  it("returns true for heartbeat within 2 minutes", () => {
    const now = Date.now()
    const hb = { lastRunAtIso: new Date(now - 30_000).toISOString() }
    expect(isPositionPnLWorkerHealthy(hb as any, now)).toBe(true)
  })

  it("returns false for stale heartbeat", () => {
    const now = Date.now()
    const hb = { lastRunAtIso: new Date(now - 10 * 60_000).toISOString() }
    expect(isPositionPnLWorkerHealthy(hb as any, now)).toBe(false)
  })
})

