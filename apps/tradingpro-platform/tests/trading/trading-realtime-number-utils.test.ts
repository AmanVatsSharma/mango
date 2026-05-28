/**
 * @file tests/trading/trading-realtime-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for trading realtime provider numeric fallback helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  computeTradingRealtimeFallbackPnl,
  resolveRealtimePositionInstrumentIds,
  resolveRealtimePositionTokens,
} from "@/components/trading/realtime/trading-realtime-number-utils"

describe("trading-realtime-number-utils", () => {
  it("computes fallback pnl with strict finite parsing", () => {
    expect(
      computeTradingRealtimeFallbackPnl([
        { unrealizedPnL: "120.5", dayPnL: "20" },
        { unrealizedPnL: "NaN", dayPnL: "Infinity" },
      ]),
    ).toEqual({
      totalPnL: 120.5,
      dayPnL: 20,
    })
  })

  it("resolves unique instrument ids with trim guards", () => {
    expect(
      resolveRealtimePositionInstrumentIds([
        { stock: { instrumentId: " NSE_EQ-26000 " } },
        { instrumentId: "NSE_EQ-26000" },
        { instrumentId: " " },
      ]),
    ).toEqual(["NSE_EQ-26000"])
  })

  it("resolves strict positive unique tokens token-first with instrument fallback", () => {
    expect(
      resolveRealtimePositionTokens([
        { stock: { token: 26000, instrumentId: "NSE_EQ-99999" } },
        { token: "26009", instrumentId: "NSE_EQ-77777" },
        { stock: { token: "  " }, instrumentId: "NSE_EQ-26074" },
        { instrumentId: "NSE_EQ-1e3" },
      ]),
    ).toEqual([26000, 26009, 26074])
  })
})
