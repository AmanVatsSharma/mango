/**
 * File:        tests/market-data/live-quote-ladder.test.ts
 * Module:      Tests · Market Data · Live Price Resolution
 * Purpose:     Verifies the tiered price resolution waterfall (market-quote → position-pnl → stock-ltp → unpriced).
 *
 * Exports:
 *   - (Jest test suite — no exports)
 *
 * Depends on:
 *   - @/lib/market-data/live-quote-ladder — module under test
 *   - @/lib/redis/redis-client             — mocked to avoid real Redis connections
 *   - @/lib/server/market-quote-redis      — uses redisGet internally
 *   - @/lib/server/position-pnl-redis-snapshot — uses redisGet internally
 *
 * Side-effects:
 *   - none (all Redis calls mocked)
 *
 * Key invariants:
 *   - isRedisEnabled() must return true for the helpers to attempt Redis reads
 *   - Each test resets all mocks via beforeEach
 *
 * Read order:
 *   1. mock setup — how Redis is mocked
 *   2. individual test cases in tier order
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

jest.mock("@/lib/redis/redis-client", () => ({
  isRedisEnabled: jest.fn(() => true),
  redisGet: jest.fn(),
  redisMGet: jest.fn(),
  redisSet: jest.fn(),
}))

// Mock market-quote-redis to avoid the missing normalizeMarketDataQuoteMaxAgeMs import
// and to expose readRedisMarketQuoteSnapshotForToken for assertions.
jest.mock("@/lib/server/market-quote-redis", () => ({
  resolveMarketQuoteRedisMaxAgeMs: jest.fn(() => 7_500),
  readRedisMarketQuoteSnapshotForToken: jest.fn(),
  marketQuoteRedisKey: (token: number) => `market:quote:${token}`,
}))

// Mock position-pnl-redis-snapshot to expose readRedisPositionPnLSnapshot for assertions.
jest.mock("@/lib/server/position-pnl-redis-snapshot", () => ({
  readRedisPositionPnLSnapshot: jest.fn(),
  positionPnlRedisKey: (id: string) => `positions:pnl:${id}`,
}))

import { resolveLivePrice } from "@/lib/market-data/live-quote-ladder"
import { readRedisMarketQuoteSnapshotForToken } from "@/lib/server/market-quote-redis"
import { readRedisPositionPnLSnapshot } from "@/lib/server/position-pnl-redis-snapshot"

const mockReadMarketQuote = readRedisMarketQuoteSnapshotForToken as jest.MockedFunction<typeof readRedisMarketQuoteSnapshotForToken>
const mockReadPnlSnapshot = readRedisPositionPnLSnapshot as jest.MockedFunction<typeof readRedisPositionPnLSnapshot>

const NOW_MS = 1_713_600_000_000 // fixed epoch for stable ageMs assertions

type MockMarketSnap = { instrumentToken: number; last_trade_price: number; prev_close_price?: number; receivedAtMs: number }
type MockPnlSnap = { unrealizedPnL: number; dayPnL: number; currentPrice?: number; updatedAtMs: number }

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW_MS)
})

afterAll(() => {
  jest.restoreAllMocks()
})

function makeMarketSnap(overrides?: Partial<MockMarketSnap>): MockMarketSnap {
  return {
    instrumentToken: 256265,
    last_trade_price: 1850.5,
    prev_close_price: 1820.0,
    receivedAtMs: NOW_MS - 500,
    ...overrides,
  }
}

function makePnlSnap(overrides?: Partial<MockPnlSnap>): MockPnlSnap {
  return {
    unrealizedPnL: -250.0,
    dayPnL: 100.0,
    currentPrice: 1840.0,
    updatedAtMs: NOW_MS - 1000,
    ...overrides,
  }
}

describe("resolveLivePrice", () => {
  it("1. returns market-quote source when snapshot is fresh", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(makeMarketSnap())

    const result = await resolveLivePrice({
      instrumentToken: 256265,
      positionId: "pos-abc",
      fallbackLtp: 1800,
    })

    expect(result.source).toBe("market-quote")
    expect(result.price).toBe(1850.5)
    expect(result.prevClose).toBe(1820.0)
    expect(result.ageMs).toBe(500)
  })

  it("2. falls through to position-pnl when market-quote is stale (returns null)", async () => {
    // readRedisMarketQuoteSnapshotForToken returns null when snapshot is stale
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(makePnlSnap())

    const result = await resolveLivePrice({
      instrumentToken: 256265,
      positionId: "pos-abc",
      fallbackLtp: 1800,
    })

    expect(result.source).toBe("position-pnl")
    expect(result.price).toBe(1840.0)
  })

  it("3. returns position-pnl source when worker snapshot has currentPrice", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(makePnlSnap())

    const result = await resolveLivePrice({
      instrumentToken: 256265,
      positionId: "pos-abc",
      fallbackLtp: null,
    })

    expect(result.source).toBe("position-pnl")
    expect(result.price).toBe(1840.0)
    expect(result.workerPnL?.unrealizedPnL).toBe(-250.0)
    expect(result.workerPnL?.dayPnL).toBe(100.0)
    expect(result.ageMs).toBe(1000)
  })

  it("4. falls back to stock-ltp when both redis paths return null", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(null)

    const result = await resolveLivePrice({
      instrumentToken: 256265,
      positionId: "pos-abc",
      fallbackLtp: 1780.5,
    })

    expect(result.source).toBe("stock-ltp")
    expect(result.price).toBe(1780.5)
    expect(result.ageMs).toBeNull()
  })

  it("5. returns unpriced when all tiers are empty/missing", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(null)

    const result = await resolveLivePrice({
      instrumentToken: 256265,
      positionId: "pos-abc",
      fallbackLtp: null,
    })

    expect(result.source).toBe("unpriced")
    expect(result.price).toBe(0)
    expect(result.ageMs).toBeNull()
  })

  it("6. null instrumentToken skips market-quote tier and tries position-pnl", async () => {
    mockReadPnlSnapshot.mockResolvedValueOnce(makePnlSnap())

    const result = await resolveLivePrice({
      instrumentToken: null,
      positionId: "pos-xyz",
      fallbackLtp: 1800,
    })

    expect(result.source).toBe("position-pnl")
    expect(mockReadMarketQuote).not.toHaveBeenCalled()
  })

  it("7. fallbackLtp === 0 is treated as missing (not a valid price)", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(null)

    const result = await resolveLivePrice({
      instrumentToken: null,
      positionId: "pos-def",
      fallbackLtp: 0,
    })

    expect(result.source).toBe("unpriced")
    expect(result.price).toBe(0)
  })

  it("8. negative fallbackLtp is treated as missing", async () => {
    mockReadMarketQuote.mockResolvedValueOnce(null)
    mockReadPnlSnapshot.mockResolvedValueOnce(null)

    const result = await resolveLivePrice({
      instrumentToken: null,
      positionId: "pos-ghi",
      fallbackLtp: -50,
    })

    expect(result.source).toBe("unpriced")
    expect(result.price).toBe(0)
  })
})
