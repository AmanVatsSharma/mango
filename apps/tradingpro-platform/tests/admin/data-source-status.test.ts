/**
 * @file data-source-status.test.ts
 * @module admin-console
 * @description Unit tests for admin console data source status helpers
 * @author StockTrade
 * @created 2026-01-15
 */

import { deriveDataSourceStatus } from "@/lib/admin/data-source"

describe("deriveDataSourceStatus", () => {
  it("returns live when all endpoints succeed", () => {
    const summary = deriveDataSourceStatus([
      { name: "Users", ok: true },
      { name: "Stats", ok: true },
    ])

    expect(summary.status).toBe("live")
    expect(summary.errors).toEqual([])
    expect(summary.okCount).toBe(2)
    expect(summary.total).toBe(2)
  })

  it("returns partial when some endpoints fail", () => {
    const summary = deriveDataSourceStatus([
      { name: "Users", ok: true },
      { name: "Stats", ok: false, error: "Stats API failed" },
    ])

    expect(summary.status).toBe("partial")
    expect(summary.errors).toEqual(["Stats: Stats API failed"])
    expect(summary.okCount).toBe(1)
    expect(summary.total).toBe(2)
  })

  it("returns error when all endpoints fail", () => {
    const summary = deriveDataSourceStatus([
      { name: "Users", ok: false, error: "Users API failed" },
      { name: "Stats", ok: false },
    ])

    expect(summary.status).toBe("error")
    expect(summary.errors).toEqual(["Users: Users API failed", "Stats: Request failed"])
    expect(summary.okCount).toBe(0)
    expect(summary.total).toBe(2)
  })
})
