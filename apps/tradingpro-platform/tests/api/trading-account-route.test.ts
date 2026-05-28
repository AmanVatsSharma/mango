/**
 * File:        tests/api/trading-account-route.test.ts
 * Module:      tests-api
 * Purpose:     Route-level auth/ownership/error mapping tests for /api/trading/account GET.
 *              Covers: legacy userId-only fallback, accountId param with ownership checks,
 *              LIVE/DEMO switching, and the 404 when accountId belongs to another user.
 *
 * Exports:     none (test file)
 *
 * Depends on:
 *   - @/app/api/trading/account/route — GET handler under test
 *   - @/lib/server/trading-access — TradingAccessError, mocks
 *
 * Side-effects: mocks Prisma + telemetry, no DB, no network
 *
 * Key invariants:
 *   - accountId param takes precedence over userId-only fallback
 *   - accountId lookup validates userId match — cross-user fetch returns 404
 *   - When no accountId and no account exists, returns { success: true, account: null }
 *
 * Read order:
 *   1. AuthError path — 401 / 403 / 400 coverage
 *   2. accountId path — valid, not-found, cross-user 404
 *   3. userId-only fallback — legacy behaviour
 *   4. Numeric field normalisation — parseFiniteTradingNumber fallback
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

const requireAuthenticatedUserIdMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
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
    assertTradingAccountOwnership: jest.fn(),
    assertOrderOwnership: jest.fn(),
    getOwnedPositionContext: jest.fn(),
    resolveTradingErrorResponse: (error: any, fallbackMessage = "Failed to fetch trading account", fallbackStatus = 500) => ({
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
      findFirst: jest.fn(),
    },
  },
}))

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

import { GET } from "@/app/api/trading/account/route"
import { TradingAccessError } from "@/lib/server/trading-access"

describe("GET /api/trading/account", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
    tradingAccountFindUniqueMock.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: 100000,
      availableMargin: 85000,
      usedMargin: 15000,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
  })

  it("returns 401 when authentication fails", async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new TradingAccessError("Unauthorized", 401))
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
    })
  })

  it("returns 403 when requested userId mismatches authenticated user", async () => {
    const req = new Request("http://localhost/api/trading/account?userId=user-2")

    const res = await GET(req)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Forbidden",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns 400 when requested userId is too long", async () => {
    const tooLongUserId = "u".repeat(200)
    const req = new Request(`http://localhost/api/trading/account?userId=${tooLongUserId}`)

    const res = await GET(req)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid user scope",
    })
    expect(tradingAccountFindUniqueMock).not.toHaveBeenCalled()
  })

  it("returns success with account null when account does not exist", async () => {
    tradingAccountFindUniqueMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: null,
    })
  })

  it("returns normalized account payload for owned account", async () => {
    // Route uses findFirst (no accountId param) — not findUnique with userId filter
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: 100000,
      availableMargin: 85000,
      usedMargin: 15000,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ accountType: "asc" }],
    })
    expect(body).toMatchObject({
      success: true,
      account: {
        id: "acct-1",
        userId: "user-1",
        balance: 100000,
        availableMargin: 85000,
        usedMargin: 15000,
        clientId: "CID001",
      },
    })
    expect(withApiTelemetryMock).toHaveBeenCalledWith(
      req,
      { name: "trading_account_get" },
      expect.any(Function),
    )
  })

  it("accepts whitespace-padded userId query scope", async () => {
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: 100000,
      availableMargin: 85000,
      usedMargin: 15000,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
    const req = new Request("http://localhost/api/trading/account?userId=%20user-1%20")
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: { id: "acct-1" },
    })
  })

  it("accepts relative request url query scope via shared parser", async () => {
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: 100000,
      availableMargin: 85000,
      usedMargin: 15000,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
    const req = {
      url: "/api/trading/account?userId=user-1",
      method: "GET",
      headers: new Headers(),
    } as unknown as Request
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: { id: "acct-1" },
    })
  })

  it("returns mapped 500 when account lookup fails", async () => {
    // Route uses findFirst (no accountId param) for the userId-only fallback path
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockRejectedValue(new Error("database unavailable"))
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "database unavailable",
    })
  })

  it("preserves zero-valued account margin fields", async () => {
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: 0,
      availableMargin: 0,
      usedMargin: 0,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: {
        balance: 0,
        availableMargin: 0,
        usedMargin: 0,
      },
    })
  })

  it("falls back to zero when account numeric fields are malformed", async () => {
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-1",
      userId: "user-1",
      balance: Symbol("bad-balance"),
      availableMargin: "NaN",
      usedMargin: "invalid-value",
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })
    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: {
        balance: 0,
        availableMargin: 0,
        usedMargin: 0,
      },
    })
  })
})

// -----------------------------------------------------------------------
// accountId param — LIVE/DEMO switching
// -----------------------------------------------------------------------
describe("GET /api/trading/account — accountId param (LIVE/DEMO switching)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: any, handler: any) => ({
      result: await handler(),
      durationMs: 1,
    }))
    requireAuthenticatedUserIdMock.mockResolvedValue("user-1")
  })

  it("returns the requested account when accountId belongs to the authenticated user", async () => {
    // First findUnique call (ownership check): belongs to user-1
    tradingAccountFindUniqueMock
      .mockResolvedValueOnce({
        id: "acct-live-1",
        userId: "user-1",
      })
      // Second findUnique call (full data fetch)
      .mockResolvedValueOnce({
        id: "acct-live-1",
        userId: "user-1",
        balance: 250000,
        availableMargin: 200000,
        usedMargin: 50000,
        clientId: "CID001",
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        updatedAt: new Date("2026-02-15T10:05:00.000Z"),
      })

    const req = new Request(
      "http://localhost/api/trading/account?userId=user-1&accountId=acct-live-1",
    )

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: {
        id: "acct-live-1",
        userId: "user-1",
        balance: 250000,
        availableMargin: 200000,
        usedMargin: 50000,
      },
    })

    // Verify ownership check ran first, then full fetch
    expect(tradingAccountFindUniqueMock).toHaveBeenCalledTimes(2)
    expect(tradingAccountFindUniqueMock).toHaveBeenNthCalledWith(1, {
      where: { id: "acct-live-1" },
      select: { id: true, userId: true },
    })
  })

  it("returns 404 when accountId does not exist", async () => {
    tradingAccountFindUniqueMock.mockResolvedValueOnce(null)

    const req = new Request(
      "http://localhost/api/trading/account?userId=user-1&accountId=nonexistent-account",
    )

    const res = await GET(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Account not found or access denied",
    })
  })

  it("returns 404 when accountId belongs to a different user", async () => {
    // Ownership check finds the account but it's owned by user-2, not user-1
    tradingAccountFindUniqueMock.mockResolvedValueOnce({
      id: "acct-other-user",
      userId: "user-2",
    })

    const req = new Request(
      "http://localhost/api/trading/account?userId=user-1&accountId=acct-other-user",
    )

    const res = await GET(req)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Account not found or access denied",
    })
  })

  it("returns the DEMO account when accountId points to the user's demo account", async () => {
    tradingAccountFindUniqueMock
      .mockResolvedValueOnce({
        id: "acct-demo-1",
        userId: "user-1",
      })
      .mockResolvedValueOnce({
        id: "acct-demo-1",
        userId: "user-1",
        balance: 500000,
        availableMargin: 500000,
        usedMargin: 0,
        clientId: "CID-DEMO",
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        updatedAt: new Date("2026-02-15T10:05:00.000Z"),
      })

    const req = new Request(
      "http://localhost/api/trading/account?userId=user-1&accountId=acct-demo-1",
    )

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: {
        id: "acct-demo-1",
        balance: 500000,
      },
    })
  })

  it("uses userId-only fallback when accountId is absent (LIVE before DEMO)", async () => {
    const { prisma } = require("@/lib/prisma")
    prisma.tradingAccount.findFirst.mockResolvedValue({
      id: "acct-live-fallback",
      userId: "user-1",
      balance: 100000,
      availableMargin: 80000,
      usedMargin: 20000,
      clientId: "CID001",
      createdAt: new Date("2026-02-15T10:00:00.000Z"),
      updatedAt: new Date("2026-02-15T10:05:00.000Z"),
    })

    const req = new Request("http://localhost/api/trading/account?userId=user-1")

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      account: { id: "acct-live-fallback" },
    })

    expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ accountType: "asc" }],
    })
  })
})
