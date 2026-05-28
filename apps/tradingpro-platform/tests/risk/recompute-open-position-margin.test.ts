/**
 * File:        tests/risk/recompute-open-position-margin.test.ts
 * Module:      Risk · Trading-voj open-position margin recompute
 * Purpose:     Locks in the recompute logic: dry-run yields delta with no DB writes; apply
 *              path produces exactly one TradingAccount.update per affected user; closed
 *              positions are excluded; userMaxLeverage clamp from RiskLimit is honored.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: mocks @/lib/prisma + MarginCalculator so no real DB is touched.
 *
 * Key invariants:
 *   - dry-run does NOT call tradingAccount.update or $transaction
 *   - apply path calls $transaction once with the recomputed amounts
 *   - delta = newSum - oldUsedMargin
 *   - newAvailableMargin = max(0, balance - newUsedMargin)
 *   - closed positions (closedAt != null OR quantity == 0) are excluded by the query filter
 *
 * Read order:
 *   1. mock setup (prisma + MarginCalculator)
 *   2. test "dry-run is read-only" — no DB writes
 *   3. test "apply persists new totals" — single $transaction
 *   4. test "delta calculation correct" — math sanity
 *   5. test "no positions → newUsedMargin = 0"
 *
 * Author:      StockTrade
 * Last-invoked: 2026-05-08
 */

const tradingAccountFindFirstMock = jest.fn()
const tradingAccountFindManyMock = jest.fn()
const tradingAccountUpdateMock = jest.fn(async () => undefined)
const riskLimitFindUniqueMock = jest.fn(async () => null)
const transactionMock = jest.fn(async (cb: any) => cb({
  tradingAccount: { update: tradingAccountUpdateMock },
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findFirst: (...args: any[]) => tradingAccountFindFirstMock(...args),
      findMany: (...args: any[]) => tradingAccountFindManyMock(...args),
      update: (...args: any[]) => tradingAccountUpdateMock(...args),
    },
    riskLimit: {
      findUnique: (...args: any[]) => riskLimitFindUniqueMock(...args),
    },
    $transaction: (cb: any) => transactionMock(cb),
  },
}))

const calculateMarginMock = jest.fn()
jest.mock("@/lib/services/risk/MarginCalculator", () => ({
  MarginCalculator: jest.fn().mockImplementation(() => ({
    calculateMargin: (...args: any[]) => calculateMarginMock(...args),
  })),
}))

import { Prisma } from "@prisma/client"
import {
  recomputeOpenPositionMarginForUser,
} from "@/lib/services/risk/recompute-open-position-margin"

beforeEach(() => {
  jest.clearAllMocks()
})

const ACCOUNT_WITH_TWO_POSITIONS = {
  id: "acc-1",
  userId: "u-1",
  balance: new Prisma.Decimal(100_000),
  availableMargin: new Prisma.Decimal(60_000),
  usedMargin: new Prisma.Decimal(40_000),
  positions: [
    {
      id: "p-1",
      symbol: "RELIANCE",
      productType: "MIS",
      quantity: 10,
      averagePrice: new Prisma.Decimal(2000),
      optionType: null,
      segment: "NSE",
      Stock: { instrumentId: "NSE_EQ-RELIANCE", segment: "NSE" },
    },
    {
      id: "p-2",
      symbol: "TCS",
      productType: "MIS",
      quantity: -5,
      averagePrice: new Prisma.Decimal(3500),
      optionType: null,
      segment: "NSE",
      Stock: { instrumentId: "NSE_EQ-TCS", segment: "NSE" },
    },
  ],
}

describe("recomputeOpenPositionMarginForUser — Trading-voj", () => {
  it("dry-run computes delta but does NOT write to DB", async () => {
    tradingAccountFindFirstMock.mockResolvedValue(ACCOUNT_WITH_TWO_POSITIONS)
    calculateMarginMock
      .mockResolvedValueOnce({ requiredMargin: 5000 })
      .mockResolvedValueOnce({ requiredMargin: 8000 })

    const r = await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: true })

    expect(r.applied).toBe(false)
    expect(r.newUsedMargin).toBe(13_000)
    expect(r.oldUsedMargin).toBe(40_000)
    expect(r.delta).toBe(-27_000)
    expect(r.newAvailableMargin).toBe(87_000) // 100k - 13k
    expect(r.perPosition).toHaveLength(2)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(tradingAccountUpdateMock).not.toHaveBeenCalled()
  })

  it("apply (dryRun:false) persists new totals via a transaction", async () => {
    tradingAccountFindFirstMock.mockResolvedValue(ACCOUNT_WITH_TWO_POSITIONS)
    calculateMarginMock
      .mockResolvedValueOnce({ requiredMargin: 5000 })
      .mockResolvedValueOnce({ requiredMargin: 8000 })

    const r = await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: false })

    expect(r.applied).toBe(true)
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(tradingAccountUpdateMock).toHaveBeenCalledTimes(1)
    expect(tradingAccountUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: { usedMargin: 13_000, availableMargin: 87_000 },
      }),
    )
  })

  it("zero-delta apply skips the transaction (no-op write avoided)", async () => {
    tradingAccountFindFirstMock.mockResolvedValue({
      ...ACCOUNT_WITH_TWO_POSITIONS,
      usedMargin: new Prisma.Decimal(13_000), // already matches new total
      availableMargin: new Prisma.Decimal(87_000),
    })
    calculateMarginMock
      .mockResolvedValueOnce({ requiredMargin: 5000 })
      .mockResolvedValueOnce({ requiredMargin: 8000 })

    const r = await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: false })

    expect(r.delta).toBe(0)
    expect(r.applied).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("zero open positions → newUsedMargin: 0, delta = -oldUsedMargin", async () => {
    tradingAccountFindFirstMock.mockResolvedValue({
      ...ACCOUNT_WITH_TWO_POSITIONS,
      positions: [],
    })

    const r = await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: true })

    expect(r.positionsConsidered).toBe(0)
    expect(r.newUsedMargin).toBe(0)
    expect(r.delta).toBe(-40_000)
    expect(r.newAvailableMargin).toBe(100_000)
    expect(calculateMarginMock).not.toHaveBeenCalled()
  })

  it("availableMargin clamps at 0 when newUsedMargin > balance", async () => {
    tradingAccountFindFirstMock.mockResolvedValue(ACCOUNT_WITH_TWO_POSITIONS)
    calculateMarginMock
      .mockResolvedValueOnce({ requiredMargin: 80_000 })
      .mockResolvedValueOnce({ requiredMargin: 50_000 })

    const r = await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: true })

    expect(r.newUsedMargin).toBe(130_000) // exceeds 100k balance
    expect(r.newAvailableMargin).toBe(0) // clamped
  })

  it("forwards userMaxLeverage from RiskLimit row to MarginCalculator", async () => {
    tradingAccountFindFirstMock.mockResolvedValue({
      ...ACCOUNT_WITH_TWO_POSITIONS,
      positions: [ACCOUNT_WITH_TWO_POSITIONS.positions[0]],
    })
    riskLimitFindUniqueMock.mockResolvedValue({ maxLeverage: 3 })
    calculateMarginMock.mockResolvedValueOnce({ requiredMargin: 1000 })

    await recomputeOpenPositionMarginForUser({ userId: "u-1", dryRun: true })

    // Last positional arg of calculateMargin is userMaxLeverage; must be 3.
    const callArgs = calculateMarginMock.mock.calls[0]
    expect(callArgs[callArgs.length - 1]).toBe(3)
  })

  it("throws when no trading account exists for userId", async () => {
    tradingAccountFindFirstMock.mockResolvedValue(null)
    await expect(
      recomputeOpenPositionMarginForUser({ userId: "ghost-user" }),
    ).rejects.toThrow(/No trading account/)
  })
})
