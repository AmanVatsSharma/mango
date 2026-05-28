/**
 * File:        tests/risk/margin-calculator-segment-caps.test.ts
 * Module:      Risk · MarginCalculator · per-segment caps surfacing
 * Purpose:     Trading-vsb — proves MarginCalculator now exposes the
 *              maxOrderValue and maxPositions per-segment caps from the
 *              resolved RiskConfig row, so OrderExecutionService can enforce
 *              them at admission without a second DB roundtrip. Pre-fix the
 *              fields were stored but never read at execution time.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (mocks Prisma + order-charges loader)
 *
 * Key invariants:
 *   - When RiskConfig.maxOrderValue is set → returned on MarginCalculation
 *   - When RiskConfig.maxOrderValue is null/0/negative → returned as null
 *     (so callers can use a single `if (cap > 0)` check)
 *   - Same semantics for maxPositions (plus integer-truncation safety)
 *   - When no RiskConfig row matches at all → both fields are null (no
 *     accidental enforcement against a fictional cap)
 *
 * Read order:
 *   1. mocks block
 *   2. tests in "set / null / no-row / boundary" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { Prisma } from "@prisma/client"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { prisma } from "@/lib/prisma"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
// Trading-ee3 / Trading-1z9: MarginCalculator now reads through the shared cached loader,
// so each test must reset that cache to avoid leaking the previous test's mocked row.
import { __resetRiskConfigCacheForTests } from "@/lib/services/risk/risk-config-cache"

jest.mock("@/lib/server/get-order-charges-config", () => ({
  getOrderChargesConfig: jest.fn(async () => DEFAULT_ORDER_CHARGES_CONFIG_V1),
}))

// Suppress the cache's pubsub subscriber attempt (mocks the redis-client transitively).
jest.mock("@/lib/services/risk/risk-config-pubsub", () => ({
  publishRiskConfigChanged: jest.fn(async () => undefined),
  subscribeRiskConfigChanged: jest.fn(async () => () => undefined),
  publishRiskThresholdsChanged: jest.fn(async () => undefined),
  subscribeRiskThresholdsChanged: jest.fn(async () => () => undefined),
  RISK_CONFIG_CHANNEL: "risk-config:changed",
  RISK_THRESHOLDS_CHANNEL: "risk-thresholds:changed",
}))

beforeEach(() => {
  __resetRiskConfigCacheForTests()
})

const riskRow = (
  productType: string,
  leverage: number,
  caps: { maxOrderValue?: Prisma.Decimal | null; maxPositions?: number | null } = {},
) => ({
  id: `cfg-${productType}`,
  segment: "NSE",
  productType,
  leverage: new Prisma.Decimal(leverage),
  marginRate: null,
  minMarginPerLot: null,
  brokerageFlat: new Prisma.Decimal(20),
  brokerageRate: null,
  brokerageCap: null,
  maxOrderValue: caps.maxOrderValue ?? null,
  maxPositions: caps.maxPositions ?? null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe("MarginCalculator surfaces maxOrderValue + maxPositions", () => {
  const calculator = new MarginCalculator()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("when RiskConfig caps are set → both fields appear on MarginCalculation", async () => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("MIS", 100, {
        maxOrderValue: new Prisma.Decimal(500_000),
        maxPositions: 5,
      }),
    ] as any)

    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.maxOrderValue).toBe(500_000)
    expect(result.maxPositions).toBe(5)
  })

  it("when caps are null → both fields are null on the result", async () => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("MIS", 100), // caps default null
    ] as any)

    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.maxOrderValue).toBeNull()
    expect(result.maxPositions).toBeNull()
  })

  it("when caps are 0 → returned as null (callers use single 'cap > 0' check)", async () => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("MIS", 100, {
        maxOrderValue: new Prisma.Decimal(0),
        maxPositions: 0,
      }),
    ] as any)

    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.maxOrderValue).toBeNull()
    expect(result.maxPositions).toBeNull()
  })

  it("maxPositions is truncated to integer (defensive)", async () => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([
      riskRow("MIS", 100, {
        maxPositions: 7.9 as any, // Prisma Int @db won't allow this, but defend
      }),
    ] as any)

    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.maxPositions).toBe(7)
  })

  it("when no RiskConfig row matches → both caps are null (no false enforcement)", async () => {
    jest.spyOn(prisma.riskConfig, "findMany").mockResolvedValue([])

    const result = await calculator.calculateMargin("NSE", "MIS", 1, 10_000, 1, "BUY", {})
    expect(result.maxOrderValue).toBeNull()
    expect(result.maxPositions).toBeNull()
  })
})
