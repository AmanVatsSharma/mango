/**
 * File:        tests/risk/risk-monitoring-pino-sweep.test.ts
 * Module:      Risk · RiskMonitoringService · Trading-lne hot-loop log routing
 * Purpose:     Locks in Trading-lne: RiskMonitoringService no longer writes DB rows for the
 *              hot-loop observability log calls (start, account-scan, metrics, complete,
 *              fall-back warns, price-fail). These now go to in-process Pino. The DB-backed
 *              TradingLogger is preserved only for terminal audit events
 *              (auto-close breach/failure, warning-band breach, alert created/failed).
 *
 *              Pre-fix profile: 4 DB writes per account per cron tick on a 10K-account
 *              system = ~40K writes/min on the risk path.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: stubs the entire dependency chain (Prisma, PositionManagementService,
 *               TradingLogger) so the test exercises only the log-routing decision.
 *
 * Key invariants:
 *   - When NO threshold is breached, NO terminal-event TradingLogger calls happen
 *   - When the warning band IS breached but auto-close is not, ONE TradingLogger.warn
 *     (RISK_WARNING_BREACH) + TradingLogger.info (RISK_ALERT_CREATED) fire — that's it
 *   - When auto-close band IS breached, TradingLogger.warn (RISK_AUTO_CLOSE_BREACH) +
 *     TradingLogger.info (RISK_ALERT_CREATED) fire — that's it
 *   - The hot-loop sites (info/warn/debug calls per-account) NEVER go to TradingLogger
 *
 * Read order:
 *   1. mock setup (Prisma + PositionManagementService + TradingLogger spies)
 *   2. test "no breach → zero TradingLogger calls"
 *   3. test "warning breach → exactly the warning + alert TL calls"
 *   4. test "auto-close breach → exactly the breach + alert TL calls"
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { Prisma } from "@prisma/client"

const tradingAccountFindManyMock = jest.fn()
const tradingAccountFindUniqueMock = jest.fn()
const stockFindFirstMock = jest.fn()
const riskAlertCreateMock = jest.fn(async () => ({ id: "alert-1" }))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findMany: (...args: any[]) => tradingAccountFindManyMock(...args),
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    stock: {
      findFirst: (...args: any[]) => stockFindFirstMock(...args),
    },
    riskAlert: {
      create: (...args: any[]) => riskAlertCreateMock(...args),
    },
  },
}))

const positionRepoFindActive = jest.fn(async () => [])
jest.mock("@/lib/repositories/PositionRepository", () => ({
  PositionRepository: jest.fn().mockImplementation(() => ({
    findActive: (...args: any[]) => positionRepoFindActive(...args),
  })),
}))

const calcUnrealizedPnLMock = jest.fn()
const closePositionMock = jest.fn(async () => ({ id: "p-1" }))
jest.mock("@/lib/services/position/PositionManagementService", () => ({
  PositionManagementService: jest.fn().mockImplementation(() => ({
    calculateUnrealizedPnL: (...args: any[]) => calcUnrealizedPnLMock(...args),
    closePosition: (...args: any[]) => closePositionMock(...args),
  })),
}))

const enforcementMock = jest.fn(async () => ({
  fullLiquidationOnAutoClose: false,
  squareOffOnWarningBand: false,
  source: "default" as const,
}))
jest.mock("@/lib/services/risk/risk-enforcement-settings", () => ({
  getRiskEnforcementSettings: (...args: any[]) => enforcementMock(...args),
}))

const resolveThresholdsForUserMock = jest.fn(async () => ({
  riskLevelHighPct: 75,
  autoCloseLevelPct: 80,
  source: "global" as const,
}))
jest.mock("@/lib/services/risk/risk-thresholds-resolver", () => ({
  resolveThresholdsForUser: (...args: any[]) => resolveThresholdsForUserMock(...args),
}))

const serverMarketDataGetQuote = jest.fn(() => null)
jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => ({
    getQuote: (...args: any[]) => serverMarketDataGetQuote(...args),
  }),
}))

// Spy on the TradingLogger so we can assert *which* calls happened on the hot path.
const tlInfoMock = jest.fn(async () => undefined)
const tlWarnMock = jest.fn(async () => undefined)
const tlErrorMock = jest.fn(async () => undefined)
jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => ({
    info: (...args: any[]) => tlInfoMock(...args),
    warn: (...args: any[]) => tlWarnMock(...args),
    error: (...args: any[]) => tlErrorMock(...args),
    logOrder: jest.fn(async () => undefined),
    logPosition: jest.fn(async () => undefined),
    logFunds: jest.fn(async () => undefined),
    logTransaction: jest.fn(async () => undefined),
    logSystem: jest.fn(async () => undefined),
    debug: jest.fn(async () => undefined),
  })),
}))

import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"

beforeEach(() => {
  jest.clearAllMocks()
})

const HEALTHY_ACCOUNT = {
  id: "acc-1",
  user: { id: "u-1", name: "User One", email: "u1@x.com", clientId: null },
  positions: [
    { quantity: 1, Stock: { instrumentId: "NSE_EQ-26000", ltp: 100 } },
  ],
}

describe("Trading-lne — RiskMonitoringService hot-loop logs route to Pino, not DB", () => {
  it("healthy account (no breach) → ZERO TradingLogger calls (everything goes to Pino)", async () => {
    tradingAccountFindManyMock.mockResolvedValue([HEALTHY_ACCOUNT])
    tradingAccountFindUniqueMock.mockResolvedValue({
      availableMargin: new Prisma.Decimal(100_000),
      usedMargin: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(100_000),
    })
    calcUnrealizedPnLMock.mockResolvedValue({
      totalUnrealizedPnL: 0, // no loss → no breach
      positions: HEALTHY_ACCOUNT.positions,
    })

    const svc = new RiskMonitoringService()
    const result = await svc.monitorAllAccounts()

    expect(result.checkedAccounts).toBe(1)
    expect(result.alertsCreated).toBe(0)

    // The hot-loop logs (start, accounts-found, account-scan, metrics, complete) MUST NOT
    // hit the DB-backed logger. Trading-lne's whole point.
    expect(tlInfoMock).not.toHaveBeenCalled()
    expect(tlWarnMock).not.toHaveBeenCalled()
    expect(tlErrorMock).not.toHaveBeenCalled()
  })

  it("warning-band breach → exactly two TradingLogger calls (warn breach + info alert)", async () => {
    // Set a single account whose loss puts utilization in the warning band [75%, 80%).
    // funds = 100,000, loss = 76,000 → utilization 76%
    tradingAccountFindManyMock.mockResolvedValue([HEALTHY_ACCOUNT])
    tradingAccountFindUniqueMock.mockResolvedValue({
      availableMargin: new Prisma.Decimal(50_000),
      usedMargin: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(50_000),
    })
    calcUnrealizedPnLMock.mockResolvedValue({
      totalUnrealizedPnL: -76_000,
      positions: HEALTHY_ACCOUNT.positions,
    })

    const svc = new RiskMonitoringService()
    await svc.monitorAllAccounts()

    // Exactly one terminal warn (RISK_WARNING_BREACH) — no per-account/start/complete spam
    expect(tlWarnMock).toHaveBeenCalledTimes(1)
    expect(tlWarnMock.mock.calls[0][0]).toBe("RISK_WARNING_BREACH")

    // Exactly one alert info (RISK_ALERT_CREATED)
    expect(tlInfoMock).toHaveBeenCalledTimes(1)
    expect(tlInfoMock.mock.calls[0][0]).toBe("RISK_ALERT_CREATED")

    // No errors
    expect(tlErrorMock).not.toHaveBeenCalled()
  })

  it("auto-close band breach → exactly two TradingLogger calls (warn breach + info alert)", async () => {
    // funds = 100,000, loss = 85,000 → utilization 85% (>= 80% auto-close threshold)
    tradingAccountFindManyMock.mockResolvedValue([HEALTHY_ACCOUNT])
    tradingAccountFindUniqueMock.mockResolvedValue({
      availableMargin: new Prisma.Decimal(50_000),
      usedMargin: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(50_000),
    })
    calcUnrealizedPnLMock.mockResolvedValue({
      totalUnrealizedPnL: -85_000,
      positions: HEALTHY_ACCOUNT.positions,
    })
    positionRepoFindActive.mockResolvedValue([])

    const svc = new RiskMonitoringService()
    await svc.monitorAllAccounts()

    expect(tlWarnMock).toHaveBeenCalledTimes(1)
    expect(tlWarnMock.mock.calls[0][0]).toBe("RISK_AUTO_CLOSE_BREACH")

    expect(tlInfoMock).toHaveBeenCalledTimes(1)
    expect(tlInfoMock.mock.calls[0][0]).toBe("RISK_ALERT_CREATED")

    expect(tlErrorMock).not.toHaveBeenCalled()
  })
})
