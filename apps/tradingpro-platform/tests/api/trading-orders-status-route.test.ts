/**
 * @file tests/api/trading-orders-status-route.test.ts
 * @module tests-api
 * @description Route-level guard and response tests for /api/trading/orders/status GET.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const assertOrderOwnershipMock = jest.fn()
const orderFindUniqueMock = jest.fn()
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
    assertOrderOwnership: (...args: any[]) => assertOrderOwnershipMock(...args),
    assertTradingAccountOwnership: jest.fn(),
    getOwnedPositionContext: jest.fn(),
    resolveTradingErrorResponse: (error: any, fallbackMessage = "Failed to fetch order status", fallbackStatus = 500) => ({
      message: error?.issues?.[0]?.message || error?.message || fallbackMessage,
      status: error instanceof TradingAccessError ? error.statusCode : error?.name === "ZodError" ? 400 : fallbackStatus,
    }),
    TradingAccessError,
  }
})

jest.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...args: any[]) => orderFindUniqueMock(...args),
    },
  },
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

import { GET } from "@/app/api/trading/orders/status/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("GET /api/trading/orders/status", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "EXECUTED",
      symbol: "RELIANCE",
      quantity: 2,
      price: 100,
      averagePrice: 101,
      filledQuantity: 2,
      failureCode: null,
      failureReason: null,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: new Date("2026-02-15T12:00:10.000Z"),
    })
  })

  it("returns 400 when orderId query param is missing", async () => {
    const req = new Request("http://localhost/api/trading/orders/status")
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Order ID required",
    })
  })

  it("returns 400 when orderId query param is blank after trim", async () => {
    const req = new Request("http://localhost/api/trading/orders/status?orderId=%20%20")
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Order ID required",
    })
  })

  it("returns 401 when authentication fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
    })
  })

  it("returns 403 when ownership guard fails", async () => {
    assertOrderOwnershipMock.mockRejectedValue(new TradingAccessError("Forbidden", 403))
    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")

    const res = await GET(req)

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Forbidden",
    })
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns 404 when order disappears after ownership check", async () => {
    orderFindUniqueMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")

    const res = await GET(req)

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Order not found",
    })
  })

  it("returns 404 when ownership guard rejects oversized orderId scope", async () => {
    assertOrderOwnershipMock.mockRejectedValueOnce(new TradingAccessError("Order not found", 404))
    const oversizedOrderId = "o".repeat(200)
    const req = new Request(`http://localhost/api/trading/orders/status?orderId=${oversizedOrderId}`)

    const res = await GET(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Order not found",
    })
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns normalized order status payload for owned order", async () => {
    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(withApiTelemetryMock).toHaveBeenCalled()
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("order-1", "user-1")
    expect(body).toMatchObject({
      success: true,
      orderId: "order-1",
      status: "EXECUTED",
      message: "Order executed successfully",
      symbol: "RELIANCE",
      quantity: 2,
      filledQuantity: 2,
    })
  })

  it("uses nextUrl searchParams fallback when request url is malformed", async () => {
    const req = {
      url: "http://[invalid-host",
      method: "GET",
      headers: new Headers(),
      nextUrl: { searchParams: new URLSearchParams("orderId=order-1") },
    } as unknown as Request

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("order-1", "user-1")
    expect(body).toMatchObject({
      success: true,
      orderId: "order-1",
      status: "EXECUTED",
    })
  })

  it("returns REJECTED-specific status message when order is rejected", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "REJECTED",
      symbol: "RELIANCE",
      quantity: 2,
      price: 100,
      averagePrice: 101,
      filledQuantity: 0,
      failureCode: null,
      failureReason: null,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      status: "REJECTED",
      message: "Order was rejected",
    })
  })

  it("returns failure reason as status message when cancellation metadata is present", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "CANCELLED",
      symbol: "SBIN",
      quantity: 1,
      price: null,
      averagePrice: null,
      filledQuantity: 0,
      failureCode: "EXCHANGE_REJECTED_STALE_QUOTE",
      failureReason: "Exchange rejected: stale quote (>5s). Please retry.",
      createdAt: new Date("2026-02-24T10:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      status: "CANCELLED",
      failureCode: "EXCHANGE_REJECTED_STALE_QUOTE",
      failureReason: "Exchange rejected: stale quote (>5s). Please retry.",
      message: "Exchange rejected: stale quote (>5s). Please retry.",
    })
  })

  it("returns PARTIALLY_FILLED-specific message when order is partially filled", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "PARTIALLY_FILLED",
      symbol: "RELIANCE",
      quantity: 2,
      price: 100,
      averagePrice: 101,
      filledQuantity: 1,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      status: "PARTIALLY_FILLED",
      message: "Order partially filled",
    })
  })

  it("returns EXPIRED-specific status message when order is expired", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "EXPIRED",
      symbol: "RELIANCE",
      quantity: 2,
      price: 100,
      averagePrice: 101,
      filledQuantity: 0,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      status: "EXPIRED",
      message: "Order expired before execution",
    })
  })

  it("returns status-aware fallback message for unknown order statuses", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "HALTED",
      symbol: "RELIANCE",
      quantity: 2,
      price: 100,
      averagePrice: 101,
      filledQuantity: 0,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      status: "HALTED",
      message: "Order status: HALTED",
    })
  })

  it("preserves zero-valued numeric status fields", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "PENDING",
      symbol: "RELIANCE",
      quantity: 2,
      price: 0,
      averagePrice: 0,
      filledQuantity: 0,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      price: 0,
      averagePrice: 0,
      filledQuantity: 0,
    })
  })

  it("returns null numeric fields when price payload is malformed", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "PENDING",
      symbol: "RELIANCE",
      quantity: 2,
      price: Symbol("bad-price"),
      averagePrice: "NaN",
      filledQuantity: 0,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      price: null,
      averagePrice: null,
    })
  })

  it("keeps null numeric status fields as null", async () => {
    orderFindUniqueMock.mockResolvedValue({
      id: "order-1",
      status: "PENDING",
      symbol: "RELIANCE",
      quantity: 2,
      price: null,
      averagePrice: null,
      filledQuantity: 0,
      createdAt: new Date("2026-02-15T12:00:00.000Z"),
      executedAt: null,
    })

    const req = new Request("http://localhost/api/trading/orders/status?orderId=order-1")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      price: null,
      averagePrice: null,
    })
  })
})
