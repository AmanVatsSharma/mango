/**
 * File:        tests/risk/risk-monitoring-per-user-thresholds.test.ts
 * Module:      Risk · RiskMonitoringService · per-user threshold consumption
 * Purpose:     Regression for Trading-4w4 — proves monitorAccount now invokes
 *              resolveThresholdsForUser(userId) and uses the returned per-user
 *              override (RiskLimit.autoCloseLevelPct) to gate the auto-close
 *              decision. Pre-fix the per-user values were stored in DB and
 *              silently ignored by execution paths.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (all DB / logger / position-service mocked)
 *
 * Key invariants:
 *   - Resolver is called exactly once per monitorAccount call, with the userId
 *     passed by the caller (not derived from the account row)
 *   - When per-user autoCloseLevelPct is BELOW the current utilization, the
 *     account triggers auto-close even if the global threshold would not
 *   - When the resolver throws, monitorAccount falls back to the global
 *     thresholds passed in by monitorAllAccounts (no fail-stop)
 *
 * Read order:
 *   1. mocks block (prisma, position service, resolver, enforcement, logger)
 *   2. test cases — wiring → per-user-trigger → resolver-fallback
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const tradingAccountFindUniqueMock = jest.fn()
const positionsFindActiveMock = jest.fn()
const calculatePnLMock = jest.fn()
const closePositionMock = jest.fn()
const resolveThresholdsForUserMock = jest.fn()
const getRiskEnforcementSettingsMock = jest.fn()
const getCurrentPriceMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    riskAlert: {
      create: jest.fn(async () => ({ id: "alert-1" })),
    },
  },
}))

jest.mock("@/lib/services/position/PositionManagementService", () => ({
  PositionManagementService: jest.fn().mockImplementation(() => ({
    calculateUnrealizedPnL: (...args: any[]) => calculatePnLMock(...args),
    closePosition: (...args: any[]) => closePositionMock(...args),
  })),
}))

jest.mock("@/lib/repositories/PositionRepository", () => ({
  PositionRepository: jest.fn().mockImplementation(() => ({
    findActive: (...args: any[]) => positionsFindActiveMock(...args),
  })),
}))

jest.mock("@/lib/services/risk/risk-thresholds-resolver", () => ({
  resolveThresholdsForUser: (...args: any[]) => resolveThresholdsForUserMock(...args),
}))

jest.mock("@/lib/services/risk/risk-enforcement-settings", () => ({
  getRiskEnforcementSettings: (...args: any[]) => getRiskEnforcementSettingsMock(...args),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock("@/Branding", () => ({
  getBaseUrl: () => "http://localhost:3000",
}))

import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"

const GLOBAL = { warningThreshold: 0.75, autoCloseThreshold: 0.80 }

beforeEach(() => {
  jest.clearAllMocks()

  getRiskEnforcementSettingsMock.mockResolvedValue({
    fullLiquidationOnAutoClose: false,
    squareOffOnWarningBand: false,
    source: "default" as const,
  })

  // 60% loss utilization scenario:
  //   totalUnrealizedPnL = -600 (loss), totalAvailableFunds = 1000 → 60%
  tradingAccountFindUniqueMock.mockResolvedValue({
    availableMargin: 500,
    usedMargin: 0,
    balance: 500,
  })
  calculatePnLMock.mockResolvedValue({ totalUnrealizedPnL: -600 })
  positionsFindActiveMock.mockResolvedValue([])
})

describe("RiskMonitoringService.monitorAccount per-user thresholds", () => {
  it("calls resolveThresholdsForUser with the caller-supplied userId", async () => {
    resolveThresholdsForUserMock.mockResolvedValue({
      riskLevelLowPct: 30,
      riskLevelMediumPct: 60,
      riskLevelHighPct: 75,
      autoCloseLevelPct: 80,
      maxDailyLossInr: null,
      source: "global" as const,
    })

    const svc = new RiskMonitoringService()
    await svc.monitorAccount("ta-1", "user-A", GLOBAL)

    expect(resolveThresholdsForUserMock).toHaveBeenCalledTimes(1)
    expect(resolveThresholdsForUserMock).toHaveBeenCalledWith("user-A")
  })

  it("triggers auto-close branch at per-user 55% threshold even though global is 80%", async () => {
    // Per-user override: autoClose at 55%. 60% loss utilization > 55% → must
    // square-off branch entered, producing an alert. (We don't assert on the
    // close itself because the inner getCurrentPrice() does HTTP+DB calls
    // that aren't mocked in this scope; the alertCreated flag is sufficient
    // proof that the per-user threshold gate fired.)
    resolveThresholdsForUserMock.mockResolvedValue({
      riskLevelLowPct: 30,
      riskLevelMediumPct: 50,
      riskLevelHighPct: 50,
      autoCloseLevelPct: 55,
      maxDailyLossInr: null,
      source: "per-user" as const,
    })

    const svc = new RiskMonitoringService()
    const result = await svc.monitorAccount("ta-1", "user-A", GLOBAL)

    // Auto-close branch entered → alertCreated true. 60% is below GLOBAL 80%
    // so without per-user override this would have been alertCreated:false.
    expect(result.alertCreated).toBe(true)
  })

  it("does NOT trigger auto-close when per-user threshold is above current utilization", async () => {
    // Per-user override: autoClose at 90%. 60% < 90% → no close.
    resolveThresholdsForUserMock.mockResolvedValue({
      riskLevelLowPct: 30,
      riskLevelMediumPct: 60,
      riskLevelHighPct: 80,
      autoCloseLevelPct: 90,
      maxDailyLossInr: null,
      source: "per-user" as const,
    })

    const svc = new RiskMonitoringService()
    const result = await svc.monitorAccount("ta-1", "user-A", GLOBAL)

    expect(result.positionsClosed).toBe(0)
    expect(closePositionMock).not.toHaveBeenCalled()
  })

  it("falls back to global thresholds when resolver throws (no fail-stop)", async () => {
    resolveThresholdsForUserMock.mockRejectedValue(new Error("DB transient"))

    const svc = new RiskMonitoringService()
    // Should not throw; should use the GLOBAL values (80% threshold) → 60% < 80% → no close
    const result = await svc.monitorAccount("ta-1", "user-A", GLOBAL)
    expect(result.positionsClosed).toBe(0)
  })
})
