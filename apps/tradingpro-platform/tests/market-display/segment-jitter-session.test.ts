/**
 * @file segment-jitter-session.test.ts
 * @module market-display
 * @description Unit tests for segment key → market-timing query mapping.
 * @author StockTrade
 * @created 2026-03-24
 */

import { marketDisplaySegmentKeyToTimingQuery } from "@/lib/market-display/segment-jitter-session"

describe("segment-jitter-session", () => {
  it("maps default bucket to NSE_EQ for conservative timing", () => {
    expect(marketDisplaySegmentKeyToTimingQuery("default")).toBe("NSE_EQ")
  })

  it("passes through concrete segment keys", () => {
    expect(marketDisplaySegmentKeyToTimingQuery("MCX_FO")).toBe("MCX_FO")
    expect(marketDisplaySegmentKeyToTimingQuery("NSE_FO")).toBe("NSE_FO")
  })
})
