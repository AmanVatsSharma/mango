/**
 * @file risk-monitoring-service-auto-close.test.ts
 * @module tests/risk
 * @description Verifies RiskMonitoringService triggers close + alert when loss utilization hits auto-close threshold (defaults 75% warn / 80% close).
 * @author StockTrade
 * @created 2026-04-06
 */

jest.mock("@/lib/prisma", () => {
  const riskAlertCreate = jest.fn(async () => ({}))
  const tradingAccountFindUnique = jest.fn()
  const stockFindFirst = jest.fn()
  return {
    prisma: {
      riskAlert: { create: riskAlertCreate },
      tradingAccount: { findUnique: tradingAccountFindUnique },
      stock: { findFirst: stockFindFirst },
    },
    __riskMocks: { riskAlertCreate, tradingAccountFindUnique, stockFindFirst },
  }
})

jest.mock("@/lib/services/risk/risk-enforcement-settings", () => ({
  getRiskEnforcementSettings: jest.fn(async () => ({
    fullLiquidationOnAutoClose: false,
    squareOffOnWarningBand: false,
    source: "default" as const,
  })),
}))

jest.mock("@/Branding", () => ({ getBaseUrl: () => "http://127.0.0.1:3000" }))

const calculateUnrealizedPnLMock = jest.fn()
const closePositionMock = jest.fn()

jest.mock("@/lib/services/position/PositionManagementService", () => ({
  PositionManagementService: jest.fn().mockImplementation(() => ({
    calculateUnrealizedPnL: (...args: unknown[]) => calculateUnrealizedPnLMock(...args),
    closePosition: (...args: unknown[]) => closePositionMock(...args),
  })),
}))

const findActiveMock = jest.fn()

jest.mock("@/lib/repositories/PositionRepository", () => ({
  PositionRepository: jest.fn().mockImplementation(() => ({
    findActive: (...args: unknown[]) => findActiveMock(...args),
  })),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(async () => {}),
    warn: jest.fn(async () => {}),
    error: jest.fn(async () => {}),
  })),
}))

import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"

const prismaPack = jest.requireMock("@/lib/prisma") as {
  __riskMocks: {
    riskAlertCreate: jest.Mock
    tradingAccountFindUnique: jest.Mock
    stockFindFirst: jest.Mock
  }
}

describe("RiskMonitoringService auto-close", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { "NSE:ABC": { last_trade_price: 20 } },
      }),
    })) as unknown as typeof fetch

    prismaPack.__riskMocks.tradingAccountFindUnique.mockResolvedValue({
      availableMargin: 500,
      usedMargin: 0,
      balance: 500,
    })

    let pnlCalls = 0
    calculateUnrealizedPnLMock.mockImplementation(async () => {
      pnlCalls += 1
      if (pnlCalls === 1) {
        return { totalUnrealizedPnL: -800, positions: [{ id: "p1" }] }
      }
      return { totalUnrealizedPnL: 0, positions: [] }
    })

    findActiveMock.mockResolvedValue([
      {
        id: "pos-1",
        averagePrice: 100,
        quantity: 10,
        Stock: { instrumentId: "NSE:ABC" },
      },
    ])

    closePositionMock.mockResolvedValue({
      success: true,
      exitOrderId: "ord-exit-1",
      realizedPnL: -800,
      exitPrice: 20,
      marginReleased: 0,
      message: "closed",
    })
  })

  it("closes a losing position when utilization is at 80% and threshold is 80%", async () => {
    const svc = new RiskMonitoringService()
    const res = await svc.monitorAccount("acc-1", "user-1", {
      warningThreshold: 0.75,
      autoCloseThreshold: 0.8,
    })

    expect(res.marginUtilizationPercent).toBeCloseTo(0.8, 6)
    expect(closePositionMock).toHaveBeenCalledWith("pos-1", "acc-1", undefined)
    expect(res.positionsClosed).toBe(1)
    expect(prismaPack.__riskMocks.riskAlertCreate).toHaveBeenCalled()
  })

  it("does not auto-close when utilization is 79% (below 80% close band)", async () => {
    calculateUnrealizedPnLMock.mockReset()
    calculateUnrealizedPnLMock.mockResolvedValue({
      totalUnrealizedPnL: -790,
      positions: [{ id: "p1" }],
    })

    const svc = new RiskMonitoringService()
    const res = await svc.monitorAccount("acc-2", "user-2", {
      warningThreshold: 0.75,
      autoCloseThreshold: 0.8,
    })

    expect(res.marginUtilizationPercent).toBeCloseTo(0.79, 6)
    expect(closePositionMock).not.toHaveBeenCalled()
    expect(res.positionsClosed).toBe(0)
  })
})
