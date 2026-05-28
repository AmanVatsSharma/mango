/**
 * @file risk-backstop-runner.test.ts
 * @module tests/risk
 * @description Unit tests for risk backstop runner behavior (skip vs run).
 * @author StockTrade
 * @created 2026-02-13
 */

jest.mock("@/lib/server/workers/registry", () => {
  return {
    WORKER_IDS: { RISK_MONITORING: "risk_monitoring" },
    getWorkersSnapshot: jest.fn(async () => []),
    updateWorkerHeartbeat: jest.fn(async () => {}),
  }
})

jest.mock("@/lib/services/position/PositionPnLWorker", () => {
  return {
    positionPnLWorker: {
      processPositionPnL: jest.fn(async () => ({ success: true, heartbeat: { lastRunAtIso: new Date().toISOString() } })),
    },
  }
})

import { runRiskBackstop } from "@/lib/services/risk/risk-backstop-runner"

const registryMock = jest.requireMock("@/lib/server/workers/registry") as {
  getWorkersSnapshot: jest.Mock
  updateWorkerHeartbeat: jest.Mock
  WORKER_IDS: { RISK_MONITORING: string }
}

const pnlWorkerMock = jest.requireMock("@/lib/services/position/PositionPnLWorker").positionPnLWorker as {
  processPositionPnL: jest.Mock
}

describe("runRiskBackstop", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("skips when position_pnl worker is healthy (default)", async () => {
    registryMock.getWorkersSnapshot.mockResolvedValueOnce([
      { id: "position_pnl", health: "healthy", lastRunAtIso: "2026-02-13T00:00:00.000Z" },
    ])

    const res = await runRiskBackstop()
    expect(res.skipped).toBe(true)
    expect(res.skippedReason).toBe("positions_worker_healthy")
    expect(pnlWorkerMock.processPositionPnL).not.toHaveBeenCalled()
    expect(registryMock.updateWorkerHeartbeat).toHaveBeenCalled()
  })

  it("runs when position_pnl worker is stale", async () => {
    registryMock.getWorkersSnapshot.mockResolvedValueOnce([
      { id: "position_pnl", health: "stale", lastRunAtIso: "2026-02-13T00:00:00.000Z" },
    ])

    const res = await runRiskBackstop()
    expect(res.skipped).toBe(false)
    expect(pnlWorkerMock.processPositionPnL).toHaveBeenCalled()
    const call = pnlWorkerMock.processPositionPnL.mock.calls[0]?.[0]
    expect(call.forceRun).toBe(true)
    expect(call.riskMaxAutoClosesPerAccount).toBe(5)
    expect(call.sltpMaxAutoClosesPerTick).toBe(500)
    expect(registryMock.updateWorkerHeartbeat).toHaveBeenCalled()
  })

  it("runs when forceRun=true even if healthy", async () => {
    registryMock.getWorkersSnapshot.mockResolvedValueOnce([
      { id: "position_pnl", health: "healthy", lastRunAtIso: "2026-02-13T00:00:00.000Z" },
    ])

    const res = await runRiskBackstop({ forceRun: true })
    expect(res.skipped).toBe(false)
    expect(pnlWorkerMock.processPositionPnL).toHaveBeenCalled()
  })
})

