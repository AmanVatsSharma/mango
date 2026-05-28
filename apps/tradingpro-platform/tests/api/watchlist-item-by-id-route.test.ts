/**
 * @file tests/api/watchlist-item-by-id-route.test.ts
 * @module tests-api
 * @description Regression tests for watchlist-item-by-id route guards and numeric coercion.
 * @author StockTrade
 * @created 2026-02-16
 */

const authMock = jest.fn()
jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

const getWatchlistItemByIdMock = jest.fn()
const withUpdateWatchlistItemTransactionMock = jest.fn()
const withRemoveWatchlistItemTransactionMock = jest.fn()
jest.mock("@/lib/watchlist-transactions", () => ({
  getWatchlistItemById: (...args: any[]) => getWatchlistItemByIdMock(...args),
  withUpdateWatchlistItemTransaction: (...args: any[]) => withUpdateWatchlistItemTransactionMock(...args),
  withRemoveWatchlistItemTransaction: (...args: any[]) => withRemoveWatchlistItemTransactionMock(...args),
}))

import { DELETE, GET, PUT } from "@/app/api/watchlists/items/[itemId]/route"

describe("watchlist-item-by-id route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getWatchlistItemByIdMock.mockResolvedValue({ id: "item-1" })
    withUpdateWatchlistItemTransactionMock.mockResolvedValue({ id: "item-1" })
    withRemoveWatchlistItemTransactionMock.mockResolvedValue(undefined)
  })

  it("rejects blank item id for get/update/delete", async () => {
    const getReq = new Request("http://localhost/api/watchlists/items/%20", { method: "GET" })
    const putReq = new Request("http://localhost/api/watchlists/items/%20", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "x" }),
    })
    const deleteReq = new Request("http://localhost/api/watchlists/items/%20", { method: "DELETE" })

    expect((await GET(getReq as any, { params: { itemId: "  " } })).status).toBe(400)
    expect((await PUT(putReq as any, { params: { itemId: "  " } })).status).toBe(400)
    expect((await DELETE(deleteReq as any, { params: { itemId: "  " } })).status).toBe(400)
    expect(withUpdateWatchlistItemTransactionMock).not.toHaveBeenCalled()
    expect(withRemoveWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("rejects non-object payload and non-finite alertPrice", async () => {
    const nonObjectReq = new Request("http://localhost/api/watchlists/items/item-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["notes"]),
    })
    const nonObjectRes = await PUT(nonObjectReq as any, { params: { itemId: "item-1" } })
    expect(nonObjectRes.status).toBe(400)
    await expect(nonObjectRes.json()).resolves.toMatchObject({ error: "Invalid input" })

    const nonFiniteReq = new Request("http://localhost/api/watchlists/items/item-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertPrice: "Infinity" }),
    })
    const nonFiniteRes = await PUT(nonFiniteReq as any, { params: { itemId: "item-1" } })
    expect(nonFiniteRes.status).toBe(400)
    expect(withUpdateWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("coerces numeric update fields before transaction call", async () => {
    const req = new Request("http://localhost/api/watchlists/items/item-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertPrice: "250.5", sortOrder: "3" }),
    })

    const res = await PUT(req as any, { params: { itemId: "  item-1  " } })
    expect(res.status).toBe(200)
    expect(withUpdateWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "item-1",
      "user-1",
      expect.objectContaining({ alertPrice: 250.5, sortOrder: 3 }),
    )

    const invalidSortReq = new Request("http://localhost/api/watchlists/items/item-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: "3.5" }),
    })
    const invalidSortRes = await PUT(invalidSortReq as any, { params: { itemId: "item-1" } })
    expect(invalidSortRes.status).toBe(400)
  })
})
