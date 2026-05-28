/**
 * @file position-square-off-exit-price.test.ts
 * @module tests-server
 * @description Subscription last-tick fallback for admin-configured square-off.
 * @author StockTrade
 * @created 2026-03-30
 */

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: jest.fn(),
}))

jest.mock("@/lib/server/position-pnl-redis-snapshot", () => ({
  readRedisPositionPnLSnapshot: jest.fn(),
}))

jest.mock("@/lib/server/market-quote-redis", () => ({
  readRedisMarketQuoteSnapshotForToken: jest.fn(),
}))

import { getServerMarketDataService } from "@/lib/market-data/server-market-data.service"
import { readRedisPositionPnLSnapshot } from "@/lib/server/position-pnl-redis-snapshot"
import { readRedisMarketQuoteSnapshotForToken } from "@/lib/server/market-quote-redis"
import { resolveSquareOffExitPrice } from "@/lib/server/position-square-off-exit-price"

const defaultRedisAges = {
  pnlServerMaxAgeMs: 15_000,
  positionPnlQuoteMaxAgeMs: 15_000,
  redisMarketQuoteMaxAgeMs: 7_500,
} as const

const getServerMarketDataServiceMock = getServerMarketDataService as jest.MockedFunction<
  typeof getServerMarketDataService
>
const readRedisPositionPnLSnapshotMock = readRedisPositionPnLSnapshot as jest.MockedFunction<
  typeof readRedisPositionPnLSnapshot
>
const readRedisMarketQuoteSnapshotForTokenMock =
  readRedisMarketQuoteSnapshotForToken as jest.MockedFunction<
    typeof readRedisMarketQuoteSnapshotForToken
  >

describe("resolveSquareOffExitPrice allowLastSubscriptionTickFallback", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    readRedisPositionPnLSnapshotMock.mockResolvedValue(null)
    readRedisMarketQuoteSnapshotForTokenMock.mockResolvedValue(null)
  })

  it("returns subscription_last_tick when fresh quote missing but cache has LTP and flag is true", async () => {
    const waitForFreshQuote = jest.fn().mockResolvedValue(null)
    const getQuote = jest.fn().mockReturnValue({
      last_trade_price: 99.5,
      receivedAt: Date.now() - 120_000,
    })
    getServerMarketDataServiceMock.mockReturnValue({
      waitForFreshQuote,
      getQuote,
      getHealth: () => ({ isConnected: true }),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      ensureSubscribed: jest.fn(),
    } as unknown as ReturnType<typeof getServerMarketDataService>)

    const result = await resolveSquareOffExitPrice({
      nowMs: Date.now(),
      exitPriceCandidate: undefined,
      ltpAgeMsCandidate: undefined,
      ltpTimestampCandidate: undefined,
      authority: "client_assisted",
      closeExitPolicy: "server_live_only",
      maxDeviationBps: 100,
      positionId: "pos-1",
      stockToken: 26000,
      subscriptionKey: 26000,
      markLiveQuoteMaxAgeMs: 60_000,
      ...defaultRedisAges,
      quoteTimeoutMs: 3000,
      allowLastSubscriptionTickFallback: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.price).toBe(99.5)
      expect(result.source).toBe("subscription_last_tick")
    }
    expect(waitForFreshQuote).toHaveBeenCalled()
    expect(getQuote).toHaveBeenCalledWith(26000, { maxAgeMs: 0 })
  })

  it("fails when fresh missing and flag is false (no getQuote fallback for resolution)", async () => {
    const waitForFreshQuote = jest.fn().mockResolvedValue(null)
    const getQuote = jest.fn().mockReturnValue({ last_trade_price: 99.5, receivedAt: Date.now() })
    getServerMarketDataServiceMock.mockReturnValue({
      waitForFreshQuote,
      getQuote,
      getHealth: () => ({ isConnected: true }),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      ensureSubscribed: jest.fn(),
    } as unknown as ReturnType<typeof getServerMarketDataService>)

    const result = await resolveSquareOffExitPrice({
      nowMs: Date.now(),
      exitPriceCandidate: undefined,
      ltpAgeMsCandidate: undefined,
      ltpTimestampCandidate: undefined,
      authority: "client_assisted",
      closeExitPolicy: "server_live_only",
      maxDeviationBps: 100,
      positionId: "pos-1",
      stockToken: 26000,
      subscriptionKey: 26000,
      markLiveQuoteMaxAgeMs: 60_000,
      ...defaultRedisAges,
      quoteTimeoutMs: 3000,
      allowLastSubscriptionTickFallback: false,
    })

    expect(result.ok).toBe(false)
    expect(getQuote).not.toHaveBeenCalled()
  })

  it("useClientPriceWhenWithinBand rejects when client exit is outside deviation of server", async () => {
    const waitForFreshQuote = jest.fn().mockResolvedValue({
      last_trade_price: 100,
      receivedAt: Date.now(),
    })
    getServerMarketDataServiceMock.mockReturnValue({
      waitForFreshQuote,
      getQuote: jest.fn(),
      getHealth: () => ({ isConnected: true }),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      ensureSubscribed: jest.fn(),
    } as unknown as ReturnType<typeof getServerMarketDataService>)

    const result = await resolveSquareOffExitPrice({
      nowMs: Date.now(),
      exitPriceCandidate: 200,
      ltpAgeMsCandidate: undefined,
      ltpTimestampCandidate: undefined,
      authority: "server",
      closeExitPolicy: "server_live_only",
      maxDeviationBps: 100,
      positionId: "pos-1",
      stockToken: 26000,
      subscriptionKey: 26000,
      markLiveQuoteMaxAgeMs: 60_000,
      ...defaultRedisAges,
      quoteTimeoutMs: 3000,
      useClientPriceWhenWithinBand: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("EXIT_PRICE_DEVIATION")
    }
  })

  it("returns REFERENCE_DIVERGENCE when Redis and fresh server quotes differ beyond max", async () => {
    const waitForFreshQuote = jest.fn().mockResolvedValue({
      last_trade_price: 100,
      receivedAt: Date.now(),
    })
    getServerMarketDataServiceMock.mockReturnValue({
      waitForFreshQuote,
      getQuote: jest.fn(),
      getHealth: () => ({ isConnected: true }),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      ensureSubscribed: jest.fn(),
    } as unknown as ReturnType<typeof getServerMarketDataService>)
    readRedisPositionPnLSnapshotMock.mockResolvedValue({ currentPrice: 120 } as never)

    const result = await resolveSquareOffExitPrice({
      nowMs: Date.now(),
      exitPriceCandidate: undefined,
      ltpAgeMsCandidate: undefined,
      ltpTimestampCandidate: undefined,
      authority: "client_assisted",
      closeExitPolicy: "server_live_then_redis_snapshot",
      maxDeviationBps: 100,
      positionId: "pos-1",
      stockToken: 26000,
      subscriptionKey: 26000,
      markLiveQuoteMaxAgeMs: 60_000,
      ...defaultRedisAges,
      quoteTimeoutMs: 3000,
      referenceDivergenceMaxBps: 500,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("REFERENCE_DIVERGENCE")
    }
  })
})
