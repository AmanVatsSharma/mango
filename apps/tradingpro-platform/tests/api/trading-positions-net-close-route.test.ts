/**
 * @file tests/api/trading-positions-net-close-route.test.ts
 * @module tests-api
 * @description Route-level tests for dynamic risk policy enforcement in /api/trading/positions/net/close.
 * @author StockTrade
 * @created 2026-03-05
 */

const withApiTelemetryMock = jest.fn()
const requireAuthenticatedUserIdMock = jest.fn()
const assertTradingAccountOwnershipMock = jest.fn()
const evaluateTradingPoliciesForContextMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const positionFindManyMock = jest.fn()
const stockFindFirstMock = jest.fn()
const closePositionMock = jest.fn()
const waitForFreshQuoteMock = jest.fn()
const getMarketDisplayPositionPricingPoliciesMock = jest.fn()
const readRedisPositionPnLSnapshotMock = jest.fn()

jest.mock("@/lib/server/trading-access", () => {
  class TradingAccessError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.name = "TradingAccessError"
      this.statusCode = statusCode
    }
  }

  return {
    requireAuthenticatedUserId: (...args: any[]) => requireAuthenticatedUserIdMock(...args),
    assertRequestedUserScope: (requestedUserId: any, authenticatedUserId: string) => {
      if (requestedUserId !== null && requestedUserId !== undefined && typeof requestedUserId !== "string") {
        throw new TradingAccessError("Invalid user scope", 400)
      }
      const normalizedRequested = typeof requestedUserId === "string" ? requestedUserId.trim() : ""
      if (normalizedRequested && normalizedRequested !== authenticatedUserId) {
        throw new TradingAccessError("Forbidden", 403)
      }
    },
    assertTradingAccountOwnership: (...args: any[]) => assertTradingAccountOwnershipMock(...args),
    resolveTradingErrorResponse: (error: any, fallbackMessage: string, fallbackStatus = 500) => ({
      message: error?.message || fallbackMessage,
      status: error?.statusCode || fallbackStatus,
    }),
    TradingAccessError,
  }
})

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    position: {
      findMany: (...args: any[]) => positionFindManyMock(...args),
    },
    stock: {
      findFirst: (...args: any[]) => stockFindFirstMock(...args),
    },
  },
}))

jest.mock("@/lib/services/position/PositionManagementService", () => ({
  createPositionManagementService: jest.fn(() => ({
    closePosition: (...args: any[]) => closePositionMock(...args),
  })),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  createTradingLogger: jest.fn(() => ({ log: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

jest.mock("@/lib/services/risk/dynamic-trading-policies", () => ({
  evaluateTradingPoliciesForContext: (...args: any[]) => evaluateTradingPoliciesForContextMock(...args),
}))

jest.mock("@/lib/services/risk/risk-config-normalizer", () => ({
  isIntradayRiskConfigProductType: (value: unknown) => String(value || "").trim().toUpperCase() === "MIS",
  normalizeRiskConfigProductType: (value: unknown) => {
    const normalized = String(value || "").trim().toUpperCase()
    return normalized || "MIS"
  },
  resolveRiskConfigProductTypeCandidates: (value: unknown) => {
    const normalized = String(value || "").trim().toUpperCase()
    return [normalized || "MIS"]
  },
}))

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => ({
    waitForFreshQuote: (...args: any[]) => waitForFreshQuoteMock(...args),
    getQuote: jest.fn(),
    getHealth: () => ({ isConnected: true }),
    ensureInitialized: jest.fn().mockResolvedValue(undefined),
    ensureSubscribed: jest.fn(),
  }),
}))

jest.mock("@/lib/market-data/utils/quote-lookup", () => ({
  parseFiniteMarketNumber: (value: unknown) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "string") {
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    return null
  },
  parsePositiveIntegerMarketNumber: (value: unknown) => {
    if (value === null || value === undefined || value === "") {
      return null
    }
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  },
  parseTokenFromInstrumentId: jest.fn(() => null),
  resolveSubscriptionIdentity: jest.fn(() => ({ subscriptionKey: null })),
}))

jest.mock("@/lib/server/market-display-exit-policy", () => ({
  getMarketDisplayPositionPricingPolicies: (...args: any[]) => getMarketDisplayPositionPricingPoliciesMock(...args),
}))

jest.mock("@/lib/server/position-pnl-redis-snapshot", () => ({
  readRedisPositionPnLSnapshot: (...args: any[]) => readRedisPositionPnLSnapshotMock(...args),
}))

jest.mock("@/lib/server/market-quote-redis", () => ({
  readRedisMarketQuoteSnapshotForToken: jest.fn().mockResolvedValue(null),
}))

jest.mock("@/lib/server/trading-number", () => ({
  parseFiniteTradingNumber: (value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null
    }
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  },
}))

import { POST } from "@/app/api/trading/positions/net/close/route"

describe("POST /api/trading/positions/net/close risk policy", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    assertTradingAccountOwnershipMock.mockResolvedValue(undefined)
    tradingAccountFindUniqueMock.mockResolvedValue({
      id: "acct-1",
      balance: 120_000,
      availableMargin: 80_000,
      usedMargin: 40_000,
    })
    positionFindManyMock.mockResolvedValue([
      {
        id: "lot-1",
        symbol: "NIFTY24MARFUT",
        quantity: 150,
        averagePrice: 22000,
        unrealizedPnL: -375,
        createdAt: new Date(Date.now() - 12 * 60_000),
        productType: "MIS",
        isIntraday: true,
        Stock: {
          id: "stock-1",
          segment: "NFO",
          lot_size: 75,
          instrumentId: "NFO|26000",
          token: 26000,
          exchange: "NFO",
        },
      },
    ])
    stockFindFirstMock.mockResolvedValue(null)
    closePositionMock.mockResolvedValue({
      closedQuantity: 75,
      realizedPnL: -125,
      marginReleased: 5000,
    })
    waitForFreshQuoteMock.mockResolvedValue(null)
    getMarketDisplayPositionPricingPoliciesMock.mockResolvedValue({
      positionCloseExitPricePolicy: "server_live_only",
      positionSquareOffPriceAuthority: "client_assisted",
      positionsTabMtmDisplayMode: "live_quote_preferred",
      positionSquareOffClientMaxDeviationBps: 100,
      adminSquareOffAllowLastSubscriptionTick: false,
      positionCloseUseClientPriceWhenWithinBand: false,
      adminPositionCloseMaxDeviationBps: null,
      positionCloseReferenceDivergenceMaxBps: null,
      pnlServerMaxAgeMs: 15_000,
      redisMarketQuoteMaxAgeMs: 7_500,
      positionPnlQuoteMaxAgeMs: 15_000,
    })
    readRedisPositionPnLSnapshotMock.mockResolvedValue(null)
    evaluateTradingPoliciesForContextMock.mockResolvedValue({
      blocked: true,
      message: "Blocked by close policy",
      retryAfterSeconds: 180,
      policy: {
        id: "policy-close-delay",
        name: "Close delay",
        context: "POSITION_CLOSE",
        source: "dynamic",
      },
    })
  })

  it("returns 423 with policy details when evaluator blocks and includes retry-after", async () => {
    const req = new Request("http://localhost/api/trading/positions/net/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stockId: "stock-1",
        productType: "MIS",
        closeLots: 1,
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(423)
    expect(res.headers.get("Retry-After")).toBe("180")
    expect(body).toMatchObject({
      error: "Blocked by close policy",
      policy: {
        id: "policy-close-delay",
        name: "Close delay",
        context: "POSITION_CLOSE",
        source: "dynamic",
        retryAfterSeconds: 180,
      },
    })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("passes expected POSITION_CLOSE snapshot fields into policy evaluator", async () => {
    evaluateTradingPoliciesForContextMock.mockResolvedValueOnce({
      blocked: true,
      message: "Hold time active",
      retryAfterSeconds: 60,
      policy: {
        id: "policy-snapshot",
        name: "Snapshot check",
        context: "POSITION_CLOSE",
        source: "dynamic",
      },
    })

    const req = new Request("http://localhost/api/trading/positions/net/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stockId: "stock-1",
        productType: "MIS",
        closeLots: 1,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(423)
    expect(evaluateTradingPoliciesForContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "POSITION_CLOSE",
        snapshot: expect.objectContaining({
          position: expect.objectContaining({
            requestedCloseQuantity: 75,
            requestedCloseLots: 1,
            remainingQuantityAfterClose: 75,
            segment: "NFO",
            productType: "MIS",
          }),
          account: expect.objectContaining({
            balance: 120_000,
            availableMargin: 80_000,
            usedMargin: 40_000,
          }),
        }),
      }),
    )
  })

  it("uses primary lot Redis snapshot when live quote missing and policy allows", async () => {
    evaluateTradingPoliciesForContextMock.mockResolvedValueOnce({ blocked: false })
    getMarketDisplayPositionPricingPoliciesMock.mockResolvedValueOnce({
      positionCloseExitPricePolicy: "server_live_then_redis_snapshot",
      positionSquareOffPriceAuthority: "client_assisted",
      positionsTabMtmDisplayMode: "live_quote_preferred",
      positionSquareOffClientMaxDeviationBps: 100,
      adminSquareOffAllowLastSubscriptionTick: false,
      positionCloseUseClientPriceWhenWithinBand: false,
      adminPositionCloseMaxDeviationBps: null,
      positionCloseReferenceDivergenceMaxBps: null,
      pnlServerMaxAgeMs: 15_000,
      redisMarketQuoteMaxAgeMs: 7_500,
      positionPnlQuoteMaxAgeMs: 15_000,
    })
    waitForFreshQuoteMock.mockResolvedValueOnce(null)
    const ts = Date.now()
    readRedisPositionPnLSnapshotMock.mockResolvedValueOnce({
      unrealizedPnL: 0,
      dayPnL: 0,
      currentPrice: 22_200,
      updatedAtMs: ts,
    })

    const req = new Request("http://localhost/api/trading/positions/net/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stockId: "stock-1",
        productType: "MIS",
        closeLots: 1,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(readRedisPositionPnLSnapshotMock).toHaveBeenCalledWith(
      "lot-1",
      15_000,
      expect.any(Number),
      { positionPnlQuoteMaxAgeMs: 15_000 },
    )
    expect(closePositionMock).toHaveBeenCalledWith("lot-1", "acct-1", 22_200, 75)
  })
})
