/**
 * File: tests/console/export-statement-disabled.test.ts
 * Module: console
 * Purpose: Ensure statement export is blocked when statements are disabled.
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - Mocks auth() session + feature resolver to assert 403 behavior.
 */

import { GET as exportGet } from "@/app/api/export/route"

jest.mock("@/auth", () => ({
  auth: jest.fn(async () => ({ user: { id: "user-1" } })),
}))

jest.mock("@/lib/server/console-statements", () => ({
  getEffectiveStatementsEnabledForUser: jest.fn(async () => ({ enabled: false, source: "override_force_disable" })),
}))

jest.mock("@/lib/services/export/DataExportService", () => ({
  DataExportService: {
    exportOrders: jest.fn(),
    exportPositions: jest.fn(),
    exportTransactions: jest.fn(),
    generateStatement: jest.fn(),
    generateCSV: jest.fn(),
  },
}))

describe("/api/export statement enforcement", () => {
  it("returns 403 for statement export when disabled", async () => {
    const req = new Request(
      "http://localhost/api/export?type=statement&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-02T00:00:00.000Z&format=csv",
      { method: "GET" }
    )

    const res = await exportGet(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body?.success).toBe(false)
    expect(String(body?.error || "")).toMatch(/Statements are disabled/i)
  })
})

