/**
 * @file tests/api/trading-positions-route.test.ts
 * @module tests-api
 * @description Route-level ownership and validation tests for /api/trading/positions.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const getOwnedPositionContextMock = jest.fn()
const assertTradingAccountOwnershipMock = jest.fn()
const withApiTelemetryMock = jest.fn()
const positionFindFirstMock = jest.fn()
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
    getOwnedPositionContext: (...args: any[]) => getOwnedPositionContextMock(...args),
    assertTradingAccountOwnership: (...args: any[]) => assertTradingAccountOwnershipMock(...args),
    resolveTradingErrorResponse: (error: any) => {
      const message = error?.issues?.[0]?.message || error?.message || "Unknown error"
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

const closePositionMock = jest.fn()
const updatePositionMock = jest.fn()
const getMarketDisplayPositionPricingPoliciesMock = jest.fn()
const waitForFreshQuoteMock = jest.fn()

/** Resolved server LTP returned by waitForFreshQuote when tests do not override it. */
const DEFAULT_SERVER_EXIT_LTP = 2500.25

jest.mock("@/lib/server/market-display-exit-policy", () => ({
  getMarketDisplayPositionPricingPolicies: (...args: any[]) => getMarketDisplayPositionPricingPoliciesMock(...args),
}))

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => ({
    waitForFreshQuote: (...args: any[]) => waitForFreshQuoteMock(...args),
    getHealth: () => ({ isConnected: true }),
  }),
}))

jest.mock("@/lib/services/position/PositionManagementService", () => ({
  createPositionManagementService: jest.fn(() => ({
    closePosition: (...args: any[]) => closePositionMock(...args),
    updatePosition: (...args: any[]) => updatePositionMock(...args),
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
    position: {
      findFirst: (...args: any[]) => positionFindFirstMock(...args),
    },
  },
}))

jest.mock("@/lib/services/risk/dynamic-trading-policies", () => ({
  evaluateTradingPoliciesForContext: (...args: any[]) => evaluateTradingPoliciesForContextMock(...args),
}))

import { PATCH, POST } from "@/app/api/trading/positions/route"
import { TradingAccessError } from "@/lib/server/trading-access"

function defaultPostClosePositionSnapshot() {
  return {
    id: "pos-1",
    createdAt: new Date(),
    quantity: 2,
    unrealizedPnL: 10,
    productType: "MIS",
    isIntraday: true,
    Stock: {
      segment: "NSE",
      lot_size: 1,
      token: 26000,
      instrumentId: "NSE_EQ-26000",
      exchange: "NSE",
    },
    orders: [{ productType: "MIS" }],
    tradingAccount: { balance: 100_000, availableMargin: 70_000, usedMargin: 30_000 },
  }
}

describe("/api/trading/positions route guards", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    getOwnedPositionContextMock.mockResolvedValue({
      positionId: "pos-1",
      tradingAccountId: "acct-1",
    })
    assertTradingAccountOwnershipMock.mockResolvedValue(undefined)
    closePositionMock.mockResolvedValue({ success: true, positionId: "pos-1" })
    updatePositionMock.mockResolvedValue({ success: true, positionId: "pos-1" })
    positionFindFirstMock.mockResolvedValue(defaultPostClosePositionSnapshot())
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
    waitForFreshQuoteMock.mockResolvedValue({ last_trade_price: DEFAULT_SERVER_EXIT_LTP })
    evaluateTradingPoliciesForContextMock.mockResolvedValue({
      blocked: false,
      message: null,
      retryAfterSeconds: 0,
      policy: null,
    })
  })

  it("returns 400 when POST body misses positionId", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Position ID required" })
  })

  it("returns 400 when POST payload is non-object or blank positionId", async () => {
    const nonObjectReq = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["pos-1"]),
    })
    const nonObjectRes = await POST(nonObjectReq)
    expect(nonObjectRes.status).toBe(400)
    await expect(nonObjectRes.json()).resolves.toMatchObject({ error: "Invalid request payload" })

    const blankIdReq = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionId: "   " }),
    })
    const blankIdRes = await POST(blankIdReq)
    expect(blankIdRes.status).toBe(400)
    await expect(blankIdRes.json()).resolves.toMatchObject({ error: "Position ID required" })
  })

  it("returns 403 when POST userId mismatches authenticated scope", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionId: "pos-1", userId: "user-2" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("enforces POST user scope before numeric exitPrice validation", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionId: "pos-1", userId: "user-2", exitPrice: "Infinity" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when POST has mismatched tradingAccountId", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionId: "pos-1", tradingAccountId: "acct-2" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Position/account mismatch" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns 400 when PATCH account mismatches owned position context", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-foreign",
        updates: { stopLoss: 100 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Position/account mismatch" })
    expect(updatePositionMock).not.toHaveBeenCalled()
  })

  it("returns 400 when PATCH payload misses required fields", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-1",
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Missing required fields" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when PATCH userId has invalid type", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: 123,
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: 95 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("enforces PATCH user scope before numeric update validation", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user-2",
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: "Infinity" },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when PATCH userId exceeds max scope length", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u".repeat(200),
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: 95 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when POST userId exceeds max scope length", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u".repeat(200),
        positionId: "pos-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when POST body has invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token } in JSON at position 15")
      },
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Unexpected token } in JSON at position 15" })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("returns 400 when PATCH body has invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token } in JSON at position 24")
      },
    } as unknown as Request

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Unexpected token } in JSON at position 24" })
    expect(updatePositionMock).not.toHaveBeenCalled()
  })

  it("returns 401 when authentication guard fails for PATCH", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))

    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: 100 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
  })

  it("returns 401 when authentication guard fails for POST", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
  })

  it("returns 404 when owned position context lookup fails", async () => {
    getOwnedPositionContextMock.mockRejectedValue(new TradingAccessError("Position not found", 404))

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-missing",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "Position not found" })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("uses owned account context to close position when accountId is omitted", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        exitPrice: 123.45,
        ltpAgeMs: 3000,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acct-1", 123.45, undefined)
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_positions_post" },
      expect.any(Function),
    )
  })

  it("trims whitespace-padded ids in POST before ownership checks", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: " pos-1 ",
        tradingAccountId: " acct-1 ",
        exitPrice: 123.45,
        ltpAgeMs: 3000,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(getOwnedPositionContextMock).toHaveBeenCalledWith("pos-1", "user-1")
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acct-1", 123.45, undefined)
  })

  it("normalizes numeric-string exitPrice in POST payload", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        exitPrice: "123.45",
        ltpAgeMs: 3000,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acct-1", 123.45, undefined)
  })

  it("returns 423 when dynamic close policy blocks manual close", async () => {
    positionFindFirstMock.mockResolvedValue({
      id: "pos-1",
      createdAt: new Date(),
      quantity: 2,
      unrealizedPnL: -120,
      Stock: { segment: "NSE" },
      orders: [{ productType: "MIS" }],
      tradingAccount: {
        balance: 120000,
        availableMargin: 80000,
        usedMargin: 40000,
      },
    })
    evaluateTradingPoliciesForContextMock.mockResolvedValue({
      blocked: true,
      message: "Policy active: close after hold window.",
      retryAfterSeconds: 180,
      policy: {
        id: "policy-1",
        name: "Negative Hold Delay",
        context: "POSITION_CLOSE",
        source: "dynamic",
      },
    })

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(423)
    await expect(res.json()).resolves.toMatchObject({
      error: "Policy active: close after hold window.",
      policy: expect.objectContaining({
        id: "policy-1",
        context: "POSITION_CLOSE",
        retryAfterSeconds: 180,
      }),
    })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("rejects invalid POST exitPrice payload values", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        exitPrice: "Infinity",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid exit price" })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("supports partial close by closeQuantity", async () => {
    positionFindFirstMock.mockResolvedValue({
      id: "pos-1",
      createdAt: new Date(),
      quantity: 100,
      unrealizedPnL: -20,
      Stock: {
        segment: "NSE",
        lot_size: 1,
        token: 26000,
        instrumentId: "NSE_EQ-26000",
        exchange: "NSE",
      },
      orders: [{ productType: "MIS" }],
      tradingAccount: { balance: 100000, availableMargin: 70000, usedMargin: 30000 },
    })

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        closeQuantity: 40,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acct-1", DEFAULT_SERVER_EXIT_LTP, 40)
  })

  it("supports partial close by closeLots for lot-based instruments", async () => {
    positionFindFirstMock.mockResolvedValue({
      id: "pos-1",
      createdAt: new Date(),
      quantity: 150,
      unrealizedPnL: 10,
      Stock: {
        segment: "NFO",
        lot_size: 25,
        token: 42,
        instrumentId: "NFO|42",
        exchange: "NFO",
      },
      orders: [{ productType: "MIS" }],
      tradingAccount: { balance: 100000, availableMargin: 70000, usedMargin: 30000 },
    })

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        closeLots: 2,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acct-1", DEFAULT_SERVER_EXIT_LTP, 50)
  })

  it("rejects partial close quantity not aligned with lot size", async () => {
    positionFindFirstMock.mockResolvedValue({
      id: "pos-1",
      createdAt: new Date(),
      quantity: 100,
      unrealizedPnL: 10,
      Stock: {
        segment: "NFO",
        lot_size: 25,
        token: 42,
        instrumentId: "NFO|42",
        exchange: "NFO",
      },
      orders: [{ productType: "MIS" }],
      tradingAccount: { balance: 100000, availableMargin: 70000, usedMargin: 30000 },
    })

    const req = new Request("http://localhost/api/trading/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        closeQuantity: 30,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("lot multiples"),
    })
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("updates position for owned account in PATCH happy path", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: 95, target: 130 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(getOwnedPositionContextMock).toHaveBeenCalledWith("pos-1", "user-1")
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(updatePositionMock).toHaveBeenCalledWith("pos-1", { stopLoss: 95, target: 130 })
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_positions_patch" },
      expect.any(Function),
    )
  })

  it("uses owned account context in PATCH when tradingAccountId is omitted", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        updates: { stopLoss: 97.5 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(getOwnedPositionContextMock).toHaveBeenCalledWith("pos-1", "user-1")
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(updatePositionMock).toHaveBeenCalledWith("pos-1", { stopLoss: 97.5, target: undefined })
  })

  it("returns 400 when PATCH tradingAccountId has invalid type", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: 123,
        updates: { stopLoss: 95 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid tradingAccountId" })
    expect(getOwnedPositionContextMock).not.toHaveBeenCalled()
    expect(updatePositionMock).not.toHaveBeenCalled()
  })

  it("trims whitespace-padded ids in PATCH before ownership checks", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: " pos-1 ",
        tradingAccountId: " acct-1 ",
        updates: { stopLoss: 98 },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(getOwnedPositionContextMock).toHaveBeenCalledWith("pos-1", "user-1")
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(updatePositionMock).toHaveBeenCalledWith("pos-1", { stopLoss: 98, target: undefined })
  })

  it("normalizes numeric-string PATCH updates before service call", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { stopLoss: "98.5", target: "130" },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, positionId: "pos-1" })
    expect(updatePositionMock).toHaveBeenCalledWith("pos-1", { stopLoss: 98.5, target: 130 })
  })

  it("rejects invalid PATCH update values and non-object updates payload", async () => {
    const invalidPatchRequests = [
      {
        payload: {
          positionId: "pos-1",
          tradingAccountId: "acct-1",
          updates: { stopLoss: "Infinity" },
        },
        expectedError: "Invalid position updates",
      },
      {
        payload: {
          positionId: "pos-1",
          tradingAccountId: "acct-1",
          updates: [],
        },
        expectedError: "Missing required fields",
      },
    ]

    for (const testCase of invalidPatchRequests) {
      const req = new Request("http://localhost/api/trading/positions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(testCase.payload),
      })

      const res = await PATCH(req)
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: testCase.expectedError })
    }
    expect(updatePositionMock).not.toHaveBeenCalled()
  })

  it("rejects PATCH updates payload when no supported fields are provided", async () => {
    const req = new Request("http://localhost/api/trading/positions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        positionId: "pos-1",
        tradingAccountId: "acct-1",
        updates: { note: "noop" },
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "No position updates provided" })
    expect(updatePositionMock).not.toHaveBeenCalled()
  })
})

