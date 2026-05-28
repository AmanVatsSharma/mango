/**
 * @file tests/api/trading-orders-list-route.test.ts
 * @module tests-api
 * @description Route-level auth/ownership/error mapping tests for /api/trading/orders/list GET.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const orderFindManyMock = jest.fn()
const withApiTelemetryMock = jest.fn()

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
    resolveTradingErrorResponse: (error: any, fallbackMessage = "Failed to fetch orders", fallbackStatus = 500) => ({
      message: error?.issues?.[0]?.message || error?.message || fallbackMessage,
      status: error instanceof TradingAccessError ? error.statusCode : error?.name === "ZodError" ? 400 : fallbackStatus,
    }),
    TradingAccessError,
  }
})

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    order: {
      findMany: (...args: any[]) => orderFindManyMock(...args),
    },
  },
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

import { GET } from "@/app/api/trading/orders/list/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("GET /api/trading/orders/list", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    tradingAccountFindUniqueMock.mockResolvedValue({ id: "acct-1", userId: "user-1" })
    orderFindManyMock.mockResolvedValue([
      {
        id: "ord-1",
        symbol: "RELIANCE",
        quantity: 10,
        orderType: "MARKET",
        orderSide: "BUY",
        price: 100.5,
        averagePrice: 101.25,
        filledQuantity: 10,
        productType: "MIS",
        status: "EXECUTED",
        failureCode: null,
        failureReason: null,
        createdAt: new Date("2026-02-15T12:00:00.000Z"),
        executedAt: new Date("2026-02-15T12:00:10.000Z"),
        Stock: {
          symbol: "RELIANCE",
          name: "Reliance Industries",
          ltp: 101.9,
          instrumentId: "NSE-2885",
          exchange: "NSE",
          segment: "EQ",
          strikePrice: null,
          optionType: null,
          expiry: null,
          lot_size: null,
        },
      },
    ])
  })

  it("returns 401 when authentication guard fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
    })
  })

  it("returns 403 when requested userId mismatches authenticated user", async () => {
    const req = new Request("http://localhost/api/trading/orders/list?userId=user-2")

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
    const req = new Request(`http://localhost/api/trading/orders/list?userId=${tooLongUserId}`)

    const res = await GET(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid user scope",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns empty list when no trading account exists", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      orders: [],
    })
  })

  it("returns mapped order list for owned trading account", async () => {
    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(tradingAccountFindUniqueMock).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    expect(orderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tradingAccountId: "acct-1" },
      }),
    )
    expect(body).toMatchObject({
      success: true,
      orders: [
        {
          id: "ord-1",
          symbol: "RELIANCE",
          instrumentLabel: expect.any(String),
          quantity: 10,
          status: "EXECUTED",
          price: 100.5,
          averagePrice: 101.25,
          failureCode: null,
          failureReason: null,
          stock: expect.objectContaining({
            symbol: "RELIANCE",
            instrumentId: "NSE-2885",
            exchange: "NSE",
          }),
        },
      ],
    })
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_orders_list" },
      expect.any(Function),
    )
  })

  it("accepts whitespace-padded userId query scope", async () => {
    const req = new Request("http://localhost/api/trading/orders/list?userId=%20user-1%20")
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      orders: [{ id: "ord-1" }],
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
      orders: [{ id: "ord-1" }],
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
      orders: [{ id: "ord-1" }],
    })
  })

  it("returns 500 mapped error when downstream query fails", async () => {
    orderFindManyMock.mockRejectedValue(new Error("db unavailable"))
    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "db unavailable",
    })
  })

  it("preserves zero-valued price fields in mapped payload", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: "ord-1",
        symbol: "RELIANCE",
        quantity: 10,
        orderType: "MARKET",
        orderSide: "BUY",
        price: 0,
        averagePrice: 0,
        filledQuantity: 10,
        productType: "MIS",
        status: "EXECUTED",
        createdAt: new Date("2026-02-15T12:00:00.000Z"),
        executedAt: new Date("2026-02-15T12:00:10.000Z"),
        Stock: null,
      },
    ])

    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      orders: [
        {
          id: "ord-1",
          price: 0,
          averagePrice: 0,
        },
      ],
    })
  })

  it("falls back to null for malformed numeric price fields", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: "ord-1",
        symbol: "RELIANCE",
        quantity: 10,
        orderType: "MARKET",
        orderSide: "BUY",
        price: Symbol("bad-price"),
        averagePrice: "NaN",
        filledQuantity: 10,
        productType: "MIS",
        status: "EXECUTED",
        createdAt: new Date("2026-02-15T12:00:00.000Z"),
        executedAt: null,
        Stock: null,
      },
    ])

    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      orders: [
        {
          id: "ord-1",
          price: null,
          averagePrice: null,
        },
      ],
    })
  })

  it("maps cancellation reason fields when present", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: "ord-cancelled-1",
        symbol: "SBIN",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
        price: null,
        averagePrice: null,
        filledQuantity: 0,
        productType: "MIS",
        status: "CANCELLED",
        failureCode: "EXCHANGE_REJECTED_STALE_QUOTE",
        failureReason: "Exchange rejected: stale quote (>5s). Please retry.",
        createdAt: new Date("2026-02-24T10:00:00.000Z"),
        executedAt: null,
        Stock: null,
      },
    ])

    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      orders: [
        {
          id: "ord-cancelled-1",
          status: "CANCELLED",
          failureCode: "EXCHANGE_REJECTED_STALE_QUOTE",
          failureReason: "Exchange rejected: stale quote (>5s). Please retry.",
        },
      ],
    })
  })

  it("keeps null numeric price fields as null", async () => {
    orderFindManyMock.mockResolvedValue([
      {
        id: "ord-1",
        symbol: "RELIANCE",
        quantity: 10,
        orderType: "MARKET",
        orderSide: "BUY",
        price: null,
        averagePrice: null,
        filledQuantity: 10,
        productType: "MIS",
        status: "EXECUTED",
        createdAt: new Date("2026-02-15T12:00:00.000Z"),
        executedAt: null,
        Stock: null,
      },
    ])

    const req = new Request("http://localhost/api/trading/orders/list?userId=user-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      orders: [
        {
          id: "ord-1",
          price: null,
          averagePrice: null,
        },
      ],
    })
  })
})
