/**
 * File:        tests/api/admin-spread-configs-orphan-marker.test.ts
 * Module:      Admin · Spread Engine · staging marker regression
 * Purpose:     Trading-962 — the SpreadConfig admin CRUD is intentionally
 *              orphan (the admin-v2 UI shows a banner). This suite locks in
 *              the API-layer marker (Warning header + _orphan JSON field) so
 *              non-browser callers (curl, scripts, monitoring) see the
 *              staging notice that the UI banner shows.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Every successful response includes _orphan: true and a _orphanWarning
 *     string referencing MarketControlConfig as the actual runtime owner
 *   - X-Orphan-Endpoint header set to "true"
 *
 * Read order:
 *   1. handleAdminApi mock (passes through to handler)
 *   2. spread-engine mocks (no-op DB calls)
 *   3. tests
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const listSpreadConfigsMock = jest.fn()
const createSpreadConfigMock = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: any, _opts: any, handler: any) => {
    return handler({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      session: { user: { id: "admin-user-1" } },
    })
  },
}))

jest.mock("@/lib/spread/spread-engine", () => ({
  listSpreadConfigs: (...args: any[]) => listSpreadConfigsMock(...args),
  createSpreadConfig: (...args: any[]) => createSpreadConfigMock(...args),
}))

import { GET, POST } from "@/app/api/admin/spread/configs/route"

beforeEach(() => {
  jest.clearAllMocks()
})

describe("/api/admin/spread/configs orphan marker", () => {
  it("GET response includes _orphan field + X-Orphan-Endpoint header", async () => {
    listSpreadConfigsMock.mockResolvedValue([])
    const req = new Request("https://example.test/api/admin/spread/configs")
    const res = await GET(req)
    const body = await res.json()
    expect(body._orphan).toBe(true)
    expect(typeof body._orphanWarning).toBe("string")
    expect(body._orphanWarning).toMatch(/MarketControlConfig/)
    expect(res.headers.get("X-Orphan-Endpoint")).toBe("true")
    expect(res.headers.get("Warning")).toContain("Spread engine is not wired")
  })

  it("POST success response includes _orphan field + X-Orphan-Endpoint header", async () => {
    createSpreadConfigMock.mockResolvedValue({ id: "row-1", bidMarkupBps: 5, askMarkupBps: 5 })
    const req = new Request("https://example.test/api/admin/spread/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidMarkupBps: 5, askMarkupBps: 5 }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body._orphan).toBe(true)
    expect(body._orphanWarning).toMatch(/no runtime|not wired|do NOT affect/i)
    expect(res.headers.get("X-Orphan-Endpoint")).toBe("true")
  })

  it("POST validation-error response still includes orphan markers (consistent shape)", async () => {
    const req = new Request("https://example.test/api/admin/spread/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidMarkupBps: -1, askMarkupBps: 5 }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body._orphan).toBe(true)
    expect(res.headers.get("X-Orphan-Endpoint")).toBe("true")
  })
})
