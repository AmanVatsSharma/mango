/**
 * @file tests/api/trading-orders-mutations-route.test.ts
 * @module tests-api
 * @description Route-level ownership guard tests for /api/trading/orders PATCH + DELETE.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const assertOrderOwnershipMock = jest.fn()
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
    assertOrderOwnership: (...args: any[]) => assertOrderOwnershipMock(...args),
    assertTradingAccountOwnership: jest.fn(),
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

const modifyOrderMock = jest.fn()
const cancelOrderMock = jest.fn()

jest.mock("@/lib/services/order/OrderExecutionService", () => ({
  createOrderExecutionService: jest.fn(() => ({
    placeOrder: jest.fn(),
    modifyOrder: (...args: any[]) => modifyOrderMock(...args),
    cancelOrder: (...args: any[]) => cancelOrderMock(...args),
  })),
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

import { DELETE, PATCH } from "@/app/api/trading/orders/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("/api/trading/orders PATCH + DELETE guards", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
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

  it("returns 403 from PATCH when order ownership check fails", async () => {
    assertOrderOwnershipMock.mockRejectedValue(new TradingAccessError("Forbidden", 403))
    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: 100 }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 403 from PATCH when user scope mismatches", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: 100, userId: "user-2" }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("enforces PATCH user scope before numeric update validation", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: "Infinity", userId: "user-2" }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from PATCH when user scope exceeds max length", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: 100, userId: "u".repeat(200) }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 404 from DELETE when order is not found for user", async () => {
    assertOrderOwnershipMock.mockRejectedValue(new TradingAccessError("Order not found", 404))
    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-missing" }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "Order not found" })
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from DELETE when user scope type is invalid", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", userId: 123 }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from DELETE when user scope exceeds max length", async () => {
    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", userId: "u".repeat(200) }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("returns 401 from PATCH when authentication guard fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: 100 }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 401 from DELETE when authentication guard fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1" }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from PATCH when body contains invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token ] in JSON at position 22")
      },
    } as unknown as Request

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Unexpected token ] in JSON at position 22" })
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from PATCH when payload is non-object or no update fields provided", async () => {
    const nonObjectReq = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["ord-1"]),
    })
    const nonObjectRes = await PATCH(nonObjectReq)
    expect(nonObjectRes.status).toBe(400)
    await expect(nonObjectRes.json()).resolves.toMatchObject({ error: "Invalid request payload" })

    const noUpdatesReq = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1" }),
    })
    const noUpdatesRes = await PATCH(noUpdatesReq)
    expect(noUpdatesRes.status).toBe(400)
    await expect(noUpdatesRes.json()).resolves.toMatchObject({ error: "Provide price or quantity" })
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from DELETE when body contains invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token ] in JSON at position 19")
      },
    } as unknown as Request

    const res = await DELETE(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Unexpected token ] in JSON at position 19" })
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("returns 400 from DELETE when payload is non-object or orderId is blank", async () => {
    const nonObjectReq = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["ord-1"]),
    })
    const nonObjectRes = await DELETE(nonObjectReq)
    expect(nonObjectRes.status).toBe(400)
    await expect(nonObjectRes.json()).resolves.toMatchObject({ error: "Invalid request payload" })

    const blankOrderReq = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "   " }),
    })
    const blankOrderRes = await DELETE(blankOrderReq)
    expect(blankOrderRes.status).toBe(400)
    await expect(blankOrderRes.json()).resolves.toMatchObject({ error: "Order ID required" })
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })

  it("allows PATCH for owned order and forwards updates", async () => {
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    modifyOrderMock.mockResolvedValue({ success: true, orderId: "ord-1" })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: 120, quantity: 3 }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, orderId: "ord-1" })
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("ord-1", "user-1")
    expect(modifyOrderMock).toHaveBeenCalledWith("ord-1", { price: 120, quantity: 3 })
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_orders_patch" },
      expect.any(Function),
    )
  })

  it("trims whitespace-padded orderId in PATCH before ownership checks", async () => {
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    modifyOrderMock.mockResolvedValue({ success: true, orderId: "ord-1" })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: " ord-1 ", price: 120 }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, orderId: "ord-1" })
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("ord-1", "user-1")
    expect(modifyOrderMock).toHaveBeenCalledWith("ord-1", { price: 120, quantity: undefined })
  })

  it("normalizes numeric-string PATCH price and quantity before service call", async () => {
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    modifyOrderMock.mockResolvedValue({ success: true, orderId: "ord-1" })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1", price: "120.5", quantity: "3" }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, orderId: "ord-1" })
    expect(modifyOrderMock).toHaveBeenCalledWith("ord-1", { price: 120.5, quantity: 3 })
  })

  it("rejects invalid PATCH numeric update payloads", async () => {
    const invalidPayloads = [
      { orderId: "ord-1", price: "Infinity" },
      { orderId: "ord-1", quantity: "2.5" },
      { orderId: "ord-1", quantity: 0 },
    ]

    for (const payload of invalidPayloads) {
      const req = new Request("http://localhost/api/trading/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      const res = await PATCH(req)
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: "Invalid order updates" })
    }
    expect(assertOrderOwnershipMock).not.toHaveBeenCalled()
    expect(modifyOrderMock).not.toHaveBeenCalled()
  })

  it("allows DELETE for owned order", async () => {
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    cancelOrderMock.mockResolvedValue({ success: true, orderId: "ord-1" })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1" }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, orderId: "ord-1" })
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("ord-1", "user-1")
    expect(cancelOrderMock).toHaveBeenCalledWith("ord-1")
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_orders_delete" },
      expect.any(Function),
    )
  })

  it("trims whitespace-padded orderId in DELETE before ownership checks", async () => {
    assertOrderOwnershipMock.mockResolvedValue(undefined)
    cancelOrderMock.mockResolvedValue({ success: true, orderId: "ord-1" })

    const req = new Request("http://localhost/api/trading/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: " ord-1 " }),
    })

    const res = await DELETE(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, orderId: "ord-1" })
    expect(assertOrderOwnershipMock).toHaveBeenCalledWith("ord-1", "user-1")
    expect(cancelOrderMock).toHaveBeenCalledWith("ord-1")
  })
})

