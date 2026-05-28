/**
 * @file tests/api/trading-positions-list-route.test.ts
 * @module tests-api
 * @description Route-level auth/ownership/error mapping tests for /api/trading/positions/list GET.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const positionFindManyMock = jest.fn()
const withApiTelemetryMock = jest.fn()
const getPositionPnLSettingsMock = jest.fn()
const getMarketDisplayPositionPricingPoliciesMock = jest.fn()
const isRedisEnabledMock = jest.fn()
const redisMGetMock = jest.fn()

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
    getRequestSearchParams: (req: { url?: string; nextUrl?: { searchParams?: URLSearchParams; search?: string } }) => {
      try {
        return new URL(req?.url || "http://localhost", "http://localhost").searchParams
      } catch {
        if (req?.nextUrl?.searchParams) {
          return req.nextUrl.searchParams
        }
        if (typeof req?.nextUrl?.search === "string") {
          const raw = req.nextUrl.search.startsWith("?") ? req.nextUrl.search.slice(1) : req.nextUrl.search
          return new URLSearchParams(raw)
        }
        return new URLSearchParams()
      }
    },
    assertRequestedUserScope: (requestedUserId: any, authenticatedUserId: string) => {
      const normalizedRequested = typeof requestedUserId === "string" ? requestedUserId.trim() : ""
      if (normalizedRequested.length > 128) {
        throw new TradingAccessError("Invalid user scope", 400)
      }
      if (normalizedRequested && normalizedRequested !== authenticatedUserId) {
        throw new TradingAccessError("Forbidden", 403)
      }
    },
    assertTradingAccountOwnership: jest.fn(),
    assertOrderOwnership: jest.fn(),
    getOwnedPositionContext: jest.fn(),
    resolveTradingErrorResponse: (error: any, fallbackMessage = "Failed to fetch positions", fallbackStatus = 500) => ({
      message: error?.issues?.[0]?.message || error?.message || fallbackMessage,
      status: error instanceof TradingAccessError ? error.statusCode : error?.name === "ZodError" ? 400 : fallbackStatus,
    }),
    TradingAccessError,
  }
})

const systemSettingsFindFirstMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    position: {
      findMany: (...args: any[]) => positionFindManyMock(...args),
    },
    systemSettings: {
      findFirst: (...args: any[]) => systemSettingsFindFirstMock(...args),
    },
  },
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

jest.mock("@/lib/server/position-pnl-settings", () => ({
  getPositionPnLSettings: (...args: any[]) => getPositionPnLSettingsMock(...args),
}))

jest.mock("@/lib/server/market-display-exit-policy", () => ({
  getMarketDisplayPositionPricingPolicies: (...args: any[]) => getMarketDisplayPositionPricingPoliciesMock(...args),
}))

jest.mock("@/lib/redis/redis-client", () => ({
  isRedisEnabled: (...args: any[]) => isRedisEnabledMock(...args),
  redisMGet: (...args: any[]) => redisMGetMock(...args),
}))

import { GET } from "@/app/api/trading/positions/list/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("GET /api/trading/positions/list", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    getPositionPnLSettingsMock.mockResolvedValue({ mode: "client", workerHealthy: true })
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
    isRedisEnabledMock.mockReturnValue(false)
    redisMGetMock.mockResolvedValue([])
    tradingAccountFindUniqueMock.mockResolvedValue({ id: "acct-1", userId: "user-1" })
    const defaultOpenPosition = {
      id: "pos-1",
      symbol: "RELIANCE",
      quantity: 2,
      averagePrice: 100,
      unrealizedPnL: 10,
      dayPnL: 5,
      stopLoss: null,
      target: null,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      closedAt: null,
      Stock: {
        symbol: "RELIANCE",
        name: "Reliance Industries",
        ltp: 105,
        instrumentId: "NSE-2885",
        segment: "NSE",
      },
    }
    positionFindManyMock.mockImplementation(async (args: any) => {
      const where = (args as any)?.where || {}
      const quantityClause = where?.quantity
      const isOpenQuery = typeof quantityClause === "object" && quantityClause?.not === 0
      const isClosedQuery = quantityClause === 0
      if (isClosedQuery) return []
      if (isOpenQuery) return [defaultOpenPosition]
      return [defaultOpenPosition]
    })
    systemSettingsFindFirstMock.mockResolvedValue(null)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("returns 401 when authentication fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
    })
  })

  it("returns 403 when requested userId mismatches authenticated user", async () => {
    const req = new Request("http://localhost/api/trading/positions/list?userId=user-2")

    const res = await GET(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Forbidden",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns 400 when requested userId exceeds max scope length", async () => {
    const tooLongUserId = "u".repeat(200)
    const req = new Request(`http://localhost/api/trading/positions/list?userId=${tooLongUserId}`)

    const res = await GET(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid user scope",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns empty list when trading account is missing", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      positions: [],
      meta: {
        pnlMode: "client",
        workerHealthy: true,
        positionsTabMtmDisplayMode: "live_quote_preferred",
        positionSquareOffPriceAuthority: "client_assisted",
      },
    })
  })

  it("returns normalized positions payload for owned account", async () => {
    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(tradingAccountFindUniqueMock).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    expect(positionFindManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ tradingAccountId: "acct-1", quantity: { not: 0 } }),
      }),
    )
    expect(positionFindManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tradingAccountId: "acct-1",
          quantity: 0,
          closedAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    )
    expect(body).toMatchObject({
      success: true,
      meta: {
        pnlMode: "client",
        workerHealthy: true,
        positionsTabMtmDisplayMode: "live_quote_preferred",
        positionSquareOffPriceAuthority: "client_assisted",
      },
      positions: [
        {
          id: "pos-1",
          symbol: "RELIANCE",
          status: "OPEN",
          isClosed: false,
          quantity: 2,
          stopLoss: null,
          target: null,
          closedAt: null,
          stock: { instrumentId: "NSE-2885" },
        },
      ],
    })
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_positions_list" },
      expect.any(Function),
    )
  })

  it("includes top-level and nested F&O metadata in positions payload", async () => {
    const expiryIso = "2026-02-27T09:15:00.000Z"
    positionFindManyMock.mockReset()
    positionFindManyMock
      .mockResolvedValueOnce([
        {
          id: "pos-fo",
          symbol: "NIFTY26FEB25000CE",
          stockId: "stock-fo-1",
          quantity: 50,
          productType: "DELIVERY",
          isIntraday: false,
          averagePrice: 120,
          unrealizedPnL: 0,
          dayPnL: 0,
          stopLoss: 90,
          target: 180,
          createdAt: new Date("2026-02-15T12:00:00.000Z"),
          closedAt: null,
          Stock: {
            symbol: "NIFTY",
            name: "Nifty Option",
            ltp: 125,
            instrumentId: "NFO-26000",
            exchange: "NFO",
            segment: "NFO",
            lot_size: 50,
            strikePrice: 25000,
            optionType: "CE",
            expiry: new Date(expiryIso),
            token: 26000,
          },
        },
      ])
      .mockResolvedValueOnce([])

    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.positions[0]).toMatchObject({
      id: "pos-fo",
      productType: "DELIVERY",
      isIntraday: false,
      instrumentId: "NFO-26000",
      segment: "NFO",
      strikePrice: 25000,
      optionType: "CE",
      expiry: expiryIso,
      token: 26000,
      lotSize: 50,
      identity: {
        stockId: "stock-fo-1",
        instrumentId: "NFO-26000",
        segment: "NFO",
        exchange: "NFO",
        strikePrice: 25000,
        optionType: "CE",
        expiry: expiryIso,
        token: 26000,
      },
      stock: {
        instrumentId: "NFO-26000",
        exchange: "NFO",
        segment: "NFO",
        strikePrice: 25000,
        optionType: "CE",
        expiry: expiryIso,
        token: 26000,
        lotSize: 50,
      },
    })
  })

  it("accepts whitespace-padded userId query scope", async () => {
    const req = new Request("http://localhost/api/trading/positions/list?userId=%20user-1%20")
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      positions: [{ id: "pos-1" }],
    })
  })

  it("uses nextUrl searchParams fallback when request url is malformed", async () => {
    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: { searchParams: new URLSearchParams("userId=user-1") },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      positions: [{ id: "pos-1" }],
    })
  })

  it("uses nextUrl search fallback string when searchParams are unavailable", async () => {
    const req = {
      url: "",
      method: "GET",
      headers: new Headers(),
      nextUrl: { search: "?userId=user-1" },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      positions: [{ id: "pos-1" }],
    })
  })

  it("returns mapped 500 when positions query fails", async () => {
    positionFindManyMock.mockReset()
    positionFindManyMock.mockRejectedValue(new Error("positions lookup failed"))
    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "positions lookup failed",
    })
  })

  it("falls back to db pnl when redis snapshot payload is malformed", async () => {
    isRedisEnabledMock.mockReturnValue(true)
    redisMGetMock
      .mockResolvedValueOnce([
        JSON.stringify({
          updatedAtMs: "not-a-number",
          unrealizedPnL: "100.5",
          dayPnL: "50.25",
          currentPrice: "123.45",
        }),
      ])
      .mockResolvedValueOnce([])

    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      positions: [
        {
          id: "pos-1",
          unrealizedPnL: 10,
          dayPnL: 5,
          currentPrice: 105,
          pnlUpdatedAtMs: null,
        },
      ],
      meta: {
        pnlMaxAgeMs: 15000,
      },
    })
  })

  it("uses redis overlay values and preserves zero-valued stoploss/target", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    isRedisEnabledMock.mockReturnValue(true)
    positionFindManyMock.mockReset()
    positionFindManyMock
      .mockResolvedValueOnce([
        {
          id: "pos-1",
          symbol: "RELIANCE",
          quantity: 2,
          averagePrice: 100,
          unrealizedPnL: 10,
          dayPnL: 5,
          stopLoss: 0,
          target: 0,
          createdAt: new Date("2026-02-15T12:00:00.000Z"),
          closedAt: null,
          Stock: {
            symbol: "RELIANCE",
            name: "Reliance Industries",
            ltp: 105,
            instrumentId: "NSE-2885",
            segment: "NSE",
          },
        },
      ])
      .mockResolvedValueOnce([])
    redisMGetMock
      .mockResolvedValueOnce([
        JSON.stringify({
          updatedAtMs: 1_700_000_000_000,
          unrealizedPnL: "12.25",
          dayPnL: "6.5",
          currentPrice: "0",
        }),
      ])
      .mockResolvedValueOnce([])

    const req = new Request("http://localhost/api/trading/positions/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      positions: [
        {
          id: "pos-1",
          unrealizedPnL: 12.25,
          dayPnL: 6.5,
          pnlUpdatedAtMs: 1_700_000_000_000,
          currentPrice: 105,
          currentValue: 210,
          stopLoss: 0,
          target: 0,
        },
      ],
      meta: {
        pnlMaxAgeMs: 15_000,
      },
    })
  })
})
