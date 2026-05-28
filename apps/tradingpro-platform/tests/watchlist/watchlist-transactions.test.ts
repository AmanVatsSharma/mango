/**
 * @file tests/watchlist/watchlist-transactions.test.ts
 * @module tests-watchlist
 * @description Regression tests for watchlist transaction defaults and token normalization.
 * @author StockTrade
 * @created 2026-02-16
 */

const withTransactionMock = jest.fn()
jest.mock("@/lib/database-transactions", () => ({
  withTransaction: (...args: any[]) => withTransactionMock(...args),
}))

import {
  withAddWatchlistItemTransaction,
  withCreateWatchlistTransaction,
} from "@/lib/watchlist-transactions"

describe("withCreateWatchlistTransaction default behavior", () => {
  const txMock = {
    watchlist: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    withTransactionMock.mockImplementation(async (callback: any) => callback(txMock))
    txMock.watchlist.updateMany.mockResolvedValue({ count: 0 })
    txMock.watchlist.create.mockImplementation(async (args: any) => ({
      id: "wl-created",
      userId: args.data.userId,
      name: args.data.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    }))
  })

  it("forces first watchlist to default even when payload sets isDefault=false", async () => {
    txMock.watchlist.findFirst.mockResolvedValue(null)

    await withCreateWatchlistTransaction("user-1", {
      name: "My First Watchlist",
      isDefault: false,
    })

    expect(txMock.watchlist.updateMany).toHaveBeenCalledTimes(1)
    expect(txMock.watchlist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          name: "My First Watchlist",
          isDefault: true,
        }),
      }),
    )
  })

  it("keeps non-first watchlist non-default when payload sets isDefault=false", async () => {
    txMock.watchlist.findFirst.mockResolvedValue({ id: "wl-existing" })

    await withCreateWatchlistTransaction("user-1", {
      name: "Secondary",
      isDefault: false,
    })

    expect(txMock.watchlist.updateMany).not.toHaveBeenCalled()
    expect(txMock.watchlist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          name: "Secondary",
          isDefault: false,
        }),
      }),
    )
  })

  it("unsets existing defaults when creating non-first watchlist with isDefault=true", async () => {
    txMock.watchlist.findFirst.mockResolvedValue({ id: "wl-existing" })

    await withCreateWatchlistTransaction("user-1", {
      name: "Priority",
      isDefault: true,
    })

    expect(txMock.watchlist.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isDefault: true,
      },
      data: { isDefault: false },
    })
    expect(txMock.watchlist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          name: "Priority",
          isDefault: true,
        }),
      }),
    )
  })
})

describe("withAddWatchlistItemTransaction token normalization", () => {
  const txMock = {
    watchlist: {
      findFirst: jest.fn(),
    },
    watchlistItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    stock: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    withTransactionMock.mockImplementation(async (callback: any) => callback(txMock))
    txMock.watchlist.findFirst.mockResolvedValue({ id: "wl-1", userId: "user-1" })
    txMock.watchlistItem.findFirst.mockResolvedValue(null)
    txMock.stock.findFirst.mockResolvedValue(null)
    txMock.stock.create.mockResolvedValue({ id: "stock-1" })
    txMock.watchlistItem.create.mockResolvedValue({
      id: "item-1",
      watchlistId: "wl-1",
      stockId: "stock-1",
      token: 26000,
      symbol: "NIFTY",
      exchange: "NSE",
      segment: "NSE",
      name: "NIFTY 50",
      ltp: 0,
      close: 0,
      strikePrice: null,
      optionType: null,
      expiry: null,
      lotSize: null,
      notes: null,
      alertPrice: null,
      alertType: "ABOVE",
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it("rejects invalid token values before entering transaction", async () => {
    await expect(
      withAddWatchlistItemTransaction("wl-1", "user-1", {
        token: Number.NaN as any,
        symbol: "NIFTY",
        exchange: "NSE",
        segment: "NSE",
        name: "NIFTY 50",
      } as any),
    ).rejects.toThrow("Invalid token value")

    expect(withTransactionMock).not.toHaveBeenCalled()
  })

  it("normalizes numeric-string token payloads to integer token values", async () => {
    await withAddWatchlistItemTransaction("wl-1", "user-1", {
      token: "26000" as any,
      symbol: "NIFTY",
      exchange: "NSE",
      segment: "NSE",
      name: "NIFTY 50",
    } as any)

    expect(txMock.watchlistItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          watchlistId: "wl-1",
          token: 26000,
        }),
      }),
    )
    expect(txMock.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: 26000,
          instrumentId: "NSE-26000",
        }),
      }),
    )
  })

  it("ignores invalid compact expiry values during stock upsert", async () => {
    await withAddWatchlistItemTransaction("wl-1", "user-1", {
      token: 26000,
      symbol: "NIFTY",
      exchange: "NSE",
      segment: "NSE",
      name: "NIFTY 50",
      expiry: "20260231",
    } as any)

    expect(txMock.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: 26000,
          expiry: undefined,
        }),
      }),
    )
  })

  it("normalizes lowercase exchange/segment payload values", async () => {
    await withAddWatchlistItemTransaction("wl-1", "user-1", {
      token: 26000,
      symbol: "NIFTY",
      exchange: "nse",
      segment: "nse",
      name: "NIFTY 50",
    } as any)

    expect(txMock.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          instrumentId: "NSE-26000",
          exchange: "NSE",
          segment: "NSE",
        }),
      }),
    )
    expect(txMock.watchlistItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          exchange: "NSE",
          segment: "NSE",
        }),
      }),
    )
  })
})
