/**
 * @file tests/api/admin-workers-route.test.ts
 * @module tests-api
 * @description Route-level risk run-once lock and heartbeat tests for /api/admin/workers.
 * @author StockTrade
 * @created 2026-02-15
 */

const getWorkersSnapshotMock = jest.fn()
const updateWorkerHeartbeatMock = jest.fn()
const setWorkerEnabledMock = jest.fn()
const upsertGlobalSettingMock = jest.fn()
const tryAcquireWorkerRunLockMock = jest.fn()
const releaseWorkerRunLockMock = jest.fn()
const monitorAllAccountsMock = jest.fn()
const processPendingOrdersMock = jest.fn()
const processPositionPnLMock = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: any, handler: any) => {
    try {
      return await handler({
        logger: {
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      })
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || "failed",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      )
    }
  },
}))

jest.mock("@/lib/server/workers/registry", () => ({
  getWorkersSnapshot: (...args: any[]) => getWorkersSnapshotMock(...args),
  POSITION_PNL_MODE_KEY: "position_pnl_mode",
  WORKER_TRADING_CATEGORY: "TRADING",
  setWorkerEnabled: (...args: any[]) => setWorkerEnabledMock(...args),
  updateWorkerHeartbeat: (...args: any[]) => updateWorkerHeartbeatMock(...args),
  WORKER_IDS: {
    ORDER_EXECUTION: "order_execution",
    POSITION_PNL: "position_pnl",
    RISK_MONITORING: "risk_monitoring",
  },
}))

jest.mock("@/lib/server/workers/system-settings", () => ({
  upsertGlobalSetting: (...args: any[]) => upsertGlobalSettingMock(...args),
}))

jest.mock("@/lib/services/order/OrderExecutionWorker", () => ({
  orderExecutionWorker: { processPendingOrders: (...args: any[]) => processPendingOrdersMock(...args) },
}))

jest.mock("@/lib/services/position/PositionPnLWorker", () => ({
  positionPnLWorker: { processPositionPnL: (...args: any[]) => processPositionPnLMock(...args) },
}))

jest.mock("@/lib/services/risk/RiskMonitoringService", () => ({
  RiskMonitoringService: jest.fn().mockImplementation(() => ({
    monitorAllAccounts: (...args: any[]) => monitorAllAccountsMock(...args),
  })),
}))

jest.mock("@/lib/redis/redis-client", () => ({
  isRedisEnabled: jest.fn(() => true),
}))

jest.mock("@/lib/server/workers/worker-run-lock", () => ({
  tryAcquireWorkerRunLock: (...args: any[]) => tryAcquireWorkerRunLockMock(...args),
  releaseWorkerRunLock: (...args: any[]) => releaseWorkerRunLockMock(...args),
}))

import { POST } from "@/app/api/admin/workers/route"

describe("POST /api/admin/workers (risk run_once)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.ADMIN_RISK_MONITORING_LOCK_TTL_MS
    delete process.env.RISK_MONITORING_LOCK_TTL_MS
    getWorkersSnapshotMock.mockResolvedValue([{ id: "risk_monitoring", health: "healthy" }])
    setWorkerEnabledMock.mockResolvedValue(undefined)
    upsertGlobalSettingMock.mockResolvedValue(undefined)
    updateWorkerHeartbeatMock.mockResolvedValue(undefined)
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    processPendingOrdersMock.mockResolvedValue({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })
    processPositionPnLMock.mockResolvedValue({
      success: true,
      scanned: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      elapsedMs: 1,
      heartbeat: { lastRunAtIso: new Date().toISOString() },
    })
  })

  const buildRiskRunOnceRequest = () =>
    new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "run_once", workerId: "risk_monitoring" }),
    })

  it("accepts action/workerId tokens with trim + case normalization", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-normalized-action",
      expiresAtMs: Date.now() + 60_000,
    })

    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: " RUN_ONCE ", workerId: " RISK_MONITORING " }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
      workerId: "risk_monitoring",
    })
  })

  it("accepts run_once action + workerId aliases with hyphen separators", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-normalized-hyphen-run-once",
      expiresAtMs: Date.now() + 60_000,
    })

    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "run-once", workerId: "risk-monitoring" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
      workerId: "risk_monitoring",
    })
  })

  it("normalizes configured admin lock TTL to safe minimum bound", async () => {
    process.env.ADMIN_RISK_MONITORING_LOCK_TTL_MS = "9"
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-ttl-min",
      expiresAtMs: Date.now() + 60_000,
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk_monitoring",
        ttlMs: 10_000,
      }),
    )
  })

  it("normalizes configured admin lock TTL to safe maximum bound", async () => {
    process.env.ADMIN_RISK_MONITORING_LOCK_TTL_MS = String(365 * 24 * 60 * 60 * 1000)
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-ttl-max",
      expiresAtMs: Date.now() + 60_000,
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk_monitoring",
        ttlMs: 86_400_000,
      }),
    )
  })

  it("uses fallback lock TTL when configured admin lock TTL is blank", async () => {
    process.env.ADMIN_RISK_MONITORING_LOCK_TTL_MS = "   "
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-ttl-blank",
      expiresAtMs: Date.now() + 60_000,
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk_monitoring",
        ttlMs: 180_000,
      }),
    )
  })

  it("returns skipped locked when lock is not acquired", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-locked",
      expiresAtMs: Date.now() + 60_000,
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
      workers: [{ id: "risk_monitoring" }],
    })

    expect(monitorAllAccountsMock).not.toHaveBeenCalled()
    expect(getWorkersSnapshotMock).toHaveBeenCalledTimes(1)
    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls[0]?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.reason).toBe("locked")
    expect(releaseWorkerRunLockMock).not.toHaveBeenCalled()
  })

  it("writes numeric errorCount heartbeat and releases lock on success", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-success",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: 9,
      positionsChecked: 14,
      positionsClosed: 3,
      alertsCreated: 2,
      errors: 4,
      details: [],
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 9,
        positionsClosed: 3,
        alertsCreated: 2,
        errors: 4,
      },
      workers: [{ id: "risk_monitoring" }],
    })
    expect(getWorkersSnapshotMock).toHaveBeenCalledTimes(1)

    const successHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(successHeartbeatPayload || "{}")
    expect(heartbeatJson.errorCount).toBe(4)
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-success" }),
    )
  })

  it("normalizes malformed monitoring summary counts in response and heartbeat", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-normalized-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: " 7 ",
      positionsChecked: 12,
      positionsClosed: "-3",
      alertsCreated: " 4 ",
      errors: "5",
      details: [],
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 7,
        positionsClosed: 0,
        alertsCreated: 4,
        errors: 5,
      },
    })

    const successHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(successHeartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(7)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(4)
    expect(heartbeatJson.errorCount).toBe(5)
  })

  it("treats blank and boolean monitoring summary counts as zero", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-normalized-blank-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: true,
      positionsChecked: 12,
      positionsClosed: false,
      alertsCreated: "   ",
      errors: "3",
      details: [],
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 0,
        positionsClosed: 0,
        alertsCreated: 0,
        errors: 3,
      },
    })

    const successHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(successHeartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(0)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(0)
    expect(heartbeatJson.errorCount).toBe(3)
  })

  it("treats non-coercible monitoring summary counts as zero", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-symbol-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: Symbol("checked-accounts"),
      positionsChecked: 12,
      positionsClosed: Symbol("positions-closed"),
      alertsCreated: Symbol("alerts-created"),
      errors: "4",
      details: [],
    })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 0,
        positionsClosed: 0,
        alertsCreated: 0,
        errors: 4,
      },
    })

    const successHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(successHeartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(0)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(0)
    expect(heartbeatJson.errorCount).toBe(4)
  })

  it("returns success when lock release fails after successful monitoring", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-release-error",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: 2,
      positionsChecked: 5,
      positionsClosed: 1,
      alertsCreated: 0,
      errors: 0,
      details: [],
    })
    releaseWorkerRunLockMock.mockRejectedValue(new Error("release-failed"))

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 2,
        positionsClosed: 1,
      },
    })
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-release-error" }),
    )
  })

  it("writes error heartbeat and releases lock when monitoring fails", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-error",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockRejectedValue(new Error("risk-admin-failed"))

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "risk-admin-failed",
    })

    const errorHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === "error"
    })?.[1]
    const errorHeartbeatJson = JSON.parse(errorHeartbeatPayload || "{}")
    expect(errorHeartbeatJson.reason).toBe("error")
    expect(errorHeartbeatJson.errorCount).toBe(1)
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-error" }),
    )
  })

  it("normalizes and truncates error heartbeat message when monitoring fails", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "owner-error-normalized",
      expiresAtMs: Date.now() + 60_000,
    })
    const longErrorMessage = `   risk   monitoring   exploded   ${"x".repeat(320)}`
    monitorAllAccountsMock.mockRejectedValue({ message: longErrorMessage })

    const res = await POST(buildRiskRunOnceRequest())
    expect(res.status).toBe(500)

    const errorHeartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === "error"
    })?.[1]
    const errorHeartbeatJson = JSON.parse(errorHeartbeatPayload || "{}")
    expect(errorHeartbeatJson.errorMessage.startsWith("risk monitoring exploded ")).toBe(true)
    expect(errorHeartbeatJson.errorMessage.length).toBe(256)
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-error-normalized" }),
    )
  })
})

describe("POST /api/admin/workers run_once param normalization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getWorkersSnapshotMock.mockResolvedValue([{ id: "order_execution", health: "healthy" }])
    setWorkerEnabledMock.mockResolvedValue(undefined)
    upsertGlobalSettingMock.mockResolvedValue(undefined)
    updateWorkerHeartbeatMock.mockResolvedValue(undefined)
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    processPendingOrdersMock.mockResolvedValue({
      scanned: 1,
      executed: 1,
      cancelled: 0,
      errors: [],
    })
    processPositionPnLMock.mockResolvedValue({
      success: true,
      scanned: 1,
      updated: 1,
      skipped: 0,
      errors: 0,
      elapsedMs: 2,
      heartbeat: { lastRunAtIso: new Date().toISOString() },
    })
  })

  it("normalizes order run_once params before invoking worker", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "order_execution",
        params: { limit: "9999", maxAgeMs: "-50" },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 200,
      maxAgeMs: 0,
    })
  })

  it("uses default order run_once numeric params when values are blank", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "order_execution",
        params: { limit: "   ", maxAgeMs: "" },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("uses default order run_once numeric params when values are nullish", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "order_execution",
        params: { limit: null, maxAgeMs: undefined },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("uses safe defaults when order run_once params payload is non-object", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "order_execution",
        params: "invalid-payload",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("parses stringified order run_once params payloads", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "order_execution",
        params: "{\"limit\":\"12\",\"maxAgeMs\":\"77\"}",
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 12,
      maxAgeMs: 77,
    })
  })

  it("normalizes position run_once params before invoking worker", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: { limit: "99999", updateThreshold: "-7", dryRun: "YES" },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 2000,
      updateThreshold: 0,
      dryRun: true,
    })
  })

  it("uses default position run_once numeric params when values are blank", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: { limit: "  ", updateThreshold: "", dryRun: "off" },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })

  it("uses default position run_once numeric params when values are nullish", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: { limit: null, updateThreshold: undefined, dryRun: null },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })

  it("uses safe defaults when position run_once params payload is array", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: ["unexpected"],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })

  it("treats numeric dryRun flag as boolean true when value is 1", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: { dryRun: 1 },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: true,
    })
  })

  it("treats compact dryRun aliases as boolean true", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: { dryRun: "t" },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: true,
    })
  })

  it("accepts double-encoded JSON body payloads for run_once", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        JSON.stringify({
          action: "run_once",
          workerId: "position_pnl",
          params: {
            limit: "9",
            updateThreshold: "0.5",
            dryRun: "on",
          },
        }),
      ),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 9,
      updateThreshold: 0.5,
      dryRun: true,
    })
  })

  it("unwraps wrapped params payload objects for run_once", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "run_once",
        workerId: "position_pnl",
        params: {
          payload: {
            limit: "13",
            updateThreshold: "2.25",
            dryRun: "enabled",
          },
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 13,
      updateThreshold: 2.25,
      dryRun: true,
    })
  })

  it("accepts wrapped body payloads for run_once", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          action: "run_once",
          workerId: "order_execution",
          params: {
            payload: {
              limit: "21",
              maxAgeMs: "44",
            },
          },
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 21,
      maxAgeMs: 44,
    })
  })
})

describe("POST /api/admin/workers toggle/set_mode normalization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getWorkersSnapshotMock.mockResolvedValue([
      { id: "order_execution", health: "healthy" },
      { id: "position_pnl", health: "healthy" },
    ])
    setWorkerEnabledMock.mockResolvedValue(undefined)
    upsertGlobalSettingMock.mockResolvedValue(undefined)
  })

  it("normalizes toggle payload boolean aliases and worker tokens", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: " TOGGLE ",
        workerId: " ORDER_EXECUTION ",
        enabled: " yes ",
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      action: "toggle",
      workerId: "order_execution",
      enabled: true,
    })
    expect(setWorkerEnabledMock).toHaveBeenCalledWith("order_execution", true)
  })

  it("accepts toggle action with hyphenated workerId alias", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "toggle",
        workerId: "order-execution",
        enabled: "on",
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      action: "toggle",
      workerId: "order_execution",
      enabled: true,
    })
    expect(setWorkerEnabledMock).toHaveBeenCalledWith("order_execution", true)
  })

  it("normalizes status-word toggle aliases", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "toggle",
        workerId: "risk_monitoring",
        enabled: " disabled ",
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      workerId: "risk_monitoring",
      enabled: false,
    })
    expect(setWorkerEnabledMock).toHaveBeenCalledWith("risk_monitoring", false)
  })

  it("normalizes numeric toggle payloads to boolean false", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "toggle",
        workerId: "risk_monitoring",
        enabled: 0,
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      workerId: "risk_monitoring",
      enabled: false,
    })
    expect(setWorkerEnabledMock).toHaveBeenCalledWith("risk_monitoring", false)
  })

  it("normalizes set_mode payload tokens", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: " SET_MODE ",
        workerId: " POSITION_PNL ",
        mode: " SERVER ",
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      action: "set_mode",
      workerId: "position_pnl",
      mode: "server",
    })
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "position_pnl_mode",
        value: "server",
      }),
    )
  })

  it("accepts set-mode action and hyphenated workerId alias", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "set-mode",
        workerId: "position-pnl",
        mode: "server",
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      action: "set_mode",
      workerId: "position_pnl",
      mode: "server",
    })
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "position_pnl_mode",
        value: "server",
      }),
    )
  })

  it("accepts wrapped body payloads for toggle action", async () => {
    const req = new Request("http://localhost/api/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: {
          payload: {
            action: "toggle",
            workerId: "risk_monitoring",
            enabled: "on",
          },
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      action: "toggle",
      workerId: "risk_monitoring",
      enabled: true,
    })
    expect(setWorkerEnabledMock).toHaveBeenCalledWith("risk_monitoring", true)
  })
})

