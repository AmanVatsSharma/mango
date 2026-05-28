/**
 * File:        tests/risk/margin-calculator-user-max-leverage.test.ts
 * Module:      Risk · MarginCalculator · per-user maxLeverage clamp
 * Purpose:     Trading-woj — proves the new userMaxLeverage parameter clamps
 *              the segment leverage so a per-user cap actually limits the
 *              effective leverage applied at order admission. Pre-fix
 *              RiskLimit.maxLeverage was stored but never read.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (mocks Prisma + order-charges loader)
 *
 * Key invariants:
 *   - Default (no userMaxLeverage) preserves pre-fix behavior — segment
 *     leverage applies (regression safety for ~12 other call sites)
 *   - When userMaxLeverage > segment leverage → segment wins (no harm to user)
 *   - When userMaxLeverage < segment leverage → user cap wins (real clamp)
 *   - userMaxLeverage ≤ 1 (default RiskLimit row) treated as "no opinion"
 *     so we never accidentally force everyone to 1x
 *
 * Read order:
 *   1. mocks block
 *   2. tests in "no-clamp / clamp-applies / no-opinion" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { Prisma } from "@prisma/client"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { prisma } from "@/lib/prisma"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"

jest.mock("@/lib/server/get-order-charges-config", () => ({
  getOrderChargesConfig: jest.fn(async () => DEFAULT_ORDER_CHARGES_CONFIG_V1),
}))

const riskRow = (productType: string, leverage: number) => ({
  id: `cfg-${productType}`,
  segment: "NSE",
  productType,
  leverage: new Prisma.Decimal(leverage),
  marginRate: null,
  minMarginPerLot: null,
  brokerageFlat: new Prisma.Decimal(20),
  brokerageRate: null,
  brokerageCap: null,
  maxOrderValue: null,
  maxPositions: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe("MarginCalculator userMaxLeverage clamp", () => {
  const calculator = new MarginCalculator()

  beforeEach(() => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      // Segment: 100x leverage → ₹10000 turnover ÷ 100 = ₹100 base margin
      riskRow("MIS", 100),
    ] as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("default (no clamp passed) preserves segment leverage = 100x", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.leverage).toBe(100)
    expect(result.requiredMargin).toBe(100) // 10000/100
  })

  it("user cap of 50x clamps segment 100x → effective 50x (margin doubles)", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, 50)
    expect(result.leverage).toBe(50)
    expect(result.requiredMargin).toBe(200) // 10000/50
  })

  it("user cap of 200x is ABOVE segment 100x → segment wins (no harm)", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, 200)
    expect(result.leverage).toBe(100)
    expect(result.requiredMargin).toBe(100)
  })

  it("user cap = 1 (RiskLimit default) is treated as 'no opinion' — segment wins", async () => {
    // Critical regression guard: prevents accidentally forcing every user
    // (most have default RiskLimit.maxLeverage = 1) to literal 1x leverage.
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, 1)
    expect(result.leverage).toBe(100) // not 1
  })

  it("user cap = 0 / NaN / negative → no clamp (safe default)", async () => {
    const a = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, 0)
    const b = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, NaN)
    const c = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, undefined, -10)
    expect(a.leverage).toBe(100)
    expect(b.leverage).toBe(100)
    expect(c.leverage).toBe(100)
  })

  it("clamp composes with marginMultiplier (clamp first, multiplier second)", async () => {
    // user cap 50x → effective leverage 50x → base margin = 10000/50 = 200
    // marginMultiplier 2x → final = 400
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 2, 50)
    expect(result.leverage).toBe(50)
    expect(result.requiredMargin).toBe(400)
  })
})
