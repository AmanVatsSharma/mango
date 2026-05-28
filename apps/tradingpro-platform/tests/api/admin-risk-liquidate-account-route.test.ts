/**
 * File:        tests/api/admin-risk-liquidate-account-route.test.ts
 * Module:      Tests · Admin API · Risk · Liquidate Account
 * Purpose:     Integration-style tests for POST /api/admin/risk/liquidate-account —
 *              verifies request parsing, delegation to executeLiquidation, and
 *              response shaping.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/app/api/admin/risk/liquidate-account/route — unit under test
 *   - @/lib/rbac/admin-api                         — mocked
 *   - @/lib/services/risk/LiquidationService       — mocked
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - handleAdminApi mock propagates session.user.id to handler ctx
 *
 * Read order:
 *   1. describe("POST /api/admin/risk/liquidate-account") — all cases
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"

const mockHandleAdminApi = jest.fn()
const mockExecuteLiquidation = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: (...args: unknown[]) => mockHandleAdminApi(...args),
}))

jest.mock("@/lib/services/risk/LiquidationService", () => ({
  executeLiquidation: (...args: unknown[]) => mockExecuteLiquidation(...args),
}))

import { POST } from "@/app/api/admin/risk/liquidate-account/route"
import { mapErrorToHttp } from "@/src/common/errors"

function makeAdminApiImpl(sessionOverride?: null) {
  return async (
    req: Request,
    opts: { fallbackMessage?: string },
    handler: (ctx: unknown) => Promise<Response>,
  ): Promise<Response> => {
    if (sessionOverride === null) {
      return NextResponse.json({ success: false, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 })
    }
    try {
      return await handler({
        req,
        session: { user: { id: "admin-user-1" } },
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
  }
}

const fakeExecuteResult = {
  success: true as const,
  auditEventId: "audit-1",
  positionsClosed: 2,
  positionsSkipped: 0,
  totalRealizedPnL: 1200,
  marginFreed: 5000,
}

describe("POST /api/admin/risk/liquidate-account", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHandleAdminApi.mockImplementation(makeAdminApiImpl())
    mockExecuteLiquidation.mockResolvedValue(fakeExecuteResult)
  })

  it("returns 200 and closes positions on valid admin request", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1", reason: "margin breach" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.auditEventId).toBe("audit-1")
    expect(body.positionsClosed).toBe(2)
    expect(body.success).toBe(true)
  })

  it("returns 401 when no session", async () => {
    mockHandleAdminApi.mockImplementation(makeAdminApiImpl(null))

    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 when tradingAccountId is missing", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "missing account id" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("returns 500 when executeLiquidation throws", async () => {
    mockExecuteLiquidation.mockRejectedValue(new Error("Liquidation failed for 1 position(s): margin error"))

    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1", reason: "test" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it("uses default reason string when reason is not supplied in body", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    await POST(req)
    expect(mockExecuteLiquidation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Admin liquidation" }),
    )
  })

  it("passes ctx.session.user.id as operatorUserId to executeLiquidation", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1", reason: "test" }),
    })

    await POST(req)
    expect(mockExecuteLiquidation).toHaveBeenCalledWith(
      expect.objectContaining({ operatorUserId: "admin-user-1" }),
    )
  })

  it.todo("concurrency cap honored: max 3 in-flight at any point (tested in LiquidationService unit test)")
})
