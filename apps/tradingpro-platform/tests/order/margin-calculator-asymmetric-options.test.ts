/**
 * @file margin-calculator-asymmetric-options.test.ts
 * @module tests-order
 * @description MarginCalculator resolves different RiskConfig rows for option BUY vs SELL (NRML_OPT_BUY vs NRML_OPT_SELL).
 * @author StockTrade
 * @created 2026-04-08
 * @updated 2026-04-08 — `minMarginPerLot` floor on short options.
 */

import { Prisma } from "@prisma/client"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { prisma } from "@/lib/prisma"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
// Trading-ee3 / Trading-1z9: MarginCalculator now goes through the shared cached loader,
// so each test must reset the cache to avoid leaking the previous test's mocked row
// (the cache key is segment+productType-candidate and would otherwise dedupe across tests).
import { __resetRiskConfigCacheForTests } from "@/lib/services/risk/risk-config-cache"

jest.mock("@/lib/server/get-order-charges-config", () => ({
  getOrderChargesConfig: jest.fn(async () => DEFAULT_ORDER_CHARGES_CONFIG_V1),
}))

// Suppress the cache's pubsub subscriber attempt.
jest.mock("@/lib/services/risk/risk-config-pubsub", () => ({
  publishRiskConfigChanged: jest.fn(async () => undefined),
  subscribeRiskConfigChanged: jest.fn(async () => () => undefined),
  publishRiskThresholdsChanged: jest.fn(async () => undefined),
  subscribeRiskThresholdsChanged: jest.fn(async () => () => undefined),
  RISK_CONFIG_CHANNEL: "risk-config:changed",
  RISK_THRESHOLDS_CHANNEL: "risk-thresholds:changed",
}))

const riskRow = (productType: string, leverage: number, minMarginPerLot: Prisma.Decimal | null = null) => ({
  id: `cfg-${productType}`,
  segment: "NFO",
  productType,
  leverage: new Prisma.Decimal(leverage),
  marginRate: null,
  minMarginPerLot,
  brokerageFlat: new Prisma.Decimal(20),
  brokerageRate: null,
  brokerageCap: null,
  maxOrderValue: null,
  maxPositions: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe("MarginCalculator asymmetric NRML_OPT_BUY vs NRML_OPT_SELL", () => {
  const calculator = new MarginCalculator()

  beforeEach(() => {
    __resetRiskConfigCacheForTests()
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("NRML_OPT_BUY", 50),
      riskRow("NRML_OPT_SELL", 25),
      riskRow("NRML_OPT", 100),
    ] as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("uses higher margin (lower leverage divisor) for short-side option row when marginRiskSide is SELL", async () => {
    const buyMargin = await calculator.calculateMargin("NFO", "NRML", 1, 10_000, 1, "BUY", {
      optionType: "CE",
      marginRiskSide: "BUY",
    })
    const sellMargin = await calculator.calculateMargin("NFO", "NRML", 1, 10_000, 1, "BUY", {
      optionType: "CE",
      marginRiskSide: "SELL",
    })

    expect(buyMargin.requiredMargin).toBe(Math.floor(10_000 / 50))
    expect(sellMargin.requiredMargin).toBe(Math.floor(10_000 / 25))
    expect(sellMargin.requiredMargin).toBeGreaterThan(buyMargin.requiredMargin)
  })

  it("defaults marginRiskSide from orderSide for placement when instrument omits marginRiskSide", async () => {
    const longPlacement = await calculator.calculateMargin("NFO", "NRML", 1, 10_000, 1, "BUY", {
      optionType: "CE",
    })
    const shortPlacement = await calculator.calculateMargin("NFO", "NRML", 1, 10_000, 1, "SELL", {
      optionType: "CE",
    })

    expect(longPlacement.requiredMargin).toBe(Math.floor(10_000 / 50))
    expect(shortPlacement.requiredMargin).toBe(Math.floor(10_000 / 25))
  })

  it("applies minMarginPerLot floor when short CE base margin from premium is below floor", async () => {
    // The beforeEach mock seeds default rows + the cache. Since this `it` block resets the
    // mock to a different row set, we must also bust the cache so the new mock takes effect.
    __resetRiskConfigCacheForTests()
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("NRML_OPT_SELL", 100, new Prisma.Decimal(8000)),
    ] as any)
    const res = await calculator.calculateMargin("NFO", "NRML", 50, 0.01, 50, "SELL", { optionType: "CE" })
    expect(res.turnover).toBeCloseTo(0.5, 5)
    expect(res.requiredMargin).toBe(8000)
  })
})
