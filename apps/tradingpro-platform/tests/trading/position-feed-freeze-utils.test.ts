/**
 * @file tests/trading/position-feed-freeze-utils.test.ts
 * @module tests-trading
 * @description Unit tests for Positions tab freeze-last-live display policy helpers.
 * @author StockTrade
 * @created 2026-03-05
 */

import {
  resolveFrozenPositionDisplay,
  resolveGroupDisplayTotal,
  type FrozenLiveSnapshot,
} from "@/components/trading/position-feed-freeze-utils"
import type { ResolvedTradingPositionPnl } from "@/components/trading/trading-dashboard-number-utils"

const makeResolved = (overrides: Partial<ResolvedTradingPositionPnl>): ResolvedTradingPositionPnl => ({
  positionId: "pos-1",
  isClosed: false,
  quantity: 10,
  currentPrice: 100,
  displayPrice: 100,
  displayPriceSource: "LIVE",
  quoteAgeMs: 1000,
  totalPnl: 10,
  dayPnl: 10,
  unrealizedPnl: 10,
  bookedPnl: 0,
  source: "live",
  serverFresh: true,
  ...overrides,
})

describe("position-feed-freeze-utils", () => {
  it("freezes MTM at the last confirmed live value when source degrades", () => {
    const positions = [{ id: "pos-1", quantity: 10 }]
    const liveMap = new Map<string, ResolvedTradingPositionPnl>([
      [
        "pos-1",
        makeResolved({
          positionId: "pos-1",
          source: "live",
          displayPrice: 102,
          totalPnl: 20,
          dayPnl: 12,
          unrealizedPnl: 20,
        }),
      ],
    ])

    const first = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: liveMap,
      previousCache: new Map<string, FrozenLiveSnapshot>(),
      nowMs: 10_000,
    })

    expect(first.openMtm).toBe(20)
    expect(first.displayByPositionId.get("pos-1")?.feedState).toBe("LIVE")
    expect(first.displayByPositionId.get("pos-1")?.totalPnl).toBe(20)

    const staleMap = new Map<string, ResolvedTradingPositionPnl>([
      [
        "pos-1",
        makeResolved({
          positionId: "pos-1",
          source: "server",
          displayPrice: null,
          totalPnl: 85,
          dayPnl: 40,
          unrealizedPnl: 85,
        }),
      ],
    ])

    const second = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: staleMap,
      previousCache: first.cache,
      nowMs: 15_000,
    })

    expect(second.openMtm).toBe(20)
    expect(second.displayByPositionId.get("pos-1")?.feedState).toBe("FROZEN")
    expect(second.displayByPositionId.get("pos-1")?.totalPnl).toBe(20)
    expect(second.displayByPositionId.get("pos-1")?.displayPrice).toBe(102)
  })

  it("shows unknown MTM when no live baseline exists", () => {
    const positions = [{ id: "pos-1", quantity: 10 }]
    const staleOnly = new Map<string, ResolvedTradingPositionPnl>([
      [
        "pos-1",
        makeResolved({
          positionId: "pos-1",
          source: "server",
          displayPrice: null,
          totalPnl: 45,
          dayPnl: 20,
          unrealizedPnl: 45,
        }),
      ],
    ])

    const result = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: staleOnly,
      previousCache: new Map<string, FrozenLiveSnapshot>(),
      nowMs: 10_000,
    })

    expect(result.hasUnknownOpenPositions).toBe(true)
    expect(result.openMtm).toBeNull()
    expect(result.displayByPositionId.get("pos-1")?.feedState).toBe("STALE")
    expect(result.displayByPositionId.get("pos-1")?.displayPrice).toBeNull()
    expect(result.displayByPositionId.get("pos-1")?.totalPnl).toBeNull()
  })

  it("keeps group and aggregate totals aligned with frozen rows", () => {
    const positions = [
      { id: "pos-live", quantity: 10 },
      { id: "pos-frozen", quantity: 5 },
      { id: "pos-closed", quantity: 0, isClosed: true, status: "CLOSED" },
    ]

    const warmMap = new Map<string, ResolvedTradingPositionPnl>([
      ["pos-live", makeResolved({ positionId: "pos-live", source: "live", totalPnl: 10, unrealizedPnl: 10, dayPnl: 5, displayPrice: 101 })],
      ["pos-frozen", makeResolved({ positionId: "pos-frozen", source: "live", totalPnl: 8, unrealizedPnl: 8, dayPnl: 4, displayPrice: 99 })],
      [
        "pos-closed",
        makeResolved({
          positionId: "pos-closed",
          isClosed: true,
          source: "closed",
          quantity: 0,
          totalPnl: 30,
          dayPnl: 30,
          unrealizedPnl: 0,
          bookedPnl: 30,
          displayPrice: 100,
        }),
      ],
    ])

    const warm = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: warmMap,
      previousCache: new Map<string, FrozenLiveSnapshot>(),
      nowMs: 10_000,
    })

    const degradedMap = new Map<string, ResolvedTradingPositionPnl>([
      ["pos-live", makeResolved({ positionId: "pos-live", source: "live", totalPnl: 10, unrealizedPnl: 10, dayPnl: 5, displayPrice: 101 })],
      ["pos-frozen", makeResolved({ positionId: "pos-frozen", source: "server", totalPnl: 55, unrealizedPnl: 55, dayPnl: 12, displayPrice: null })],
      [
        "pos-closed",
        makeResolved({
          positionId: "pos-closed",
          isClosed: true,
          source: "closed",
          quantity: 0,
          totalPnl: 30,
          dayPnl: 30,
          unrealizedPnl: 0,
          bookedPnl: 30,
          displayPrice: 100,
        }),
      ],
    ])

    const result = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: degradedMap,
      previousCache: warm.cache,
      nowMs: 14_000,
    })

    expect(result.openMtm).toBe(18)
    expect(result.bookedToday).toBe(30)
    expect(result.totalPositions).toBe(2)
    expect(result.displayByPositionId.get("pos-frozen")?.feedState).toBe("FROZEN")
    expect(resolveGroupDisplayTotal({ positionIds: ["pos-live", "pos-frozen"], displayByPositionId: result.displayByPositionId })).toBe(18)
  })

  it("positionsRowPriceBasis exchange_ltp prefers currentPrice over smoothed displayPrice on LIVE rows", () => {
    const positions = [{ id: "pos-1", quantity: 10 }]
    const liveMap = new Map<string, ResolvedTradingPositionPnl>([
      [
        "pos-1",
        makeResolved({
          positionId: "pos-1",
          source: "live",
          currentPrice: 100,
          displayPrice: 102,
          totalPnl: 20,
        }),
      ],
    ])

    const smoothed = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: liveMap,
      previousCache: new Map<string, FrozenLiveSnapshot>(),
      nowMs: 10_000,
      positionsRowPriceBasis: "smoothed_display",
    })
    expect(smoothed.displayByPositionId.get("pos-1")?.displayPrice).toBe(102)

    const exchange = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId: liveMap,
      previousCache: new Map<string, FrozenLiveSnapshot>(),
      nowMs: 10_000,
      positionsRowPriceBasis: "exchange_ltp",
    })
    expect(exchange.displayByPositionId.get("pos-1")?.displayPrice).toBe(100)
  })
})
