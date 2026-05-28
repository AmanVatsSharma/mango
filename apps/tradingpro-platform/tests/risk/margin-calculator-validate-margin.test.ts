/**
 * @file margin-calculator-validate-margin.test.ts
 * @module tests-risk
 * @description Unit tests for MarginCalculator.validateMargin fund guards.
 * @author StockTrade
 * @created 2026-04-06
 */

import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { prisma } from "@/lib/prisma"

describe("MarginCalculator.validateMargin", () => {
  const calculator = new MarginCalculator()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("throws NegativeBalanceTradingError when cash balance is negative", async () => {
    jest.spyOn(prisma.tradingAccount, "findUnique").mockResolvedValue({
      balance: -100,
      availableMargin: 1_000_000,
    } as any)

    await expect(calculator.validateMargin("acct-1", 100, 10)).rejects.toMatchObject({
      statusCode: 403,
      name: "NegativeBalanceTradingError",
    })
  })

  it("does not throw when balance is zero and margin is sufficient", async () => {
    jest.spyOn(prisma.tradingAccount, "findUnique").mockResolvedValue({
      balance: 0,
      availableMargin: 500,
    } as any)

    const result = await calculator.validateMargin("acct-2", 100, 50)
    expect(result.isValid).toBe(true)
    expect(result.shortfall).toBe(0)
  })
})
