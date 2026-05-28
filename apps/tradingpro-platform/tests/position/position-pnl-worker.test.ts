/**
 * @file tests/position/position-pnl-worker.test.ts
 * @module tests-position
 * @description Unit tests for `PositionPnLWorker` marketdata quote cache integration (no external WS/DB required).
 * @author StockTrade
 * @created 2026-02-12
 */

import { Prisma } from "@prisma/client"

jest.mock("@/lib/market-data/server-market-data.service", () => {
  const svc = {
    ensureInitialized: jest.fn(async () => {}),
    ensureSubscribed: jest.fn(() => {}),
    waitForFreshQuote: jest.fn(async () => ({
      instrumentToken: 26000,
      last_trade_price: 110,
      close: 105,
      prev_close_price: 105,
      receivedAt: Date.now(),
    })),
    getQuote: jest.fn(() => ({
      instrumentToken: 26000,
      last_trade_price: 110,
      close: 105,
      prev_close_price: 105,
      receivedAt: Date.now(),
    })),
  }

  return {
    getServerMarketDataService: () => svc,
    SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS: 1_500,
    __svc: svc,
  }
})

jest.mock("@/lib/redis/redis-client", () => {
  return {
    isRedisEnabled: jest.fn(() => true),
    redisSet: jest.fn(async () => {}),
  }
})

jest.mock("@/lib/server/workers/system-settings", () => {
  return {
    getLatestActiveGlobalSettings: jest.fn(async (keys: string[]) => {
      const m = new Map<string, { value: string }>()
      if (keys.includes("position_pnl_mode")) {
        m.set("position_pnl_mode", { value: "server" })
      }
      return m
    }),
  }
})

jest.mock("@/lib/server/workers/worker-run-lock", () => {
  return {
    tryAcquireWorkerRunLock: jest.fn(async () => ({
      acquired: true,
      key: "position_pnl",
      ownerToken: "owner-token",
      acquiredAtMs: Date.now(),
      expiresAtMs: Date.now() + 120_000,
    })),
    releaseWorkerRunLock: jest.fn(async () => {}),
  }
})

const realtimeEmitMock = jest.fn()
jest.mock("@/lib/services/realtime/RealtimeEventEmitter", () => ({
  getRealtimeEventEmitter: jest.fn(() => ({ emit: realtimeEmitMock })),
}))

jest.mock("@/lib/server/market-timing", () => {
  return {
    getISTDateKey: jest.fn(() => "2026-02-21"),
    normalizeIntradaySquareOffPreCloseBufferMinutes: jest.fn((value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(1, Math.min(120, Math.trunc(value)))
      }
      return 15
    }),
    getSegmentIntradaySquareOffWindowDecision: jest.fn(async (input?: { segment?: string | null }) => {
      const segmentHint = typeof input?.segment === "string" ? input.segment.trim().toUpperCase() : "NSE"
      return {
        shouldSquareOffNow: false,
        segment: segmentHint.startsWith("MCX") ? "MCX" : "NSE",
        dateKeyIst: "2026-02-21",
        nowMinutesIst: 900,
        closeMinutesIst: 930,
        windowStartMinutesIst: 915,
        preCloseBufferMinutes: 15,
        reason: "Outside pre-close square-off window",
      }
    }),
  }
})

jest.mock("@/lib/services/risk/risk-thresholds", () => {
  return {
    getRiskThresholds: jest.fn(async () => ({
      warningThreshold: 0.75,
      autoCloseThreshold: 0.8,
      source: "default",
    })),
  }
})

jest.mock("@/lib/services/position/PositionManagementService", () => {
  const svc = {
    closePosition: jest.fn(async () => ({
      success: true,
      positionId: "mock-position",
      exitOrderId: "mock-exit-order",
      realizedPnL: 0,
      exitPrice: 0,
      marginReleased: 0,
      message: "mock close ok",
    })),
  }
  return {
    createPositionManagementService: () => svc,
    __svc: svc,
  }
})

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
      riskAlert: {
        create: jest.fn(),
      },
      tradingAccount: {
        findUnique: jest.fn(async () => ({ balance: 200, availableMargin: 0 })),
      },
      systemSettings: tx.systemSettings,
    },
  }
})

import { PositionPnLWorker } from "@/lib/services/position/PositionPnLWorker"

const prismaMock = jest.requireMock("@/lib/prisma").prisma as any

const marketSvcMock = jest.requireMock("@/lib/market-data/server-market-data.service").__svc as {
  ensureInitialized: jest.Mock
  ensureSubscribed: jest.Mock
  waitForFreshQuote: jest.Mock
  getQuote: jest.Mock
}

const redisMock = jest.requireMock("@/lib/redis/redis-client") as {
  redisSet: jest.Mock
}

const positionMgmtMock = jest.requireMock("@/lib/services/position/PositionManagementService").__svc as {
  closePosition: jest.Mock
}

const systemSettingsMock = jest.requireMock("@/lib/server/workers/system-settings") as {
  getLatestActiveGlobalSettings: jest.Mock
}

const marketTimingMock = jest.requireMock("@/lib/server/market-timing") as {
  getSegmentIntradaySquareOffWindowDecision: jest.Mock
}

describe("PositionPnLWorker", () => {
  const originalPositionPnlWorkerLockTtlMs = process.env.POSITION_PNL_WORKER_LOCK_TTL_MS
  const originalRedisPositionsPnlTtlSeconds = process.env.REDIS_POSITIONS_PNL_TTL_SECONDS

  beforeEach(() => {
    jest.clearAllMocks()
    realtimeEmitMock.mockReset()
    delete (globalThis as any).__riskAlertThrottleByAccount
    systemSettingsMock.getLatestActiveGlobalSettings.mockImplementation(async (keys: string[]) => {
      const m = new Map<string, { key: string; value: string; updatedAt: Date }>()
      if (keys.includes("position_pnl_mode")) {
        m.set("position_pnl_mode", {
          key: "position_pnl_mode",
          value: "server",
          updatedAt: new Date("2026-02-21T09:00:00.000Z"),
        })
      }
      return m
    })
    marketTimingMock.getSegmentIntradaySquareOffWindowDecision.mockImplementation(async (input?: { segment?: string | null }) => {
      const segmentHint = typeof input?.segment === "string" ? input.segment.trim().toUpperCase() : "NSE"
      return {
        shouldSquareOffNow: false,
        segment: segmentHint.startsWith("MCX") ? "MCX" : "NSE",
        dateKeyIst: "2026-02-21",
        nowMinutesIst: 900,
        closeMinutesIst: 930,
        windowStartMinutesIst: 915,
        preCloseBufferMinutes: 15,
        reason: "Outside pre-close square-off window",
      }
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    marketSvcMock.getQuote.mockReset()
    marketSvcMock.getQuote.mockImplementation(() => ({
      instrumentToken: 26000,
      last_trade_price: 110,
      close: 105,
      prev_close_price: 105,
      receivedAt: Date.now(),
    }))
    process.env.POSITION_PNL_WORKER_LOCK_TTL_MS = originalPositionPnlWorkerLockTtlMs
    process.env.REDIS_POSITIONS_PNL_TTL_SECONDS = originalRedisPositionsPnlTtlSeconds
  })

  it("SSE positions_pnl_updated includes currentPrice when cached quote tick is fresh", async () => {
    jest.useFakeTimers({ now: new Date("2026-03-21T10:00:00.000Z") })
    marketSvcMock.getQuote.mockReturnValue({
      instrumentToken: 26000,
      last_trade_price: 9205,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now() - 2000,
    })
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-sse-fresh",
        tradingAccountId: "ta-sse",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        tradingAccount: { userId: "u-sse-fresh", balance: 1000, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0 },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-sse-fresh" })

    const worker = new PositionPnLWorker()
    await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    const pnlCall = realtimeEmitMock.mock.calls.find((c) => c[1] === "positions_pnl_updated")
    expect(pnlCall).toBeDefined()
    const payload = (pnlCall![2] as { updates: Array<{ positionId: string; currentPrice?: number }> }).updates
    const u = payload.find((x) => x.positionId === "p-sse-fresh")
    expect(u).toBeDefined()
    expect(u!.currentPrice).toBe(9205)

    jest.useRealTimers()
  })

  it("SSE positions_pnl_updated includes last in-process tick when fresh quote is null", async () => {
    jest.useFakeTimers({ now: new Date("2026-03-21T10:00:00.000Z") })
    const staleTick = {
      instrumentToken: 26000,
      last_trade_price: 8300,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now() - 120_000,
    }
    marketSvcMock.getQuote.mockImplementation((_token: number, opts?: { maxAgeMs?: number }) => {
      if (opts?.maxAgeMs === 0) {
        return staleTick
      }
      return null
    })
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-sse-stale",
        tradingAccountId: "ta-sse",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        tradingAccount: { userId: "u-sse-stale", balance: 1000, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 50 },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-sse-stale" })

    const worker = new PositionPnLWorker()
    await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    const pnlCall = realtimeEmitMock.mock.calls.find((c) => c[1] === "positions_pnl_updated")
    expect(pnlCall).toBeDefined()
    const payload = (pnlCall![2] as { updates: Array<{ positionId: string; currentPrice?: number }> }).updates
    const u = payload.find((x) => x.positionId === "p-sse-stale")
    expect(u).toBeDefined()
    expect(u!.currentPrice).toBe(8300)
  })

  it("SSE positions_pnl_updated omits currentPrice when no in-process tick exists", async () => {
    jest.useFakeTimers({ now: new Date("2026-03-21T10:00:00.000Z") })
    marketSvcMock.getQuote.mockImplementation(() => null)
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-sse-none",
        tradingAccountId: "ta-sse",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        tradingAccount: { userId: "u-sse-none", balance: 1000, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 50 },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-sse-none" })

    const worker = new PositionPnLWorker()
    await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    const pnlCall = realtimeEmitMock.mock.calls.find((c) => c[1] === "positions_pnl_updated")
    expect(pnlCall).toBeDefined()
    const payload = (pnlCall![2] as { updates: Array<{ positionId: string; currentPrice?: number }> }).updates
    const u = payload.find((x) => x.positionId === "p-sse-none")
    expect(u).toBeDefined()
    expect(u!.currentPrice).toBeUndefined()
  })

  it("subscribes to position tokens and persists PnL from cached WS quotes", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-1",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "p-1" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(marketSvcMock.ensureInitialized).toHaveBeenCalled()
    expect(marketSvcMock.ensureSubscribed).toHaveBeenCalledWith(["NSE_EQ-26000"])
    expect(marketSvcMock.waitForFreshQuote).toHaveBeenCalledWith(
      26000,
      expect.objectContaining({ timeoutMs: 1000, resubscribeRetryTimeoutMs: 1_500 }),
    )
    expect(marketSvcMock.getQuote).toHaveBeenCalledWith(26000)
    expect(marketSvcMock.getQuote).toHaveBeenCalledWith(26000, { maxAgeMs: 0 })
    expect(prismaMock.position.update).toHaveBeenCalledTimes(1)
    expect(redisMock.redisSet).toHaveBeenCalled()

    const updateCall = prismaMock.position.update.mock.calls[0]?.[0]
    expect(updateCall.where).toEqual({ id: "p-1" })
    expect(String(updateCall.data.unrealizedPnL)).toContain("10")
    expect(String(updateCall.data.dayPnL)).toContain("5")
  })

  it("prefers persisted Stock.token when instrumentId parsing fails", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-token-priority",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-INVALID",
          token: 26009,
          ltp: 0,
        },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-token-priority" })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(result.success).toBe(true)
    expect(marketSvcMock.ensureSubscribed).toHaveBeenCalledWith(["NSE_EQ-26009"])
    expect(marketSvcMock.waitForFreshQuote).toHaveBeenCalledWith(
      26009,
      expect.objectContaining({ timeoutMs: 1000, resubscribeRetryTimeoutMs: 1_500 }),
    )
    expect(marketSvcMock.getQuote).toHaveBeenCalledWith(26009)
    expect(marketSvcMock.getQuote).toHaveBeenCalledWith(26009, { maxAgeMs: 0 })
  })

  it("normalizes malformed input payloads before batch execution", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-2",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-2" })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({
      limit: Number.NaN as unknown as number,
      updateThreshold: Number.NaN as unknown as number,
      dryRun: "false" as unknown as boolean,
    })

    expect(result.success).toBe(true)
    expect(prismaMock.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
      }),
    )
    expect(prismaMock.position.update).toHaveBeenCalledTimes(1)
  })

  it("treats blank numeric inputs and env overrides as defaults", async () => {
    process.env.POSITION_PNL_WORKER_LOCK_TTL_MS = "   "
    process.env.REDIS_POSITIONS_PNL_TTL_SECONDS = "  "

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-3",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-3" })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({
      limit: "   " as unknown as number,
      updateThreshold: " " as unknown as number,
    })

    expect(result.success).toBe(true)
    expect(prismaMock.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
      }),
    )
    expect(redisMock.redisSet).toHaveBeenCalledWith(expect.any(String), expect.any(String), 120)
  })

  it("treats status-word dryRun alias as true and skips writes", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-4",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({
      dryRun: "enabled" as unknown as boolean,
      updateThreshold: 0,
    })

    expect(result.success).toBe(true)
    expect(result.updated).toBe(1)
    expect(prismaMock.position.update).not.toHaveBeenCalled()
    expect(redisMock.redisSet).not.toHaveBeenCalled()
  })

  it("treats non-coercible numeric inputs as defaults", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-5",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-5" })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({
      limit: Symbol("limit") as any,
      updateThreshold: Symbol("threshold") as any,
    })

    expect(result.success).toBe(true)
    expect(prismaMock.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
      }),
    )
    expect(prismaMock.position.update).toHaveBeenCalledTimes(1)
  })

  it("handles non-coercible persisted pnl fields without throwing", async () => {
    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-6",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: Symbol("bad-unrealized"),
        dayPnL: Symbol("bad-day"),
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-6" })

    const worker = new PositionPnLWorker()
    const result = await worker.processPositionPnL({
      updateThreshold: 0,
    })

    expect(result.success).toBe(true)
    expect(result.errors).toBe(0)
    expect(prismaMock.position.update).toHaveBeenCalledTimes(1)
  })

  it("auto-closes a position when stopLoss is hit (server-side)", async () => {
    const live = {
      instrumentToken: 26000,
      last_trade_price: 90,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now(),
    }
    marketSvcMock.getQuote.mockImplementation(() => live)

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-sl",
        tradingAccountId: "ta-1",
        symbol: "SLTEST",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: new Prisma.Decimal("95.00"),
        target: null,
        tradingAccount: { userId: "u-1", balance: 1000, availableMargin: 0 },
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "p-sl" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledTimes(1)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-sl", "ta-1", 90)
  })

  it("auto-closes a position when target is hit (server-side)", async () => {
    const live = {
      instrumentToken: 26000,
      last_trade_price: 130,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now(),
    }
    marketSvcMock.getQuote.mockImplementation(() => live)

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-tp",
        tradingAccountId: "ta-1",
        symbol: "TPTST",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: new Prisma.Decimal("120.00"),
        tradingAccount: { userId: "u-1", balance: 1000, availableMargin: 0 },
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "p-tp" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledTimes(1)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-tp", "ta-1", 130)
  })

  it("auto-closes a short position when stopLoss is hit", async () => {
    const live = {
      instrumentToken: 26000,
      last_trade_price: 110,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now(),
    }
    marketSvcMock.getQuote.mockImplementation(() => live)

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-short-sl",
        tradingAccountId: "ta-short",
        symbol: "SHORTSL",
        quantity: -1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: new Prisma.Decimal("105.00"),
        target: null,
        tradingAccount: { userId: "u-short", balance: 1000, availableMargin: 0 },
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "p-short-sl" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledTimes(1)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-short-sl", "ta-short", 110)
  })

  it("auto-closes a short position when target is hit", async () => {
    const live = {
      instrumentToken: 26000,
      last_trade_price: 90,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now(),
    }
    marketSvcMock.getQuote.mockImplementation(() => live)

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-short-tp",
        tradingAccountId: "ta-short",
        symbol: "SHORTTP",
        quantity: -1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: new Prisma.Decimal("95.00"),
        tradingAccount: { userId: "u-short", balance: 1000, availableMargin: 0 },
        Stock: {
          instrumentId: "NSE_EQ-26000",
          ltp: 0,
        },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "p-short-tp" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledTimes(1)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-short-tp", "ta-short", 90)
  })

  it("skips SL auto-close when only stale last tick exists (increments slTpSkippedUnreliablePrice)", async () => {
    jest.useFakeTimers({ now: new Date("2026-03-21T10:00:00.000Z").getTime() })
    const staleAt = Date.now() - 120_000
    const stale = {
      instrumentToken: 26000,
      last_trade_price: 90,
      close: 100,
      prev_close_price: 100,
      receivedAt: staleAt,
    }
    marketSvcMock.getQuote.mockImplementation((_token: number, opts?: { maxAgeMs?: number }) => {
      if (opts?.maxAgeMs === 0) return stale
      return null
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-sl-stale-only",
        tradingAccountId: "ta-sl-stale",
        symbol: "SLSTALE",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: new Prisma.Decimal("95.00"),
        target: null,
        tradingAccount: { userId: "u-sl-stale", balance: 1000, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0 },
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-sl-stale-only" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).not.toHaveBeenCalled()
    expect(res.heartbeat.slTpSkippedUnreliablePrice).toBe(1)
    jest.useRealTimers()
  })

  it("auto-closes intraday long/short positions inside EOD pre-close window", async () => {
    marketTimingMock.getSegmentIntradaySquareOffWindowDecision.mockImplementation(async (input?: { segment?: string | null }) => {
      const segmentHint = typeof input?.segment === "string" ? input.segment.trim().toUpperCase() : "NSE"
      return {
        shouldSquareOffNow: true,
        segment: segmentHint.startsWith("MCX") ? "MCX" : "NSE",
        dateKeyIst: "2026-02-21",
        nowMinutesIst: 920,
        closeMinutesIst: segmentHint.startsWith("MCX") ? 1435 : 930,
        windowStartMinutesIst: segmentHint.startsWith("MCX") ? 1420 : 915,
        preCloseBufferMinutes: 15,
        reason: "Within pre-close square-off window",
      }
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-eod-long",
        tradingAccountId: "ta-eod",
        symbol: "EODLONG",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-eod", balance: 10000, availableMargin: 10000 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0, segment: "NSE" },
        orders: [
          {
            id: "o-eod-long",
            orderSide: "BUY",
            status: "EXECUTED",
            productType: "MIS",
            createdAt: new Date("2026-02-21T09:20:00.000Z"),
          },
        ],
      },
      {
        id: "p-eod-short",
        tradingAccountId: "ta-eod",
        symbol: "EODSHORT",
        quantity: -1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-eod", balance: 10000, availableMargin: 10000 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0, segment: "NSE" },
        orders: [
          {
            id: "o-eod-short",
            orderSide: "SELL",
            status: "EXECUTED",
            productType: "INTRADAY",
            createdAt: new Date("2026-02-21T09:21:00.000Z"),
          },
        ],
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "x" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-eod-long", "ta-eod", 110)
    expect(positionMgmtMock.closePosition).toHaveBeenCalledWith("p-eod-short", "ta-eod", 110)
    expect(res.heartbeat.intradayEodClosed).toBe(2)
  })

  it("skips EOD intraday square-off outside pre-close window", async () => {
    marketTimingMock.getSegmentIntradaySquareOffWindowDecision.mockResolvedValue({
      shouldSquareOffNow: false,
      segment: "NSE",
      dateKeyIst: "2026-02-21",
      nowMinutesIst: 800,
      closeMinutesIst: 930,
      windowStartMinutesIst: 915,
      preCloseBufferMinutes: 15,
      reason: "Outside pre-close square-off window",
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-eod-window-skip",
        tradingAccountId: "ta-eod-skip",
        symbol: "EODSKIP",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-eod-skip", balance: 10000, availableMargin: 10000 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0, segment: "NSE" },
        orders: [
          {
            id: "o-eod-window-skip",
            orderSide: "BUY",
            status: "EXECUTED",
            productType: "MIS",
            createdAt: new Date("2026-02-21T09:20:00.000Z"),
          },
        ],
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-eod-window-skip" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).not.toHaveBeenCalled()
    expect(res.heartbeat.intradayEodCandidates).toBe(0)
    expect(res.heartbeat.intradayEodSkipped).toBe(1)
  })

  it("does not EOD-close non-intraday product types", async () => {
    marketTimingMock.getSegmentIntradaySquareOffWindowDecision.mockResolvedValue({
      shouldSquareOffNow: true,
      segment: "NSE",
      dateKeyIst: "2026-02-21",
      nowMinutesIst: 920,
      closeMinutesIst: 930,
      windowStartMinutesIst: 915,
      preCloseBufferMinutes: 15,
      reason: "Within pre-close square-off window",
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-delivery",
        tradingAccountId: "ta-delivery",
        symbol: "DELIVERY",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-delivery", balance: 10000, availableMargin: 10000 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0, segment: "NSE" },
        orders: [
          {
            id: "o-delivery",
            orderSide: "BUY",
            status: "EXECUTED",
            productType: "CNC",
            createdAt: new Date("2026-02-21T09:20:00.000Z"),
          },
        ],
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-delivery" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).not.toHaveBeenCalled()
    expect(res.heartbeat.intradayEodCandidates).toBe(0)
    expect(res.heartbeat.intradayEodClosed).toBe(0)
  })

  it("respects per-day intraday EOD marker idempotency", async () => {
    marketTimingMock.getSegmentIntradaySquareOffWindowDecision.mockResolvedValue({
      shouldSquareOffNow: true,
      segment: "NSE",
      dateKeyIst: "2026-02-21",
      nowMinutesIst: 920,
      closeMinutesIst: 930,
      windowStartMinutesIst: 915,
      preCloseBufferMinutes: 15,
      reason: "Within pre-close square-off window",
    })
    systemSettingsMock.getLatestActiveGlobalSettings.mockImplementation(async (keys: string[]) => {
      const m = new Map<string, { key: string; value: string; updatedAt: Date }>()
      if (keys.includes("position_pnl_mode")) {
        m.set("position_pnl_mode", {
          key: "position_pnl_mode",
          value: "server",
          updatedAt: new Date("2026-02-21T09:00:00.000Z"),
        })
      }
      for (const key of keys) {
        if (key.startsWith("positions_intraday_eod_squareoff_nse_2026-02-21")) {
          m.set(key, {
            key,
            value: JSON.stringify({ markedAtIso: "2026-02-21T09:21:00.000Z" }),
            updatedAt: new Date("2026-02-21T09:21:00.000Z"),
          })
        }
      }
      return m
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-eod-marker",
        tradingAccountId: "ta-eod-marker",
        symbol: "EODMARKER",
        quantity: 1,
        averagePrice: new Prisma.Decimal("100.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-eod-marker", balance: 10000, availableMargin: 10000 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0, segment: "NSE" },
        orders: [
          {
            id: "o-eod-marker",
            orderSide: "BUY",
            status: "EXECUTED",
            productType: "MIS",
            createdAt: new Date("2026-02-21T09:20:00.000Z"),
          },
        ],
      },
    ])
    prismaMock.position.update.mockResolvedValue({ id: "p-eod-marker" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).not.toHaveBeenCalled()
    expect(res.heartbeat.intradayEodSkipped).toBe(1)
  })

  it("auto-closes worst losing position when risk autoCloseThreshold is breached", async () => {
    marketSvcMock.getQuote.mockReturnValue({
      instrumentToken: 26000,
      last_trade_price: 100,
      close: 100,
      prev_close_price: 100,
      receivedAt: Date.now(),
    })

    prismaMock.position.findMany.mockResolvedValue([
      {
        id: "p-risk-1",
        tradingAccountId: "ta-risk",
        symbol: "AAA",
        quantity: 1,
        averagePrice: new Prisma.Decimal("220.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-risk", balance: 200, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0 },
      },
      {
        id: "p-risk-2",
        tradingAccountId: "ta-risk",
        symbol: "BBB",
        quantity: 1,
        averagePrice: new Prisma.Decimal("260.00"),
        unrealizedPnL: new Prisma.Decimal("0.00"),
        dayPnL: new Prisma.Decimal("0.00"),
        stopLoss: null,
        target: null,
        tradingAccount: { userId: "u-risk", balance: 200, availableMargin: 0 },
        Stock: { instrumentId: "NSE_EQ-26000", ltp: 0 },
      },
    ])

    prismaMock.position.update.mockResolvedValue({ id: "x" })

    const worker = new PositionPnLWorker()
    const res = await worker.processPositionPnL({ limit: 10, updateThreshold: 0 })

    expect(res.success).toBe(true)
    expect(positionMgmtMock.closePosition).toHaveBeenNthCalledWith(1, "p-risk-2", "ta-risk", 100)
    expect(positionMgmtMock.closePosition).toHaveBeenNthCalledWith(2, "p-risk-1", "ta-risk", 100)
    expect(prismaMock.riskAlert.create).toHaveBeenCalled()
  })
})

