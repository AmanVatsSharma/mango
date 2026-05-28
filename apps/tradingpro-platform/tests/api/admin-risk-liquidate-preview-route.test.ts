/**
 * File:        tests/api/admin-risk-liquidate-preview-route.test.ts
 * Module:      Tests · Admin API · Risk · Liquidation Preview
 * Purpose:     Integration-style tests for POST /api/admin/risk/liquidate-account/preview —
 *              verifies request parsing, RBAC delegation, and response shaping.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/app/api/admin/risk/liquidate-account/preview/route — unit under test
 *   - @/lib/rbac/admin-api                                 — mocked
 *   - @/lib/services/risk/LiquidationService               — mocked
 *   - @/lib/prisma                                         — mocked (dry-run assertion)
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - handleAdminApi mock propagates session.user.id to handler ctx
 *   - preview route must NOT call prisma.riskAuditEvent.create (dry-run guarantee)
 *
 * Read order:
 *   1. describe("POST /api/admin/risk/liquidate-account/preview") — all cases
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"

const mockHandleAdminApi = jest.fn()
const mockPreviewLiquidation = jest.fn()
const mockAuditCreate = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: (...args: unknown[]) => mockHandleAdminApi(...args),
}))

jest.mock("@/lib/services/risk/LiquidationService", () => ({
  previewLiquidation: (...args: unknown[]) => mockPreviewLiquidation(...args),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    riskAuditEvent: { create: (...args: unknown[]) => mockAuditCreate(...args) },
    tradingAccount: { findUnique: jest.fn() },
  },
}))

import { POST } from "@/app/api/admin/risk/liquidate-account/preview/route"
import { mapErrorToHttp } from "@/src/common/errors"

/** Re-create the same admin-api shim the original stub used, but backed by mockHandleAdminApi so we can override per test. */
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

const fakePreview = {
  positions: [
    {
      positionId: "pos-1",
      symbol: "RELIANCE",
      quantity: 10,
      averagePrice: 100,
      projectedExitPrice: 150,
      projectedRealizedPnL: 500,
      projectedMarginFreed: 1000,
      pnlMode: "market-quote",
      skippedNoPrice: false,
    },
  ],
  totalProjectedPnL: 500,
  totalMarginFreed: 1000,
  positionsToClose: 1,
  positionsSkipped: 0,
  warnings: [],
}

describe("POST /api/admin/risk/liquidate-account/preview", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHandleAdminApi.mockImplementation(makeAdminApiImpl())
    mockPreviewLiquidation.mockResolvedValue(fakePreview)
  })

  it("returns 200 with { success: true, preview: ... } on success", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1", reason: "test" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.preview).toBeDefined()
    expect(body.preview.positionsToClose).toBe(1)
  })

  it("returns 401 when no session", async () => {
    mockHandleAdminApi.mockImplementation(makeAdminApiImpl(null))

    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 when tradingAccountId is missing", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "missing account id" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("does NOT write any DB row (dry-run guarantee)", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1", reason: "test" }),
    })

    await POST(req)
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })

  it("calls previewLiquidation with correct tradingAccountId and reason", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-42", reason: "margin breach" }),
    })

    await POST(req)
    expect(mockPreviewLiquidation).toHaveBeenCalledWith(
      expect.objectContaining({ tradingAccountId: "acct-42", reason: "margin breach" }),
    )
  })

  it("uses default reason string when reason is not supplied in body", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    await POST(req)
    expect(mockPreviewLiquidation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Admin preview" }),
    )
  })

  it("passes operatorUserId from session to previewLiquidation", async () => {
    const req = new Request("http://localhost/api/admin/risk/liquidate-account/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingAccountId: "acct-1" }),
    })

    await POST(req)
    expect(mockPreviewLiquidation).toHaveBeenCalledWith(
      expect.objectContaining({ operatorUserId: "admin-user-1" }),
    )
  })
})
