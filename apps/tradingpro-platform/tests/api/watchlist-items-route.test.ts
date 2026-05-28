/**
 * @file tests/api/watchlist-items-route.test.ts
 * @module tests-api
 * @description Regression tests for watchlist items route instrument token extraction hardening.
 * @author StockTrade
 * @created 2026-02-16
 */

const authMock = jest.fn()
jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

const withAddWatchlistItemTransactionMock = jest.fn()
jest.mock("@/lib/watchlist-transactions", () => ({
  withAddWatchlistItemTransaction: (...args: any[]) => withAddWatchlistItemTransactionMock(...args),
}))

import { POST } from "@/app/api/watchlists/[id]/items/route"

describe("watchlist items route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    withAddWatchlistItemTransactionMock.mockResolvedValue({ id: "item-1" })
  })

  it("returns unauthorized when session is missing", async () => {
    authMock.mockResolvedValue(null)

    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrumentId: "NSE_EQ-26000" }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(401)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("rejects blank watchlist ids before processing body", async () => {
    const req = new Request("http://localhost/api/watchlists/%20/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrumentId: "NSE_EQ-26000" }),
    })

    const res = await POST(req as any, { params: { id: "   " } })
    expect(res.status).toBe(400)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("rejects non-object payloads before schema parsing", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["NSE_EQ-26000"]),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid input" })
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("extracts token from strict numeric instrument suffix", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrumentId: "NSE_EQ-26000",
        symbol: "NIFTY",
        name: "NIFTY 50",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({
        token: 26000,
        exchange: "NSE",
        segment: "NSE",
      }),
    )
  })

  it("trims watchlist ids before passing to transaction layer", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrumentId: "NSE_EQ-26000",
        symbol: "NIFTY",
        name: "NIFTY 50",
      }),
    })

    const res = await POST(req as any, { params: { id: "  wl-1  " } })
    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({ token: 26000 }),
    )
  })

  it("rejects malformed token suffix without stockId fallback", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrumentId: "NSE_EQ-26000abc",
        symbol: "NIFTY",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body?.error).toContain("Token is required")
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("rejects synthetic stockId placeholders without token", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stockId: "token-26000",
        symbol: "NIFTY",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body?.error).toContain("Token is required")
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("coerces numeric string token payloads", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "26000",
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })

    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({ token: 26000 }),
    )
  })

  it("coerces finite numeric-string quote fields in payload", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "26000",
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50",
        ltp: "250.25",
        close: "248.15",
        strikePrice: "250",
        lotSize: "15",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({
        ltp: 250.25,
        close: 248.15,
        strikePrice: 250,
        lotSize: 15,
      }),
    )
  })

  it("accepts null optional numeric fields by treating them as omitted", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: 15068,
        symbol: "RELIGARE",
        name: "RELIGARE EQUITIES",
        exchange: "NSE",
        segment: "NSE",
        strikePrice: null,
        instrumentId: "NSE-15068",
        ltp: 217.34,
        close: 0,
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })

    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({
        token: 15068,
        symbol: "RELIGARE",
      }),
    )
    expect(withAddWatchlistItemTransactionMock.mock.calls[0][2]).not.toHaveProperty("strikePrice")
  })

  it("rejects malformed numeric field values after null sanitation", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: 15068,
        symbol: "RELIGARE",
        name: "RELIGARE EQUITIES",
        exchange: "NSE",
        segment: "NSE",
        strikePrice: "not-a-number",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(400)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("keeps missing-token payloads guarded after null sanitation", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "RELIGARE",
        exchange: "NSE",
        segment: "NSE",
        strikePrice: null,
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })

    expect(res.status).toBe(400)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("normalizes derivative-like metadata to NSE_FO exchange/segment", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: 26000,
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50 CE",
        optionType: "CE",
        strikePrice: 25000,
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({
        exchange: "NSE_FO",
        segment: "NSE_FO",
      }),
    )
  })

  it("rejects non-finite quote fields after coercion", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: 26000,
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50",
        ltp: 1e309,
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(400)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })

  it("normalizes lowercase exchange prefixes extracted from instrumentId", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instrumentId: "nse_eq-26000",
        symbol: "NIFTY",
        name: "NIFTY 50",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })

    expect(res.status).toBe(201)
    expect(withAddWatchlistItemTransactionMock).toHaveBeenCalledWith(
      "wl-1",
      "user-1",
      expect.objectContaining({
        token: 26000,
        exchange: "NSE",
        segment: "NSE",
      }),
    )
  })

  it("rejects non-integer token payloads", async () => {
    const req = new Request("http://localhost/api/watchlists/wl-1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: 26000.5,
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50",
      }),
    })

    const res = await POST(req as any, { params: { id: "wl-1" } })
    expect(res.status).toBe(400)
    expect(withAddWatchlistItemTransactionMock).not.toHaveBeenCalled()
  })
})
