/**
 * @file tests/api/trading-funds-route.test.ts
 * @module tests-api
 * @description Route-level ownership guard tests for /api/trading/funds POST.
 * @author StockTrade
 * @created 2026-02-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const assertTradingAccountOwnershipMock = jest.fn()
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

const fundServiceMock = {
  blockMargin: jest.fn(),
  releaseMargin: jest.fn(),
  credit: jest.fn(),
  debit: jest.fn(),
}

jest.mock("@/lib/services/funds/FundManagementService", () => ({
  createFundManagementService: jest.fn(() => fundServiceMock),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  createTradingLogger: jest.fn(() => ({ log: jest.fn() })),
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

import { POST } from "@/app/api/trading/funds/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("POST /api/trading/funds", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    assertTradingAccountOwnershipMock.mockResolvedValue(undefined)
    fundServiceMock.credit.mockResolvedValue({ success: true, transactionId: "tx-1" })
  })

  it("returns 403 when request userId mismatches authenticated user", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 100,
        type: "CREDIT",
        userId: "user-2",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("enforces user scope before payload validation when userId mismatches", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: "Infinity",
        type: "CREDIT",
        userId: "user-2",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: "Forbidden" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns 400 when request userId type is invalid", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 100,
        type: "CREDIT",
        userId: 123,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns 400 when request userId exceeds max scope length", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 100,
        type: "CREDIT",
        userId: "u".repeat(200),
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid user scope" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns 400 when request body has invalid JSON", async () => {
    const req = {
      json: async () => {
        throw new SyntaxError("Unexpected token } in JSON at position 11")
      },
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Unexpected token } in JSON at position 11" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns 400 when funds payload is non-object", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["acct-1", 100]),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request payload" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("returns ownership error status from access guard", async () => {
    assertTradingAccountOwnershipMock.mockRejectedValue(new TradingAccessError("Trading account not found", 404))

    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-missing",
        amount: 100,
        type: "CREDIT",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: "Trading account not found" })
  })

  it("returns 401 when authentication guard fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))

    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 100,
        type: "CREDIT",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
  })

  it("returns 400 when required payload fields are missing", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        type: "CREDIT",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Missing required fields" })
    expect(assertTradingAccountOwnershipMock).not.toHaveBeenCalled()
  })

  it("executes CREDIT operation for owned account", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 250,
        type: "CREDIT",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-1" })
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(fundServiceMock.credit).toHaveBeenCalledWith("acct-1", 250, "Credit")
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_funds_post" },
      expect.any(Function),
    )
  })

  it("normalizes lowercase type and padded account id", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: " acct-1 ",
        amount: 250,
        type: " credit ",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-1" })
    expect(assertTradingAccountOwnershipMock).toHaveBeenCalledWith("acct-1", "user-1")
    expect(fundServiceMock.credit).toHaveBeenCalledWith("acct-1", 250, "Credit")
  })

  it("accepts operation-type aliases and maps to canonical operations", async () => {
    fundServiceMock.blockMargin.mockResolvedValue({ success: true, transactionId: "tx-block" })

    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 100,
        type: "margin-block",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-block" })
    expect(fundServiceMock.blockMargin).toHaveBeenCalledWith("acct-1", 100, "Margin blocked for order")
  })

  it("accepts numeric-string amount payloads via strict finite parsing", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: "250",
        type: "CREDIT",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-1" })
    expect(fundServiceMock.credit).toHaveBeenCalledWith("acct-1", 250, "Credit")
  })

  it("rejects non-finite and non-positive amount payloads", async () => {
    const invalidPayloads = [
      { amount: "Infinity", expectedStatus: 400 },
      { amount: 0, expectedStatus: 400 },
      { amount: -10, expectedStatus: 400 },
    ]

    for (const payload of invalidPayloads) {
      const req = new Request("http://localhost/api/trading/funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tradingAccountId: "acct-1",
          amount: payload.amount,
          type: "CREDIT",
          userId: "user-1",
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(payload.expectedStatus)
      await expect(res.json()).resolves.toMatchObject({ error: "Missing required fields" })
    }
    expect(fundServiceMock.credit).not.toHaveBeenCalled()
  })

  it("accepts whitespace-padded userId in funds payload scope", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 250,
        type: "CREDIT",
        userId: " user-1 ",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-1" })
  })

  it("normalizes and truncates description payload before service invocation", async () => {
    const longDescription = `  Margin    adjustment    ${"x".repeat(400)}  `
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 250,
        type: "CREDIT",
        userId: "user-1",
        description: longDescription,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, transactionId: "tx-1" })
    expect(fundServiceMock.credit).toHaveBeenCalledWith(
      "acct-1",
      250,
      expect.stringMatching(/^Margin adjustment /),
    )
    const normalizedDescription = fundServiceMock.credit.mock.calls[0]?.[2] as string
    expect(normalizedDescription.length).toBeLessThanOrEqual(256)
    expect(normalizedDescription).not.toMatch(/\s{2,}/)
  })

  it("returns 400 for invalid operation type", async () => {
    const req = new Request("http://localhost/api/trading/funds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        amount: 50,
        type: "INVALID",
        userId: "user-1",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid operation type" })
  })
})

