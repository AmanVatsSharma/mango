/**
 * @file admin-positions-net-close-route.test.ts
 * @module tests-api
 * @description Admin net square-off route delegates to executeNetPositionClose with admin_override.
 * @author StockTrade
 * @created 2026-03-30
 */

const withApiTelemetryMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const executeNetPositionCloseMock = jest.fn()

jest.mock("@/lib/observability/api-telemetry", () => ({
  withApiTelemetry: (...args: any[]) => withApiTelemetryMock(...args),
}))

jest.mock("@/lib/rbac/admin-api", () => {
  const { NextResponse } = jest.requireActual("next/server")
  const { mapErrorToHttp } = jest.requireActual("@/src/common/errors") as typeof import("@/src/common/errors")
  return {
    handleAdminApi: async (req: Request, opts: { fallbackMessage?: string }, handler: (ctx: unknown) => Promise<Response>) => {
      try {
        return await handler({
          req,
          session: { user: { id: "admin-1" } },
          logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
        })
      } catch (error: unknown) {
        const requestId = req.headers.get("x-request-id") || undefined
        const mapped = mapErrorToHttp(error, opts.fallbackMessage || "Internal Server Error")
        return NextResponse.json(
          { success: false, ...mapped.body, ...(requestId ? { requestId } : {}), message: mapped.body.error },
          { status: mapped.status },
        )
      }
    },
  }
})

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: unknown[]) => tradingAccountFindUniqueMock(...args),
    },
  },
}))

jest.mock("@/lib/server/net-position-close", () => ({
  executeNetPositionClose: (...args: unknown[]) => executeNetPositionCloseMock(...args),
}))

import { POST } from "@/app/api/admin/positions/net-close/route"

describe("POST /api/admin/positions/net-close", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withApiTelemetryMock.mockImplementation(async (_req: Request, _config: unknown, handler: () => Promise<Response>) => ({
      result: await handler(),
      durationMs: 1,
    }))
    tradingAccountFindUniqueMock.mockResolvedValue({
      id: "acct-1",
      balance: 50_000,
      availableMargin: 40_000,
      usedMargin: 10_000,
    })
  })

  it("returns 400 when tradingAccountId missing", async () => {
    const req = new Request("http://localhost/api/admin/positions/net-close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stockId: "s1", productType: "MIS" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(executeNetPositionCloseMock).not.toHaveBeenCalled()
  })

  it("calls executeNetPositionClose with admin_override and exitPriceMode", async () => {
    executeNetPositionCloseMock.mockResolvedValueOnce({
      kind: "success",
      data: {
        success: true,
        stockId: "s1",
        closedQuantity: 100,
        exitPrice: 150,
        exitPriceSource: "stock_ltp",
        realizedPnL: 10,
        message: "ok",
      },
    })

    const req = new Request("http://localhost/api/admin/positions/net-close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        stockId: "s1",
        productType: "MIS",
        exitPriceMode: "stock_ltp",
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(executeNetPositionCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policyMode: "admin_override",
        policyUserId: null,
        requestedStockId: "s1",
        exitPriceMode: "stock_ltp",
        adminUserId: "admin-1",
      }),
    )
  })

  it("returns error body from executeNetPositionClose", async () => {
    executeNetPositionCloseMock.mockResolvedValueOnce({
      kind: "error",
      status: 422,
      body: { success: false, code: "EXIT_PRICE_UNAVAILABLE", message: "no quote" },
    })

    const req = new Request("http://localhost/api/admin/positions/net-close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradingAccountId: "acct-1",
        stockId: "s1",
        productType: "MIS",
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe("EXIT_PRICE_UNAVAILABLE")
  })
})
