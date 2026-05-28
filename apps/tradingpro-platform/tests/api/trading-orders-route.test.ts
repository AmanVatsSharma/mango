/**
 * @file tests/api/trading-orders-route.test.ts
 * @module tests-api
 * @description Route-level ownership guard tests for /api/trading/orders POST.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const assertTradingAccountOwnershipMock = jest.fn()
const placeOrderMock = jest.fn()
const withApiTelemetryMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const evaluateTradingPoliciesForContextMock = jest.fn()

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
      if (normalizedRequested.length > 128) {
        throw new TradingAccessError("Invalid user scope", 400)
      }
      if (normalizedRequested && normalizedRequested !== authenticatedUserId) {
        throw new TradingAccessError("Forbidden", 403)
      }
    },
    assertTradingAccountOwnership: (...args: any[]) => assertTradingAccountOwnershipMock(...args),
    assertOrderOwnership: jest.fn(),
    getOwnedPositionContext: jest.fn(),
    resolveTradingErrorResponse: (error: any) => {
      const message = error?.issues?.[0]?.message || error?.message || "Invalid request"
      const isJsonSyntaxError =
        error?.name === "SyntaxError" &&
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("json")

      return {
        message,
        status: error instanceof TradingAccessError ? error.statusCode : error?.name === "ZodError" || isJsonSyntaxError ? 400 : 500,
      }
    },
    TradingAccessError,
  }
})

jest.mock("@/lib/services/order/OrderExecutionService", () => ({
  createOrderExecutionService: jest.fn(() => ({
    placeOrder: (...args: any[]) => placeOrderMock(...args),
    modifyOrder: jest.fn(),
    cancelOrder: jest.fn(),
  })),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  createTradingLogger: jest.fn(() => ({ log: jest.fn() })),
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
  },
}))

jest.mock("@/lib/services/risk/dynamic-trading-policies", () => ({
  evaluateTradingPoliciesForContext: (...args: any[]) => evaluateTradingPoliciesForContextMock(...args),
}))

jest.mock("@/lib/server/validation", () => ({
  placeOrderSchema: { parse: jest.fn((v) => v) },
  modifyOrderSchema: { parse: jest.fn((v) => v) },
  cancelOrderSchema: { parse: jest.fn((v) => v) },
}))

jest.mock("@/lib/services/security/RateLimiter", () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 10, resetAt: new Date(), retryAfter: 60 })),
  getRateLimitKey: jest.fn(() => "orders-user-1"),
  RateLimitPresets: { TRADING: { maxRequests: 20 } },
}))

jest.mock("@/lib/services/monitoring/PerformanceMonitor", () => ({
  trackOperation: jest.fn(async (_name: string, fn: any) => fn()),
}))

jest.mock("@/lib/server/market-timing", () => ({
  getSegmentTradingSession: jest.fn(async () => ({ session: "open", reason: null })),
}))

jest.mock("@/lib/server/background-tasks", () => ({
  enqueueBackgroundTask: jest.fn(),
}))

jest.mock("@/lib/services/order/OrderExecutionWorker", () => ({
  orderExecutionWorker: { processOrderById: jest.fn() },
}))

import { POST } from "@/app/api/trading/orders/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("POST /api/trading/orders", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    assertTradingAccountOwnershipMock.mockResolvedValue(undefined)
    placeOrderMock.mockResolvedValue({ executionScheduled: false, orderId: "ord-1" })
    tradingAccountFindUniqueMock.mockResolvedValue({
      balance: 100000,
      availableMargin: 80000,
      usedMargin: 20000,
    })
    evaluateTradingPoliciesForContextMock.mockResolvedValue({
      blocked: false,
      message: null,
      retryAfterSeconds: 0,
      policy: null,
    })
  })

  it("returns 403 when body userId mismatches authenticated session user", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-2" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
  })

  it("enforces user scope before numeric payload validation in POST", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user-2",
        tradingAccountId: "acct-1",
        quantity: "Infinity",
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 when body userId has invalid type", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: 123 }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
  })

  it("returns 400 when body userId exceeds max scope length", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u".repeat(200) }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
  })

  it("returns 400 when request body has invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token } in JSON at position 9")
      },
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: "Unexpected token } in JSON at position 9",
    })
  })

  it("returns 400 when POST payload is non-object", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["acct-1"]),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request payload" })
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("returns 401 when authentication guard fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))

    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
  })

  it("returns 404 when trading account ownership validation fails", async () => {
    assertTradingAccountOwnershipMock.mockRejectedValue(new TradingAccessError("Trading account not found", 404))
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user-1",
        tradingAccountId: "acct-missing",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "Trading account not found" })
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("returns 403 when dynamic order policy blocks placement", async () => {
    evaluateTradingPoliciesForContextMock.mockResolvedValue({
      blocked: true,
      message: "Order blocked by policy.",
      retryAfterSeconds: 0,
      policy: {
        id: "policy-1",
        name: "Block Small Margin",
        context: "ORDER_PLACE",
        source: "dynamic",
      },
    })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: "Order blocked by policy.",
      policy: expect.objectContaining({
        id: "policy-1",
        context: "ORDER_PLACE",
      }),
    })
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("passes LTP offset metrics and side into order policy snapshot", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        quantity: 2,
        price: 101,
        ltp: 100,
        orderType: "LIMIT",
        orderSide: "BUY",
        segment: "NFO",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(evaluateTradingPoliciesForContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "ORDER_PLACE",
        snapshot: expect.objectContaining({
          order: expect.objectContaining({
            side: "BUY",
            orderType: "LIMIT",
            ltp: 100,
            price: 101,
            priceOffsetFromLtp: 1,
            priceOffsetFromLtpPercent: 1,
            segment: "NFO",
          }),
        }),
      }),
    )
  })

  it("uses authenticated user id in placeOrder payload", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ orderId: "ord-1" })
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(placeOrderMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }))
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_orders_post" },
      expect.any(Function),
    )
  })

  it("trims whitespace-padded tradingAccountId before ownership checks", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: " acct-1 ",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ orderId: "ord-1" })
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(placeOrderMock).toHaveBeenCalledWith(expect.objectContaining({ tradingAccountId: "acct-1" }))
  })

  it("accepts whitespace-padded userId in body scope", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: " user-1 ",
        tradingAccountId: "acct-1",
        quantity: 1,
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ orderId: "ord-1" })
    expect(placeOrderMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }))
  })

  it("normalizes numeric-string order payload fields in POST", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        quantity: "2",
        price: "150.5",
        token: "26000",
        lotSize: "15",
        orderType: "MARKET",
        orderSide: "BUY",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ orderId: "ord-1" })
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 2,
        price: 150.5,
        token: 26000,
        lotSize: 15,
      }),
    )
  })

  it("normalizes order type and segment fields to uppercase in POST", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        quantity: 1,
        orderType: " market ",
        orderSide: " buy ",
        productType: " intraday ",
        segment: " nse_eq ",
        exchange: " nse ",
        optionType: " ce ",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ orderId: "ord-1" })
    expect(placeOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: "MARKET",
        orderSide: "BUY",
        productType: "INTRADAY",
        segment: "NSE_EQ",
        exchange: "NSE",
        optionType: "CE",
      }),
    )
  })

  it("rejects invalid numeric payload fields in POST", async () => {
    const invalidPayloads = [
      { quantity: "Infinity", orderType: "MARKET", orderSide: "BUY" },
      { quantity: "2.5", orderType: "MARKET", orderSide: "BUY" },
      { quantity: 2, token: "26000.1", orderType: "MARKET", orderSide: "BUY" },
      { quantity: 2, lotSize: "Infinity", orderType: "MARKET", orderSide: "BUY" },
    ]

    for (const payload of invalidPayloads) {
      const req = new Request("http://localhost/api/trading/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tradingAccountId: "acct-1",
          ...payload,
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: "Invalid order payload" })
    }
    expect(placeOrderMock).not.toHaveBeenCalled()
  })
})

