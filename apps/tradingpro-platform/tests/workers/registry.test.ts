/**
 * @file tests/workers/registry.test.ts
 * @module tests-workers
 * @description Unit tests for workers registry normalization and heartbeat safety behavior.
 * @author StockTrade
 * @created 2026-02-16
 */

const getLatestActiveGlobalSettingsMock = jest.fn()
const upsertGlobalSettingMock = jest.fn(async () => {})
const parseBooleanSettingMock = jest.fn((value: string | null | undefined) => {
  if (value == null) {
    return null
  }
  const normalizedValue = value.trim().toLowerCase()
  if (normalizedValue === "true") {
    return true
  }
  if (normalizedValue === "false") {
    return false
  }
  return null
})

jest.mock("@/lib/server/workers/system-settings", () => ({
  getLatestActiveGlobalSettings: (...args: any[]) => getLatestActiveGlobalSettingsMock(...args),
  upsertGlobalSetting: (...args: any[]) => upsertGlobalSettingMock(...args),
  parseBooleanSetting: (...args: any[]) => parseBooleanSettingMock(...args),
}))

jest.mock("@/lib/redis/redis-client", () => ({
  isRedisEnabled: jest.fn(() => false),
}))

jest.mock("@/lib/server/market-display-pnl-meta", () => ({
  resolveMarketDisplayQuoteFreshness: jest.fn(async () => ({
    pnlServerMaxAgeMs: 15_000,
    redisMarketQuoteMaxAgeMs: 7_500,
    positionPnlQuoteMaxAgeMs: 15_000,
    marketQuoteRedisWriteMinIntervalMs: 100,
  })),
}))

import {
  getWorkersSnapshot,
  parsePositionPnLMode,
  setWorkerEnabled,
  updateWorkerHeartbeat,
  WORKER_IDS,
  ORDER_WORKER_HEARTBEAT_KEY,
  ORDER_WORKER_ENABLED_KEY,
  POSITION_PNL_HEARTBEAT_KEY,
  POSITION_PNL_MODE_KEY,
  RISK_MONITORING_ENABLED_KEY,
  RISK_MONITORING_HEARTBEAT_KEY,
} from "@/lib/server/workers/registry"

describe("workers registry", () => {
  const originalRedisPositionsPnlTtlSeconds = process.env.REDIS_POSITIONS_PNL_TTL_SECONDS

  beforeEach(() => {
    jest.clearAllMocks()
    getLatestActiveGlobalSettingsMock.mockResolvedValue(new Map())
  })

  afterEach(() => {
    process.env.REDIS_POSITIONS_PNL_TTL_SECONDS = originalRedisPositionsPnlTtlSeconds
  })

  it("parses position PnL mode with trim/case normalization", () => {
    expect(parsePositionPnLMode("server")).toBe("server")
    expect(parsePositionPnLMode(" SERVER ")).toBe("server")
    expect(parsePositionPnLMode("SeRvEr")).toBe("server")
    expect(parsePositionPnLMode("client")).toBe("client")
    expect(parsePositionPnLMode("")).toBe("client")
    expect(parsePositionPnLMode(null)).toBe("client")
  })

  it("normalizes worker TTL options and heartbeat timestamp variants", async () => {
    getLatestActiveGlobalSettingsMock.mockResolvedValue(
      new Map([
        [ORDER_WORKER_ENABLED_KEY, { value: " true " }],
        [ORDER_WORKER_HEARTBEAT_KEY, { value: JSON.stringify({ lastRunAtIso: " 2026-02-16T01:02:03.000Z ", source: "cron" }) }],
        [POSITION_PNL_MODE_KEY, { value: " SERVER " }],
        [POSITION_PNL_HEARTBEAT_KEY, { value: "1708041600000" }],
        [RISK_MONITORING_ENABLED_KEY, { value: "true" }],
        [RISK_MONITORING_HEARTBEAT_KEY, { value: "not-a-valid-heartbeat" }],
      ]),
    )

    const workers = await getWorkersSnapshot({
      orderTtlMs: Number.NaN as unknown as number,
      positionPnlTtlMs: -50 as unknown as number,
      riskTtlMs: Number.POSITIVE_INFINITY as unknown as number,
    })

    const orderWorker = workers.find((worker) => worker.id === WORKER_IDS.ORDER_EXECUTION)
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)
    const riskWorker = workers.find((worker) => worker.id === WORKER_IDS.RISK_MONITORING)

    expect(orderWorker?.healthTtlMs).toBe(2 * 60 * 1000)
    expect(orderWorker?.heartbeat?.lastRunAtIso).toBe("2026-02-16T01:02:03.000Z")

    expect(positionWorker?.enabled).toBe(true)
    expect(positionWorker?.healthTtlMs).toBe(1_000)
    expect(positionWorker?.heartbeat?.lastRunAtIso).toBe(new Date(1708041600000).toISOString())

    expect(riskWorker?.healthTtlMs).toBe(10 * 60 * 1000)
    expect(riskWorker?.heartbeat).toBeNull()
  })

  it("falls back safely when snapshot TTL options include non-coercible values", async () => {
    const workers = await getWorkersSnapshot({
      orderTtlMs: Symbol("order-ttl") as any,
      positionPnlTtlMs: Symbol("position-ttl") as any,
      riskTtlMs: Symbol("risk-ttl") as any,
    })

    const orderWorker = workers.find((worker) => worker.id === WORKER_IDS.ORDER_EXECUTION)
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)
    const riskWorker = workers.find((worker) => worker.id === WORKER_IDS.RISK_MONITORING)

    expect(orderWorker?.healthTtlMs).toBe(2 * 60 * 1000)
    expect(positionWorker?.healthTtlMs).toBe(2 * 60 * 1000)
    expect(riskWorker?.healthTtlMs).toBe(10 * 60 * 1000)
  })

  it("uses redis TTL fallbacks when env values are blank or sentinel", async () => {
    process.env.REDIS_POSITIONS_PNL_TTL_SECONDS = "   "

    const workers = await getWorkersSnapshot()
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)

    expect(positionWorker?.config?.redisPnlCacheTtlSeconds).toBe(120)
    expect(positionWorker?.config?.redisPnlMaxAgeMs).toBe(15_000)
  })

  it("returns default snapshot shape when settings lookup fails", async () => {
    getLatestActiveGlobalSettingsMock.mockRejectedValue(new Error("settings-read-failed"))

    const workers = await getWorkersSnapshot()
    const orderWorker = workers.find((worker) => worker.id === WORKER_IDS.ORDER_EXECUTION)
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)
    const riskWorker = workers.find((worker) => worker.id === WORKER_IDS.RISK_MONITORING)

    expect(orderWorker?.enabled).toBe(true)
    expect(orderWorker?.heartbeat).toBeNull()
    expect(positionWorker?.enabled).toBe(false)
    expect(positionWorker?.config?.mode).toBe("client")
    expect(riskWorker?.enabled).toBe(true)
    expect(riskWorker?.heartbeat).toBeNull()
  })

  it("parses heartbeat timestamp aliases and nested heartbeat wrappers", async () => {
    getLatestActiveGlobalSettingsMock.mockResolvedValue(
      new Map([
        [ORDER_WORKER_ENABLED_KEY, { value: "true" }],
        [ORDER_WORKER_HEARTBEAT_KEY, { value: JSON.stringify({ lastRunAt: "2026-02-16T06:00:00.000Z", source: "cron" }) }],
        [POSITION_PNL_MODE_KEY, { value: "server" }],
        [POSITION_PNL_HEARTBEAT_KEY, { value: JSON.stringify({ heartbeat: { ts: 1708041600123 }, source: "worker" }) }],
        [RISK_MONITORING_ENABLED_KEY, { value: "true" }],
        [RISK_MONITORING_HEARTBEAT_KEY, { value: JSON.stringify({ last_run_at: new Date("2026-02-16T06:01:00.000Z") }) }],
      ]),
    )

    const workers = await getWorkersSnapshot()
    const orderWorker = workers.find((worker) => worker.id === WORKER_IDS.ORDER_EXECUTION)
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)
    const riskWorker = workers.find((worker) => worker.id === WORKER_IDS.RISK_MONITORING)

    expect(orderWorker?.heartbeat?.lastRunAtIso).toBe("2026-02-16T06:00:00.000Z")
    expect(positionWorker?.heartbeat?.lastRunAtIso).toBe(new Date(1708041600123).toISOString())
    expect(riskWorker?.heartbeat?.lastRunAtIso).toBe("2026-02-16T06:01:00.000Z")
  })

  it("ignores out-of-range heartbeat timestamps without throwing", async () => {
    getLatestActiveGlobalSettingsMock.mockResolvedValue(
      new Map([
        [ORDER_WORKER_ENABLED_KEY, { value: "true" }],
        [ORDER_WORKER_HEARTBEAT_KEY, { value: JSON.stringify({ lastRunAtIso: "999999999999999999999" }) }],
        [POSITION_PNL_MODE_KEY, { value: "server" }],
        [POSITION_PNL_HEARTBEAT_KEY, { value: "999999999999999999999" }],
        [RISK_MONITORING_ENABLED_KEY, { value: "true" }],
        [RISK_MONITORING_HEARTBEAT_KEY, { value: JSON.stringify({ ts: Number.MAX_VALUE }) }],
      ]),
    )

    const workers = await getWorkersSnapshot()
    const orderWorker = workers.find((worker) => worker.id === WORKER_IDS.ORDER_EXECUTION)
    const positionWorker = workers.find((worker) => worker.id === WORKER_IDS.POSITION_PNL)
    const riskWorker = workers.find((worker) => worker.id === WORKER_IDS.RISK_MONITORING)

    expect(orderWorker?.heartbeat).toBeNull()
    expect(positionWorker?.heartbeat).toBeNull()
    expect(riskWorker?.heartbeat).toBeNull()
    expect(orderWorker?.lastRunAtIso).toBeNull()
    expect(positionWorker?.lastRunAtIso).toBeNull()
    expect(riskWorker?.lastRunAtIso).toBeNull()
  })

  it("falls back to canonical heartbeat when provided payload is malformed", async () => {
    await updateWorkerHeartbeat(WORKER_IDS.ORDER_EXECUTION, "   ")
    expect(upsertGlobalSettingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ORDER_WORKER_HEARTBEAT_KEY,
        value: expect.any(String),
      }),
    )
    const blankPayloadValue = upsertGlobalSettingMock.mock.calls[0]?.[0]?.value
    expect(() => JSON.parse(blankPayloadValue)).not.toThrow()
    expect(JSON.parse(blankPayloadValue)).toEqual(expect.objectContaining({ lastRunAtIso: expect.any(String) }))

    const validPayload = `  {"lastRunAtIso":"2026-02-16T05:00:00.000Z","reason":"locked"}  `
    await updateWorkerHeartbeat(WORKER_IDS.ORDER_EXECUTION, validPayload)
    expect(upsertGlobalSettingMock.mock.calls[1]?.[0]?.value).toBe(validPayload.trim())

    await updateWorkerHeartbeat(WORKER_IDS.ORDER_EXECUTION, `{"reason":"missing-ts"}`)
    const malformedPayloadValue = upsertGlobalSettingMock.mock.calls[2]?.[0]?.value
    expect(malformedPayloadValue).not.toBe(`{"reason":"missing-ts"}`)
    expect(() => JSON.parse(malformedPayloadValue)).not.toThrow()
    expect(JSON.parse(malformedPayloadValue)).toEqual(expect.objectContaining({ lastRunAtIso: expect.any(String) }))
  })

  it("rejects unknown worker identifiers for heartbeat and enable mutations", async () => {
    await expect(updateWorkerHeartbeat("unknown_worker" as any, `{"lastRunAtIso":"2026-02-16T05:00:00.000Z"}`)).rejects.toThrow(
      "Unknown workerId",
    )
    await expect(setWorkerEnabled("unknown_worker" as any, true)).rejects.toThrow("Unknown workerId")
    expect(upsertGlobalSettingMock).not.toHaveBeenCalled()
  })
})

