/**
 * File:        tests/risk/risk-config-cache.test.ts
 * Module:      Risk · risk-config-cache · Trading-ee3 + Trading-1z9 hardening
 * Purpose:     Locks in the behaviour of the shared cached RiskConfig loader:
 *               - DB is hit at most once per cache window (30s)
 *               - bustRiskConfigCache() invalidates immediately
 *               - resolveActiveRiskConfigForInstrument() now delegates to the same loader
 *                 (back-compat shim) — proves Trading-1z9 dedup didn't change semantics
 *
 * Exports:     none (Jest)
 *
 * Side-effects: stubs PrismaClient with a mock findMany; mutates global cache state.
 *
 * Key invariants:
 *   - First call after bust → 1 DB hit
 *   - Second call within TTL → 0 DB hits (cache hit)
 *   - bustRiskConfigCache() sets miss count to expected value on next call
 *   - shim returns null when loader returns null
 *   - shim's projection includes id, segment, productType, leverage, marginRate, minMarginPerLot
 *
 * Read order:
 *   1. fakePrisma builder (mock findMany)
 *   2. cache hit/miss tests
 *   3. bust test
 *   4. shim back-compat tests
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

// Mock the pubsub helper so tests don't try to talk to Redis.
jest.mock("@/lib/services/risk/risk-config-pubsub", () => ({
  publishRiskConfigChanged: jest.fn(async () => undefined),
  subscribeRiskConfigChanged: jest.fn(async () => () => undefined),
  publishRiskThresholdsChanged: jest.fn(async () => undefined),
  subscribeRiskThresholdsChanged: jest.fn(async () => () => undefined),
  RISK_CONFIG_CHANNEL: "risk-config:changed",
  RISK_THRESHOLDS_CHANNEL: "risk-thresholds:changed",
}))

import {
  loadActiveRiskConfigForInstrument,
  bustRiskConfigCache,
  __resetRiskConfigCacheForTests,
  getRiskConfigCacheStats,
} from "@/lib/services/risk/risk-config-cache"
import { resolveActiveRiskConfigForInstrument } from "@/lib/services/risk/risk-config-resolve-active"

function makeFakePrisma(rows: any[]) {
  return {
    riskConfig: {
      findMany: jest.fn(async () => rows),
    },
  } as any
}

const SAMPLE_ROW = {
  id: "rc-1",
  segment: "NSE",
  productType: "MIS",
  leverage: { toString: () => "5" } as any,
  marginRate: null,
  minMarginPerLot: null,
  brokerageFlat: null,
  brokerageRate: null,
  brokerageCap: null,
  maxOrderValue: null,
  maxPositions: null,
  active: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
}

beforeEach(() => {
  __resetRiskConfigCacheForTests()
})

describe("loadActiveRiskConfigForInstrument — Trading-ee3 cache + Trading-1z9 dedup", () => {
  it("hits the DB once and serves the second call from cache", async () => {
    const prisma = makeFakePrisma([SAMPLE_ROW])

    const a = await loadActiveRiskConfigForInstrument({
      prisma,
      segment: "NSE",
      productType: "MIS",
    })
    const b = await loadActiveRiskConfigForInstrument({
      prisma,
      segment: "NSE",
      productType: "MIS",
    })

    expect(a?.id).toBe("rc-1")
    expect(b?.id).toBe("rc-1")
    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(1)

    const stats = getRiskConfigCacheStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  })

  it("bustRiskConfigCache forces the next call to hit DB again", async () => {
    const prisma = makeFakePrisma([SAMPLE_ROW])

    await loadActiveRiskConfigForInstrument({ prisma, segment: "NSE", productType: "MIS" })
    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(1)

    await bustRiskConfigCache({ summary: "test" })

    await loadActiveRiskConfigForInstrument({ prisma, segment: "NSE", productType: "MIS" })
    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(2)

    expect(getRiskConfigCacheStats().busts).toBeGreaterThanOrEqual(1)
  })

  it("maxAgeMs:0 bypasses cache (admin-preview flow)", async () => {
    const prisma = makeFakePrisma([SAMPLE_ROW])

    await loadActiveRiskConfigForInstrument({ prisma, segment: "NSE", productType: "MIS" })
    await loadActiveRiskConfigForInstrument({
      prisma,
      segment: "NSE",
      productType: "MIS",
      maxAgeMs: 0,
    })

    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(2)
  })

  it("caches null misses (segments with no row don't pummel DB)", async () => {
    const prisma = makeFakePrisma([])

    const first = await loadActiveRiskConfigForInstrument({
      prisma,
      segment: "UNKNOWN",
      productType: "MIS",
    })
    const second = await loadActiveRiskConfigForInstrument({
      prisma,
      segment: "UNKNOWN",
      productType: "MIS",
    })

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(1)
  })
})

describe("resolveActiveRiskConfigForInstrument — Trading-1z9 back-compat shim", () => {
  it("returns the same projection shape as before (id, segment, productType, leverage, marginRate, minMarginPerLot)", async () => {
    const prisma = makeFakePrisma([SAMPLE_ROW])
    const out = await resolveActiveRiskConfigForInstrument(prisma, "NSE", "MIS")
    expect(out).toEqual({
      id: "rc-1",
      segment: "NSE",
      productType: "MIS",
      leverage: SAMPLE_ROW.leverage,
      marginRate: null,
      minMarginPerLot: null,
    })
  })

  it("returns null when no row matches", async () => {
    const prisma = makeFakePrisma([])
    const out = await resolveActiveRiskConfigForInstrument(prisma, "NOTHING", "MIS")
    expect(out).toBeNull()
  })

  it("uses the same cache as loadActiveRiskConfigForInstrument", async () => {
    const prisma = makeFakePrisma([SAMPLE_ROW])
    await loadActiveRiskConfigForInstrument({ prisma, segment: "NSE", productType: "MIS" })
    await resolveActiveRiskConfigForInstrument(prisma, "NSE", "MIS")
    // Both paths should hit the same cache key → only one DB call total.
    expect(prisma.riskConfig.findMany).toHaveBeenCalledTimes(1)
  })
})
