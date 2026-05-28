/**
 * @file tests/api/cron-risk-monitoring-route.test.ts
 * @module tests-api
 * @description Route-level lock skip behavior tests for risk monitoring cron endpoint.
 * @author StockTrade
 * @created 2026-02-15
 */

const monitorAllAccountsMock = jest.fn()
const getLatestActiveGlobalSettingsMock = jest.fn()
const updateWorkerHeartbeatMock = jest.fn()
const tryAcquireWorkerRunLockMock = jest.fn()
const releaseWorkerRunLockMock = jest.fn()
const runScheduledCleanupTickMock = jest.fn()

jest.mock("@/lib/services/risk/RiskMonitoringService", () => ({
  RiskMonitoringService: jest.fn().mockImplementation(() => ({
    monitorAllAccounts: (...args: any[]) => monitorAllAccountsMock(...args),
  })),
}))

jest.mock("@/lib/server/workers/system-settings", () => ({
  getLatestActiveGlobalSettings: (...args: any[]) => getLatestActiveGlobalSettingsMock(...args),
  parseBooleanSetting: jest.fn((value: string | null | undefined) => {
    if (value == null) return null
    const normalizedValue = value.trim().toLowerCase()
    if (normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes" || normalizedValue === "on") {
      return true
    }
    if (normalizedValue === "false" || normalizedValue === "0" || normalizedValue === "no" || normalizedValue === "off") {
      return false
    }
    return null
  }),
}))

jest.mock("@/lib/server/workers/registry", () => ({
  RISK_MONITORING_ENABLED_KEY: "risk_monitoring_enabled",
  WORKER_IDS: { RISK_MONITORING: "risk-monitoring" },
  updateWorkerHeartbeat: (...args: any[]) => updateWorkerHeartbeatMock(...args),
}))

jest.mock("@/lib/server/workers/worker-run-lock", () => ({
  tryAcquireWorkerRunLock: (...args: any[]) => tryAcquireWorkerRunLockMock(...args),
  releaseWorkerRunLock: (...args: any[]) => releaseWorkerRunLockMock(...args),
}))

jest.mock("@/lib/server/workers/cleanup-auto-runner", () => ({
  runScheduledCleanupTick: (...args: any[]) => runScheduledCleanupTickMock(...args),
}))

import { GET } from "@/app/api/cron/risk-monitoring/route"

describe("/api/cron/risk-monitoring lock behavior", () => {
  const buildEnabledSettingsMap = () => {
    const settingsMap = new Map<string, { value: string }>()
    settingsMap.set("risk_monitoring_enabled", { value: "true" })
    return settingsMap
  }
  const buildDisabledSettingsMap = () => {
    const settingsMap = new Map<string, { value: string }>()
    settingsMap.set("risk_monitoring_enabled", { value: "false" })
    return settingsMap
  }
  const buildEnabledAliasSettingsMap = () => {
    const settingsMap = new Map<string, { value: string }>()
    settingsMap.set("risk_monitoring_enabled", { value: " 1 " })
    return settingsMap
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.CRON_SECRET
    delete process.env.RISK_MONITORING_SECRET
    delete process.env.RISK_MONITORING_LOCK_TTL_MS
    updateWorkerHeartbeatMock.mockResolvedValue(undefined)
    getLatestActiveGlobalSettingsMock.mockResolvedValue(buildEnabledSettingsMap())

    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner",
      expiresAtMs: Date.now() + 60_000,
    })
    runScheduledCleanupTickMock.mockResolvedValue({
      source: "cron_risk_monitoring",
      executed: false,
      skippedReason: "disabled",
      config: { enabled: false, retentionDays: 0, dailyRunHourIst: 6, lastRunDateIst: null },
    })
  })

  it("returns skipped reason=locked when global worker lock is active", async () => {
    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)

    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(updateWorkerHeartbeatMock).toHaveBeenCalled()
    expect(monitorAllAccountsMock).not.toHaveBeenCalled()
    expect(releaseWorkerRunLockMock).not.toHaveBeenCalled()
  })

  it.each(["undefined", "false", "0", "off", "disabled", "{}", '{"secrets":[]}'])(
    "ignores placeholder cron secret value %s and allows request",
    async (placeholderSecret) => {
      process.env.CRON_SECRET = placeholderSecret
      const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
      const res = await GET(req)
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toMatchObject({
        success: true,
        skipped: true,
        reason: "locked",
      })
      expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
    },
  )

  it("accepts authorization when configured secret has surrounding whitespace", async () => {
    process.env.CRON_SECRET = "  expected-secret  "
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is wrapped in quotes", async () => {
    process.env.CRON_SECRET = '"expected-secret"'
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is a JSON array", async () => {
    process.env.CRON_SECRET = '["wrong-secret","expected-secret"]'
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts case-insensitive bearer scheme and trimmed token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "bearer   expected-secret   " },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts quoted bearer token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: 'Bearer "expected-secret"' },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts first bearer token from comma-separated authorization header", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret, Basic ignored" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts bearer token when comma-separated auth header starts with non-bearer segment", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Basic ignored, Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts worker-specific secret when both worker and global secrets are configured", async () => {
    process.env.CRON_SECRET = "global-secret"
    process.env.RISK_MONITORING_SECRET = "worker-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer worker-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts matching secret from comma-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret, expected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts matching secret from semicolon/newline-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret;\nexpected-secret"
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts matching secret from JSON-object secret list wrappers", async () => {
    process.env.CRON_SECRET = '{"secrets":["wrong-secret","expected-secret"]}'
    const req = new Request("http://localhost/api/cron/risk-monitoring", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("returns unauthorized when auth header cannot be read and secret is configured", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      get headers() {
        throw new Error("headers unavailable")
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(monitorAllAccountsMock).not.toHaveBeenCalled()
  })

  it("accepts authorization from plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        Authorization: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from mixed-case plain-object header keys", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        aUtHoRiZaTiOn: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from array-valued plain-object headers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        authorization: ["Bearer expected-secret"],
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from nested plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        headers: {
          authorization: "Bearer expected-secret",
        },
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from iterable header entry wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: [["authorization", "Bearer expected-secret"]],
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from entries()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        entries: () => [["authorization", "Bearer expected-secret"]],
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from flat raw-header arrays", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: ["authorization", "Bearer expected-secret", "x-other", "ignored"],
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        forEach: (callback: (value: unknown, key: unknown) => void) => {
          callback("Bearer expected-secret", "authorization")
        },
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based wrappers with swapped callback args", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/risk-monitoring",
      headers: {
        forEach: (callback: (firstArg: unknown, secondArg: unknown) => void) => {
          callback("authorization", "Bearer expected-secret")
        },
      },
    } as unknown as Request

    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("returns skipped reason=disabled and writes disabled heartbeat", async () => {
    getLatestActiveGlobalSettingsMock.mockResolvedValue(buildDisabledSettingsMap())

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "disabled",
    })

    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls[0]?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.reason).toBe("disabled")
    expect(tryAcquireWorkerRunLockMock).not.toHaveBeenCalled()
    expect(releaseWorkerRunLockMock).not.toHaveBeenCalled()
  })

  it("treats numeric-style enabled setting aliases as enabled", async () => {
    getLatestActiveGlobalSettingsMock.mockResolvedValue(buildEnabledAliasSettingsMap())

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalled()
  })

  it("normalizes configured lock TTL to safe minimum bound", async () => {
    process.env.RISK_MONITORING_LOCK_TTL_MS = "5"
    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk-monitoring",
        ttlMs: 10_000,
      }),
    )
  })

  it("normalizes configured lock TTL to safe maximum bound", async () => {
    process.env.RISK_MONITORING_LOCK_TTL_MS = String(365 * 24 * 60 * 60 * 1000)
    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk-monitoring",
        ttlMs: 86_400_000,
      }),
    )
  })

  it("uses fallback lock TTL when configured value is blank", async () => {
    process.env.RISK_MONITORING_LOCK_TTL_MS = "   "
    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "risk-monitoring",
        ttlMs: 180_000,
      }),
    )
  })

  it("updates heartbeat with numeric error count on successful run", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-success",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: 5,
      positionsChecked: 11,
      positionsClosed: 2,
      alertsCreated: 1,
      errors: 3,
      details: [],
    })

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 5,
        positionsClosed: 2,
        alertsCreated: 1,
        errors: 3,
      },
    })

    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.errorCount).toBe(3)
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-success" }),
    )
  })

  it("normalizes malformed monitoring summary counts before heartbeat + response", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-normalized-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: " 5 ",
      positionsChecked: 11,
      positionsClosed: "-2",
      alertsCreated: " 3 ",
      errors: "6",
      details: [],
    })

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 5,
        positionsClosed: 0,
        alertsCreated: 3,
        errors: 6,
      },
    })

    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(5)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(3)
    expect(heartbeatJson.errorCount).toBe(6)
  })

  it("treats boolean and blank summary counts as zero", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-boolean-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: true,
      positionsChecked: 0,
      positionsClosed: false,
      alertsCreated: "   ",
      errors: "2",
      details: [],
    })

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 0,
        positionsClosed: 0,
        alertsCreated: 0,
        errors: 2,
      },
    })

    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(0)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(0)
    expect(heartbeatJson.errorCount).toBe(2)
  })

  it("treats non-coercible summary counts as zero", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-symbol-summary",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: Symbol("checked-accounts"),
      positionsChecked: 0,
      positionsClosed: Symbol("positions-closed"),
      alertsCreated: Symbol("alerts-created"),
      errors: "2",
      details: [],
    })

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 0,
        positionsClosed: 0,
        alertsCreated: 0,
        errors: 2,
      },
    })

    const heartbeatPayload = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === undefined
    })?.[1]
    const heartbeatJson = JSON.parse(heartbeatPayload || "{}")
    expect(heartbeatJson.checkedAccounts).toBe(0)
    expect(heartbeatJson.positionsClosed).toBe(0)
    expect(heartbeatJson.alertsCreated).toBe(0)
    expect(heartbeatJson.errorCount).toBe(2)
  })

  it("returns success even when lock release fails after a completed run", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-release-error",
      expiresAtMs: Date.now() + 60_000,
    })
    monitorAllAccountsMock.mockResolvedValue({
      checkedAccounts: 3,
      positionsChecked: 6,
      positionsClosed: 1,
      alertsCreated: 1,
      errors: 0,
      details: [],
    })
    releaseWorkerRunLockMock.mockRejectedValue(new Error("release-failed"))

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      result: {
        checkedAccounts: 3,
        positionsClosed: 1,
      },
    })
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-release-error" }),
    )
  })

  it("Trading-8nt: returns 'locked' on overlap (Redis lock is canonical, no module-local flag)", async () => {
    // Trading-8nt: the previous in-process `riskMonitoringInFlight` flag was removed because
    // it was meaningless on serverless. The Redis worker-run lock (tryAcquireWorkerRunLock)
    // is now the single source of truth. Both invocations call the lock helper; the second
    // gets `acquired: false` → reason "locked". This is the correct distributed-system path.
    let resolveRun: ((value: any) => void) | null = null
    const pendingRun = new Promise((resolve) => {
      resolveRun = resolve
    })

    tryAcquireWorkerRunLockMock
      .mockResolvedValueOnce({
        acquired: true,
        key: "worker_run_lock_risk-monitoring",
        ownerToken: "owner-pending",
        expiresAtMs: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        acquired: false,
        key: "worker_run_lock_risk-monitoring",
        reason: "locked_by_other",
      })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockImplementationOnce(() => pendingRun)

    const req1 = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const firstRunPromise = GET(req1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const req2 = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const overlapRes = await GET(req2)
    expect(overlapRes.status).toBe(200)
    await expect(overlapRes.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
      reason: "locked",
    })

    const overlapHeartbeat = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === "locked"
    })
    expect(overlapHeartbeat).toBeTruthy()

    resolveRun?.({
      checkedAccounts: 1,
      positionsChecked: 1,
      positionsClosed: 0,
      alertsCreated: 0,
      errors: 0,
      details: [],
    })
    const firstRunResponse = await firstRunPromise
    expect(firstRunResponse.status).toBe(200)
    // Both runs called the lock helper (no module-local short-circuit any more).
    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledTimes(2)
  })

  it("writes error heartbeat and returns 500 when monitoring fails", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_risk-monitoring",
      ownerToken: "owner-error",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockResolvedValue(undefined)
    monitorAllAccountsMock.mockRejectedValue({ message: "   monitor   failed   " })

    const req = new Request("http://localhost/api/cron/risk-monitoring", { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "monitor failed",
    })

    const errorHeartbeat = updateWorkerHeartbeatMock.mock.calls.find((c) => {
      const body = JSON.parse(c?.[1] || "{}")
      return body.reason === "error"
    })
    expect(errorHeartbeat).toBeTruthy()
    const errorHeartbeatJson = JSON.parse(errorHeartbeat?.[1] || "{}")
    expect(errorHeartbeatJson.errorMessage).toBe("monitor failed")
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-error" }),
    )
  })
})

