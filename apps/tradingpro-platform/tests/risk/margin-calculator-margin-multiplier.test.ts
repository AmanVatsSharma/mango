/**
 * File:        tests/risk/margin-calculator-margin-multiplier.test.ts
 * Module:      Risk · MarginCalculator · admin marginMultiplier
 * Purpose:     Regression for Trading-bry — admin per-user/per-segment margin
 *              multiplier (resolveMarketControls().marginMultiplier) was
 *              previously snapshotted to executionContext but never applied
 *              to actual required margin. This suite proves it now is.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (mocks Prisma + order-charges loader)
 *
 * Key invariants:
 *   - Default (no multiplier passed) preserves pre-fix margin (regression safety
 *     for the dozen other call sites that pass 7 args, not 8)
 *   - 2x multiplier exactly doubles requiredMargin
 *   - 0.5x multiplier exactly halves requiredMargin
 *   - Out-of-range values (< 0.5 or > 5) are clamped, not silently accepted
 *
 * Read order:
 *   1. mocks block
 *   2. tests in "happy / clamp / no-op" order
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

describe("MarginCalculator admin marginMultiplier", () => {
  const calculator = new MarginCalculator()

  beforeEach(() => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      // 100x leverage → ₹10000 turnover ÷ 100 = ₹100 base margin
      riskRow("MIS", 100),
    ] as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("default behavior (no multiplier passed) is unchanged from pre-fix", async () => {
    const baseline = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(baseline.requiredMargin).toBe(100)
  })

  it("explicit multiplier of 1 is a no-op (parity with default)", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 1)
    expect(result.requiredMargin).toBe(100)
  })

  it("2x multiplier doubles requiredMargin", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 2)
    expect(result.requiredMargin).toBe(200)
  })

  it("0.5x multiplier halves requiredMargin", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 0.5)
    expect(result.requiredMargin).toBe(50)
  })

  it("clamps multipliers > 5 down to 5 (prevents runaway margin demands)", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 100)
    expect(result.requiredMargin).toBe(500) // capped at 5x, not 100x
  })

  it("clamps multipliers < 0.5 up to 0.5 (prevents zero/negative margin)", async () => {
    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 0.01)
    expect(result.requiredMargin).toBe(50) // floored at 0.5x
  })

  it("treats invalid (NaN, negative, zero) multipliers as 1 (safe default)", async () => {
    const nan = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, NaN)
    const neg = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, -5)
    const zero = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {}, 0)
    expect(nan.requiredMargin).toBe(100)
    expect(neg.requiredMargin).toBe(100)
    expect(zero.requiredMargin).toBe(100)
  })
})
