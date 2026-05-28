/**
 * File:        tests/services/risk/risk-thresholds-resolver.test.ts
 * Module:      Tests · Risk Management · ThresholdsResolver
 * Purpose:     Unit tests for resolveThresholdsForUser — per-user override vs. global fallback logic.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/lib/prisma                          — mocked
 *   - @/lib/services/risk/risk-thresholds   — mocked
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - NULL per-user fields always fall through to global/default values
 *   - "source" field correctly reflects per-user / global / mixed state
 *
 * Read order:
 *   1. describe("resolveThresholdsForUser") — three cases
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

const mockFindUnique = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    riskLimit: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

jest.mock("@/lib/services/risk/risk-thresholds", () => ({
  getRiskThresholds: jest.fn(),
}))

import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { resolveThresholdsForUser } from "@/lib/services/risk/risk-thresholds-resolver"

const mockGetRiskThresholds = getRiskThresholds as jest.Mock

const GLOBAL_THRESHOLDS = {
  warningThreshold: 0.75,
  autoCloseThreshold: 0.80,
  source: "default" as const,
}

describe("resolveThresholdsForUser", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRiskThresholds.mockResolvedValue(GLOBAL_THRESHOLDS)
  })

  it("returns global values when no RiskLimit row exists (all NULLs)", async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await resolveThresholdsForUser("user-no-limit")

    expect(result.source).toBe("global")
    expect(result.riskLevelHighPct).toBeCloseTo(75, 5)     // warningThreshold * 100
    expect(result.autoCloseLevelPct).toBeCloseTo(80, 5)    // autoCloseThreshold * 100
    expect(result.maxDailyLossInr).toBeNull()
    // Low and medium fall back to env defaults (30 / 60 when env not set in CI)
    expect(typeof result.riskLevelLowPct).toBe("number")
    expect(typeof result.riskLevelMediumPct).toBe("number")
  })

  it("returns per-user values when all five overrides are set, source: 'per-user'", async () => {
    mockFindUnique.mockResolvedValue({
      userId: "user-full-override",
      riskLevelLowPct: 20,
      riskLevelMediumPct: 50,
      riskLevelHighPct: 70,
      autoCloseLevelPct: 85,
      maxDailyLossInr: 50000,
    })

    const result = await resolveThresholdsForUser("user-full-override")

    expect(result.source).toBe("per-user")
    expect(result.riskLevelLowPct).toBe(20)
    expect(result.riskLevelMediumPct).toBe(50)
    expect(result.riskLevelHighPct).toBe(70)
    expect(result.autoCloseLevelPct).toBe(85)
    expect(result.maxDailyLossInr).toBe(50000)
  })

  it("returns mixed values when only riskLevelHighPct is set, source: 'mixed'", async () => {
    mockFindUnique.mockResolvedValue({
      userId: "user-partial",
      riskLevelLowPct: null,
      riskLevelMediumPct: null,
      riskLevelHighPct: 65,
      autoCloseLevelPct: null,
      maxDailyLossInr: null,
    })

    const result = await resolveThresholdsForUser("user-partial")

    expect(result.source).toBe("mixed")
    expect(result.riskLevelHighPct).toBe(65)               // per-user override
    expect(result.autoCloseLevelPct).toBeCloseTo(80, 5)    // falls back to global
    expect(result.maxDailyLossInr).toBeNull()              // no override
  })
})
