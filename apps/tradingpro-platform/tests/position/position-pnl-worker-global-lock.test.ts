/**
 * @file tests/position/position-pnl-worker-global-lock.test.ts
 * @module tests-position
 * @description Unit test for global worker lock skip behavior in PositionPnLWorker.
 * @author StockTrade
 * @created 2026-02-15
 */

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => ({
    ensureInitialized: jest.fn(async () => {}),
    ensureSubscribed: jest.fn(() => {}),
    waitForFreshQuote: jest.fn(async () => null),
    getQuote: jest.fn(() => null),
  }),
}))

jest.mock("@/lib/redis/redis-client", () => ({
  isRedisEnabled: jest.fn(() => true),
  redisSet: jest.fn(async () => {}),
}))

jest.mock("@/lib/server/workers/system-settings", () => ({
  getLatestActiveGlobalSettings: jest.fn(async () => {
    const m = new Map<string, { value: string }>()
    m.set("position_pnl_mode", { value: "server" })
    return m
  }),
}))

const tryAcquireWorkerRunLockMock = jest.fn()
const releaseWorkerRunLockMock = jest.fn(async () => {})

jest.mock("@/lib/server/workers/worker-run-lock", () => ({
  tryAcquireWorkerRunLock: (...args: any[]) => tryAcquireWorkerRunLockMock(...args),
  releaseWorkerRunLock: (...args: any[]) => releaseWorkerRunLockMock(...args),
}))

jest.mock("@/lib/prisma", () => {
  const tx = {
    systemSettings: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
  }
  return {
    prisma: {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      position: {
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => ({})),
      },
      systemSettings: tx.systemSettings,
    },
  }
})

import { PositionPnLWorker } from "@/lib/services/position/PositionPnLWorker"

describe("PositionPnLWorker global lock", () => {
  const originalPositionPnlWorkerLockTtlMs = process.env.POSITION_PNL_WORKER_LOCK_TTL_MS

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env.POSITION_PNL_WORKER_LOCK_TTL_MS = originalPositionPnlWorkerLockTtlMs
  })

  it("returns locked heartbeat when global run lock is not acquired", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_position_pnl",
      ownerToken: "owner",
      expiresAtMs: Date.now() + 60_000,
    })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({ limit: 10 })

    expect(result.success).toBe(true)
    expect(result.heartbeat.reason).toBe("locked")
    expect(releaseWorkerRunLockMock).not.toHaveBeenCalled()
  })

  it("completes successfully when lock release fails after processing", async () => {
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: true,
      key: "worker_run_lock_position_pnl",
      ownerToken: "owner-release-error",
      expiresAtMs: Date.now() + 60_000,
    })
    releaseWorkerRunLockMock.mockRejectedValueOnce(new Error("release-failed"))

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({ limit: 10 })

    expect(result.success).toBe(true)
    expect(result.scanned).toBe(0)
    expect(releaseWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerToken: "owner-release-error" }),
    )
  })

  it("uses default lock TTL when env override is blank", async () => {
    process.env.POSITION_PNL_WORKER_LOCK_TTL_MS = "   "
    tryAcquireWorkerRunLockMock.mockResolvedValue({
      acquired: false,
      reason: "locked",
      key: "worker_run_lock_position_pnl",
      ownerToken: "owner-blank-ttl",
      expiresAtMs: Date.now() + 60_000,
    })

    const worker = new PositionPnLWorker()
    await worker.processPositionPnL({ limit: 10 })

    expect(tryAcquireWorkerRunLockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "position_pnl",
        ttlMs: 120_000,
      }),
    )
  })
})

