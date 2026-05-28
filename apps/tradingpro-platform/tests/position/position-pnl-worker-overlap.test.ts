/**
 * @file tests/position/position-pnl-worker-overlap.test.ts
 * @module tests-position
 * @description Unit test for in-process overlap guard in PositionPnLWorker.
 * @author StockTrade
 * @created 2026-02-15
 */

import { Prisma } from "@prisma/client"

jest.mock("@/lib/market-data/server-market-data.service", () => {
  const svc = {
    ensureInitialized: jest.fn(async () => {}),
    ensureSubscribed: jest.fn(() => {}),
    waitForFreshQuote: jest.fn(async () => null),
    getQuote: jest.fn(() => ({
      instrumentToken: 26000,
      last_trade_price: 110,
      close: 105,
      prev_close_price: 105,
      receivedAt: Date.now(),
    })),
  }
  return { getServerMarketDataService: () => svc }
})

jest.mock("@/lib/redis/redis-client", () => {
  return {
    isRedisEnabled: jest.fn(() => true),
    redisSet: jest.fn(async () => {}),
  }
})

jest.mock("@/lib/server/workers/system-settings", () => {
  return {
    getLatestActiveGlobalSettings: jest.fn(async () => {
      const m = new Map<string, { value: string }>()
      m.set("position_pnl_mode", { value: "server" })
      return m
    }),
  }
})

jest.mock("@/lib/server/workers/worker-run-lock", () => ({
  tryAcquireWorkerRunLock: jest.fn(async () => ({
    acquired: true,
    key: "worker_run_lock_position_pnl",
    ownerToken: "owner-overlap-test",
    acquiredAtMs: Date.now(),
    expiresAtMs: Date.now() + 60_000,
  })),
  releaseWorkerRunLock: jest.fn(async () => {}),
}))

jest.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: jest.fn(async () => [{ ok: true }]),
    systemSettings: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
  }

  return {
    prisma: {
      __tx: tx,
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      position: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      systemSettings: tx.systemSettings,
    },
  }
})

import { PositionPnLWorker } from "@/lib/services/position/PositionPnLWorker"

const prismaMock = jest.requireMock("@/lib/prisma").prisma as {
  position: { findMany: jest.Mock; update: jest.Mock }
}

describe("PositionPnLWorker overlap guard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("skips a second run when one run is already active", async () => {
    let releaseFindMany: ((value: any[]) => void) | null = null
    const holdPositionsPromise = new Promise<any[]>((resolve) => {
      releaseFindMany = resolve
    })

    prismaMock.position.findMany.mockImplementationOnce(() => holdPositionsPromise)
    prismaMock.position.update.mockResolvedValue({ id: "p-1" })

    const worker = new PositionPnLWorker()
    const run1 = worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    // Yield once so run1 can set `isRunning=true` and block on findMany
    await new Promise((resolve) => setTimeout(resolve, 0))

    const run2 = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })
    expect(run2.success).toBe(true)
    expect(run2.heartbeat.reason).toBe("already_running")

    if (releaseFindMany) {
      releaseFindMany([
        {
          id: "p-1",
          quantity: 1,
          averagePrice: new Prisma.Decimal("100.00"),
          unrealizedPnL: new Prisma.Decimal("0.00"),
          dayPnL: new Prisma.Decimal("0.00"),
          tradingAccount: { userId: "u-1" },
          Stock: { instrumentId: "NSE_EQ-26000", ltp: 0 },
        },
      ])
    }

    const run1Result = await run1
    expect(run1Result.success).toBe(true)
  })
})

