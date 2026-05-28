/**
 * @file tests/api/watchlist-by-id-route.test.ts
 * @module tests-api
 * @description Regression tests for watchlist-by-id route input normalization and guards.
 * @author StockTrade
 * @created 2026-02-16
 */

const authMock = jest.fn()
jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

const getWatchlistByIdMock = jest.fn()
const withUpdateWatchlistTransactionMock = jest.fn()
const withDeleteWatchlistTransactionMock = jest.fn()
jest.mock("@/lib/watchlist-transactions", () => ({
  getWatchlistById: (...args: any[]) => getWatchlistByIdMock(...args),
  withUpdateWatchlistTransaction: (...args: any[]) => withUpdateWatchlistTransactionMock(...args),
  withDeleteWatchlistTransaction: (...args: any[]) => withDeleteWatchlistTransactionMock(...args),
}))

import { DELETE, GET, PUT } from "@/app/api/watchlists/[id]/route"

describe("watchlist-by-id route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getWatchlistByIdMock.mockResolvedValue({ id: "wl-1", name: "Main" })
    withUpdateWatchlistTransactionMock.mockResolvedValue({ id: "wl-1", name: "Updated" })
    withDeleteWatchlistTransactionMock.mockResolvedValue(undefined)
  })

  it("rejects blank watchlist id for all route handlers", async () => {
    const getReq = new Request("http://localhost/api/watchlists/%20", { method: "GET" })
    const putReq = new Request("http://localhost/api/watchlists/%20", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Main" }),
    })
    const deleteReq = new Request("http://localhost/api/watchlists/%20", { method: "DELETE" })

    expect((await GET(getReq as any, { params: { id: "  " } })).status).toBe(400)
    expect((await PUT(putReq as any, { params: { id: "  " } })).status).toBe(400)
    expect((await DELETE(deleteReq as any, { params: { id: "  " } })).status).toBe(400)
    expect(getWatchlistByIdMock).not.toHaveBeenCalled()
    expect(withUpdateWatchlistTransactionMock).not.toHaveBeenCalled()
    expect(withDeleteWatchlistTransactionMock).not.toHaveBeenCalled()
  })

  it("rejects non-object PUT payload before schema parse", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["Main"]),
    })

    const res = await PUT(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" })
    expect(withUpdateWatchlistTransactionMock).not.toHaveBeenCalled()
  })

  it("trims watchlist id before update transaction invocation", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    })

    const res = await PUT(req as any, { params: { id: "  wl-1  " } })
    expect(res.status).toBe(200)
    expect(withUpdateWatchlistTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({ name: "Updated" }),
    )
  })

  it("coerces integer sortOrder strings and rejects decimal sortOrder", async () => {
    const validReq = new Request("http://localhost/api/watchlists/wl-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: "3" }),
    })
    const validRes = await PUT(validReq as any, { params: { id: "wl-1" } })
    expect(validRes.status).toBe(200)
    expect(withUpdateWatchlistTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({ sortOrder: 3 }),
    )

    const invalidReq = new Request("http://localhost/api/watchlists/wl-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: "1.5" }),
    })
    const invalidRes = await PUT(invalidReq as any, { params: { id: "wl-1" } })
    expect(invalidRes.status).toBe(400)
  })
})
