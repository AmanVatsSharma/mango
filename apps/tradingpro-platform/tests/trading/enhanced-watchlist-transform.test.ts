/**
 * File:        tests/trading/enhanced-watchlist-transform.test.ts
 * Module:      tests · watchlist
 * Purpose:     Unit tests for watchlist REST-response transform — strict numeric normalization,
 *              token parsing, and instrumentId generation.
 *
 * Exports:     (test file — no exports)
 *
 * Depends on:
 *   - @/lib/hooks/use-prisma-watchlist — transformWatchlistData (SWR/REST hook)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Input shape is the flat REST response: array of watchlists with nested items[]
 *   - Token must be a strict positive integer; scientific-notation strings are dropped
 *
 * Read order:
 *   1. "normalizes valid numeric fields" — golden path
 *   2. "drops malformed token strings" — token validation
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { transformWatchlistData } from "@/lib/hooks/use-prisma-watchlist"

describe("transformWatchlistData (REST shape)", () => {
  it("normalizes valid numeric fields and strict token values", () => {
    const transformed = transformWatchlistData([
      {
        id: "wl-1",
        name: "Main",
        color: "#3B82F6",
        isDefault: true,
        isPrivate: false,
        sortOrder: 0,
        createdAt: "2026-02-16T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        items: [
          {
            id: "item-1",
            token: "26000",
            exchange: "NSE_EQ",
            symbol: "NIFTY",
            name: "Nifty 50",
            ltp: "250.5",
            close: "248.4",
            sortOrder: 1,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
      },
    ])

    expect(transformed[0]?.items[0]).toMatchObject({
      token: 26000,
      ltp: 250.5,
      close: 248.4,
      instrumentId: "NSE_EQ-26000",
    })
  })

  it("drops malformed token strings while preserving other fields", () => {
    const transformed = transformWatchlistData([
      {
        id: "wl-1",
        name: "Main",
        color: "#3B82F6",
        isDefault: true,
        isPrivate: false,
        sortOrder: 0,
        createdAt: "2026-02-16T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        items: [
          {
            id: "item-1",
            token: "1e3",
            exchange: "NSE_EQ",
            symbol: "BAD",
            name: "Bad Token",
            ltp: "100",
            close: "99",
            sortOrder: 1,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
      },
    ])

    expect(transformed[0]?.items[0]?.token).toBeUndefined()
    expect(transformed[0]?.items[0]?.instrumentId).toBe("NSE_EQ-1e3")
  })
})
