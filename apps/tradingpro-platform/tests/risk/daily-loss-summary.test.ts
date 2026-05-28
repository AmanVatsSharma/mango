/**
 * File:        tests/risk/daily-loss-summary.test.ts
 * Module:      Risk · Trading-upr daily PnL summary helper
 * Purpose:     Locks in the cached daily-PnL summary used by maxDailyLoss enforcement.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: mocks @/lib/prisma; resets module cache between tests via the
 *               __resetDailyPnLCacheForTests escape hatch.
 *
 * Key invariants:
 *   - First call hits DB; second within TTL hits cache
 *   - bustDailyPnLCache(userId) forces DB hit on next call
 *   - bustDailyPnLCache() (no arg) clears all entries
 *   - realizedPnL = sum of unrealizedPnL on positions closed today
 *   - unrealizedPnL = sum of unrealizedPnL on currently-open positions
 *   - totalPnL = realizedPnL + unrealizedPnL
 *   - User without trading account → empty summary, no throw
 *
 * Read order:
 *   1. mock setup
 *   2. cache hit/miss tests
 *   3. bust tests
 *   4. summary math tests
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const tradingAccountFindFirstMock = jest.fn()
const positionFindManyMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findFirst: (...args: any[]) => tradingAccountFindFirstMock(...args),
    },
    position: {
      findMany: (...args: any[]) => positionFindManyMock(...args),
    },
  },
}))

import { Prisma } from "@prisma/client"
import {
  getTodayPnLSummary,
  bustDailyPnLCache,
  __resetDailyPnLCacheForTests,
} from "@/lib/services/risk/daily-loss-summary"

beforeEach(() => {
  jest.clearAllMocks()
  __resetDailyPnLCacheForTests()
})

const ACCOUNT = { id: "acc-1" }

function setupAccount() {
  tradingAccountFindFirstMock.mockResolvedValue(ACCOUNT)
}

describe("getTodayPnLSummary — Trading-upr", () => {
  it("computes realized + unrealized + total from position rows", async () => {
    setupAccount()
    // closedTodayPositions returns -2000 + -500 = -2500 realized
    // openPositions returns -3000 + 1000 = -2000 unrealized
    // total = -4500
    positionFindManyMock
      .mockResolvedValueOnce([
        { unrealizedPnL: new Prisma.Decimal(-2000) },
        { unrealizedPnL: new Prisma.Decimal(-500) },
      ])
      .mockResolvedValueOnce([
        { unrealizedPnL: new Prisma.Decimal(-3000) },
        { unrealizedPnL: new Prisma.Decimal(1000) },
      ])

    const summary = await getTodayPnLSummary("u-1")
    expect(summary.realizedPnL).toBe(-2500)
    expect(summary.unrealizedPnL).toBe(-2000)
    expect(summary.totalPnL).toBe(-4500)
  })

  it("second call within TTL serves from cache (no DB hit)", async () => {
    setupAccount()
    positionFindManyMock
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(-1000) }])
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(-500) }])

    await getTodayPnLSummary("u-1")
    expect(tradingAccountFindFirstMock).toHaveBeenCalledTimes(1)
    expect(positionFindManyMock).toHaveBeenCalledTimes(2)

    await getTodayPnLSummary("u-1")
    // Second call: still 1 account lookup, still 2 position lookups (no new calls)
    expect(tradingAccountFindFirstMock).toHaveBeenCalledTimes(1)
    expect(positionFindManyMock).toHaveBeenCalledTimes(2)
  })

  it("bustDailyPnLCache(userId) forces a fresh DB read on next call", async () => {
    setupAccount()
    positionFindManyMock
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(-1000) }])
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(-500) }])
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(0) }])
      .mockResolvedValueOnce([{ unrealizedPnL: new Prisma.Decimal(0) }])

    await getTodayPnLSummary("u-1")
    bustDailyPnLCache("u-1")
    await getTodayPnLSummary("u-1")

    // Both calls hit DB → 4 findMany calls (2 per call)
    expect(positionFindManyMock).toHaveBeenCalledTimes(4)
  })

  it("bustDailyPnLCache() (no arg) clears ALL entries", async () => {
    setupAccount()
    positionFindManyMock.mockResolvedValue([{ unrealizedPnL: new Prisma.Decimal(0) }])

    await getTodayPnLSummary("u-1")
    await getTodayPnLSummary("u-2")
    bustDailyPnLCache() // clear all
    await getTodayPnLSummary("u-1")
    await getTodayPnLSummary("u-2")

    // Each user got fresh reads twice → 4 user-level lookups → 8 findMany calls
    expect(positionFindManyMock).toHaveBeenCalledTimes(8)
  })

  it("returns empty summary when user has no trading account (no throw)", async () => {
    tradingAccountFindFirstMock.mockResolvedValue(null)
    const summary = await getTodayPnLSummary("ghost-user")
    expect(summary).toMatchObject({
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
    })
    expect(positionFindManyMock).not.toHaveBeenCalled()
  })

  it("maxAgeMs:0 bypasses cache (admin-preview flow)", async () => {
    setupAccount()
    positionFindManyMock.mockResolvedValue([{ unrealizedPnL: new Prisma.Decimal(0) }])

    await getTodayPnLSummary("u-1")
    await getTodayPnLSummary("u-1", { maxAgeMs: 0 })

    // First call: 2 position findMany. Second with maxAgeMs:0: 2 more.
    expect(positionFindManyMock).toHaveBeenCalledTimes(4)
  })
})
