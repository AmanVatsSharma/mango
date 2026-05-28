/**
 * @file tests/api/watchlists-route.test.ts
 * @module tests-api
 * @description Regression tests for watchlists collection route payload and auth guards.
 * @author StockTrade
 * @created 2026-02-16
 */

const authMock = jest.fn()
jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

const getAllWatchlistsMock = jest.fn()
const withCreateWatchlistTransactionMock = jest.fn()
jest.mock("@/lib/watchlist-transactions", () => ({
  getAllWatchlists: (...args: any[]) => getAllWatchlistsMock(...args),
  withCreateWatchlistTransaction: (...args: any[]) => withCreateWatchlistTransactionMock(...args),
}))

import { GET, POST } from "@/app/api/watchlists/route"

describe("watchlists route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getAllWatchlistsMock.mockResolvedValue([{ id: "wl-1" }])
    withCreateWatchlistTransactionMock.mockResolvedValue({ id: "wl-1", name: "Main" })
  })

  it("returns unauthorized when session is missing", async () => {
    authMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/watchlists", { method: "GET" })

    const res = await GET(req as any)
    expect(res.status).toBe(401)
    expect(getAllWatchlistsMock).not.toHaveBeenCalled()
  })

  it("rejects non-object create payload", async () => {
    const req = new Request("http://localhost/api/watchlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["Main"]),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" })
    expect(withCreateWatchlistTransactionMock).not.toHaveBeenCalled()
  })

  it("returns zod issue details for invalid create payload", async () => {
    const req = new Request("http://localhost/api/watchlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Invalid input")
    expect(Array.isArray(body.details)).toBe(true)
    expect(withCreateWatchlistTransactionMock).not.toHaveBeenCalled()
  })
})
