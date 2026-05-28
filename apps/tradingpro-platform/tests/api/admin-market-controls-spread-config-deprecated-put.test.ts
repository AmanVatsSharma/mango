/**
 * File:        tests/api/admin-market-controls-spread-config-deprecated-put.test.ts
 * Module:      Admin API · spread-config · Trading-kzf 410 Gone hardening
 * Purpose:     Trading-kzf — proves PUT /api/admin/market-controls/spread-config now returns
 *              410 Gone with a migration hint instead of silently writing to the legacy
 *              BID_ASK_SPREAD_CONFIG_V1 SystemSettings key (which nothing reads any more).
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none — the route handler is a pure function returning a NextResponse.
 *
 * Key invariants:
 *   - PUT returns HTTP 410 Gone
 *   - Body has { code: "ENDPOINT_GONE", migrateTo: "PUT /api/admin/market-controls/config" }
 *   - No DB write of any kind happens (we don't even mock Prisma — if it were called the
 *     test would crash with a real-DB connection error)
 *
 * Read order:
 *   1. test "returns 410 Gone" — main assertion
 *   2. test "body includes migration hint" — protects callers from getting a useless 410
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

// Mock auth and prisma — they're imported by the route file (for GET) but the PUT handler
// does not call them. Mocking prevents jest from trying to resolve the real NextAuth setup.
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))
jest.mock("@/lib/prisma", () => ({
  prisma: {},
}))
jest.mock("@/lib/market-control/market-control-loader", () => ({
  loadMarketControlConfig: jest.fn(),
}))

import { PUT } from "@/app/api/admin/market-controls/spread-config/route"

describe("PUT /api/admin/market-controls/spread-config — Trading-kzf permanent deprecation", () => {
  it("returns 410 Gone (not 404, not 405)", async () => {
    const res = await PUT()
    expect(res.status).toBe(410)
  })

  it("body includes a migration hint pointing at the canonical endpoint", async () => {
    const res = await PUT()
    const body = await res.json()
    expect(body).toMatchObject({
      success: false,
      code: "ENDPOINT_GONE",
      migrateTo: "PUT /api/admin/market-controls/config",
    })
    expect(typeof body.message).toBe("string")
    expect(body.message).toMatch(/retired/i)
    expect(body.message).toMatch(/market-controls\/config/i)
  })
})
