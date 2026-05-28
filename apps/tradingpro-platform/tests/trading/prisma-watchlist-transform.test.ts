/**
 * @file tests/trading/prisma-watchlist-transform.test.ts
 * @module tests-trading
 * @description Unit tests for Prisma watchlist transform strict token normalization.
 * @author StockTrade
 * @created 2026-02-16
 */

import { transformWatchlistData } from "@/lib/hooks/use-prisma-watchlist"

describe("transformWatchlistData", () => {
  it("normalizes valid token values and keeps exchange-based instrument ids", () => {
    const transformed = transformWatchlistData([
      {
        id: "wl-1",
        name: "Main",
        items: [
          {
            id: "item-1",
            token: "26000",
            exchange: "NSE_EQ",
            symbol: "NIFTY",
            name: "NIFTY 50",
            ltp: "250.5",
            close: "248.1",
            segment: "NSE",
            sortOrder: 1,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
      },
    ] as any)

    expect(transformed[0]?.items[0]).toMatchObject({
      token: 26000,
      instrumentId: "NSE_EQ-26000",
      ltp: 250.5,
      close: 248.1,
    })
  })

  it("drops malformed token candidates during transform", () => {
    const transformed = transformWatchlistData([
      {
        id: "wl-1",
        name: "Main",
        items: [
          {
            id: "item-1",
            token: "1e3",
            exchange: "NSE_EQ",
            symbol: "BAD",
            ltp: 100,
            close: 99,
            sortOrder: 0,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
      },
    ] as any)

    expect(transformed[0]?.items[0]?.token).toBeUndefined()
  })

  it("normalizes malformed non-finite numeric fields to zero", () => {
    const transformed = transformWatchlistData([
      {
        id: "wl-1",
        name: "Main",
        items: [
          {
            id: "item-1",
            token: "26000",
            exchange: "NSE_EQ",
            symbol: "BAD-NUM",
            ltp: "Infinity",
            close: "NaN",
            sortOrder: 0,
            createdAt: "2026-02-16T00:00:00.000Z",
          },
        ],
      },
    ] as any)

    expect(transformed[0]?.items[0]).toMatchObject({
      token: 26000,
      ltp: 0,
      close: 0,
    })
  })
})
