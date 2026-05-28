/**
 * @file tests/order/order-execution-worker.test.ts
 * @module tests-order
 * @description Unit tests for `OrderExecutionWorker` cancellation/skip behavior (no DB required).
 * @author StockTrade
 * @created 2026-02-03
 */

import { OrderSide, OrderStatus, OrderType } from "@prisma/client"

const calculateMarginMock = jest.fn()
jest.mock("@/lib/services/risk/MarginCalculator", () => ({
  MarginCalculator: jest.fn().mockImplementation(() => ({
    calculateMargin: (...args: any[]) => calculateMarginMock(...args),
  })),
}))

const releaseMarginTxMock = jest.fn()
const creditTxMock = jest.fn()
const blockMarginTxMock = jest.fn()
jest.mock("@/lib/services/funds/FundManagementService", () => ({
  FundManagementService: jest.fn().mockImplementation(() => ({
    releaseMarginTx: (...args: any[]) => releaseMarginTxMock(...args),
    creditTx: (...args: any[]) => creditTxMock(...args),
    blockMarginTx: (...args: any[]) => blockMarginTxMock(...args),
  })),
}))

const marketSvcMock = {
  ensureInitialized: jest.fn(async () => {}),
  ensureSubscribed: jest.fn(() => {}),
  waitForFreshQuote: jest.fn(async () => null),
  getQuote: jest.fn(() => null),
  getHealth: jest.fn(() => ({ isConnected: true })),
}
jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => marketSvcMock,
}))

jest.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: jest.fn(),
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  }

  return {
    prisma: {
      // Expose tx for unit tests
      __tx: tx,
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      order: tx.order,
    },
  }
})

import { OrderExecutionWorker } from "@/lib/services/order/OrderExecutionWorker"

const prismaMock = jest.requireMock("@/lib/prisma").prisma as {
  __tx: {
    $queryRaw: jest.Mock
    order: {
      findUnique: jest.Mock
      update: jest.Mock
      findMany: jest.Mock
    }
  }
  $transaction: jest.Mock
  order: {
    findUnique: jest.Mock
    update: jest.Mock
    findMany: jest.Mock
  }
}

const txMock = prismaMock.__tx

describe("OrderExecutionWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    calculateMarginMock.mockResolvedValue({ requiredMargin: 100 })
    releaseMarginTxMock.mockResolvedValue(undefined)
    // Default: advisory lock acquired
    txMock.$queryRaw.mockResolvedValue([{ locked: true }])
  })

  it("uses single-argument bigint advisory lock key (regression)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(null)

    const worker = new OrderExecutionWorker()
    await worker.processOrderById("o-lock-regression")

    expect(txMock.$queryRaw).toHaveBeenCalled()
    const firstCallArg = txMock.$queryRaw.mock.calls[0]?.[0] as any

    // Prisma.sql(...) typically produces an object with a `.sql` string field.
    const sqlText =
      typeof firstCallArg === "string"
        ? firstCallArg
        : typeof firstCallArg?.sql === "string"
          ? firstCallArg.sql
          : ""

    expect(sqlText).toContain("pg_try_advisory_xact_lock")
    expect(sqlText).toContain("<< 32")
    expect(sqlText).toContain("hashtext")
    // Guard against reintroducing the 2-argument overload usage.
    expect(sqlText).not.toMatch(/pg_try_advisory_xact_lock\s*\([^)]*,/)
  })

  it("defers MARKET order within retry window when fresh quote is unavailable", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-defer-1",
      status: OrderStatus.PENDING,
      tradingAccountId: "acct-1",
      symbol: "RELIANCE",
      quantity: 1,
      orderType: OrderType.MARKET,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      price: null,
      averagePrice: null,
      stockId: "s-1",
      createdAt: new Date(),
      Stock: { id: "s-1", ltp: 0, segment: "NSE", lot_size: 1 },
      tradingAccount: { id: "acct-1", userId: "u-1" }
    })

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("o-defer-1")

    expect(outcome).toBe("deferred")
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it("cancels MARKET order after retry window when quote remains stale", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-1",
      status: OrderStatus.PENDING,
      tradingAccountId: "acct-1",
      symbol: "RELIANCE",
      quantity: 1,
      orderType: OrderType.MARKET,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      price: null,
      averagePrice: null,
      stockId: "s-1",
      createdAt: new Date(Date.now() - 2 * 60 * 1000),
      Stock: { id: "s-1", ltp: 0, segment: "NSE", lot_size: 1 },
      tradingAccount: { id: "acct-1", userId: "u-1" }
    })

    prismaMock.order.update.mockResolvedValue({ id: "o-1", status: OrderStatus.CANCELLED })

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("o-1")

    expect(outcome).toBe("cancelled")
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "o-1" },
        data: expect.objectContaining({
          status: OrderStatus.CANCELLED,
          failureCode: "EXCHANGE_REJECTED_STALE_QUOTE",
          failureReason: expect.stringContaining("Exchange rejected: stale quote"),
        }),
      }),
    )
  })

  it("defers LIMIT BUY when last trade is above limit (not marketable)", async () => {
    marketSvcMock.waitForFreshQuote.mockResolvedValue({ last_trade_price: 150 } as any)
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-limit-buy-wait",
      status: OrderStatus.PENDING,
      tradingAccountId: "acct-1",
      symbol: "RELIANCE",
      quantity: 1,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      price: 100,
      averagePrice: null,
      stockId: "s-1",
      blockedMargin: 100,
      placementCharges: 0,
      createdAt: new Date(),
      Stock: {
        id: "s-1",
        ltp: 150,
        segment: "NSE",
        lot_size: 1,
        instrumentId: "NSE_EQ-26000",
        token: 26000,
      },
      tradingAccount: { id: "acct-1", userId: "u-1" },
    })

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("o-limit-buy-wait")

    expect(outcome).toBe("deferred")
    expect(marketSvcMock.waitForFreshQuote).toHaveBeenCalled()
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it("defers LIMIT SELL when last trade is below limit (not marketable)", async () => {
    marketSvcMock.waitForFreshQuote.mockResolvedValue({ last_trade_price: 90 } as any)
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-limit-sell-wait",
      status: OrderStatus.PENDING,
      tradingAccountId: "acct-1",
      symbol: "RELIANCE",
      quantity: 1,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.SELL,
      productType: "MIS",
      price: 100,
      averagePrice: null,
      stockId: "s-1",
      blockedMargin: 100,
      placementCharges: 0,
      createdAt: new Date(),
      Stock: {
        id: "s-1",
        ltp: 90,
        segment: "NSE",
        lot_size: 1,
        instrumentId: "NSE_EQ-26000",
        token: 26000,
      },
      tradingAccount: { id: "acct-1", userId: "u-1" },
    })

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("o-limit-sell-wait")

    expect(outcome).toBe("deferred")
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it("skips when order is not found", async () => {
    prismaMock.order.findUnique.mockResolvedValue(null)

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("missing")

    expect(outcome).toBe("skipped")
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it("skips when order is not PENDING", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-2",
      status: OrderStatus.EXECUTED
    })

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("o-2")

    expect(outcome).toBe("skipped")
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it("skips without DB queries when orderId is blank/invalid", async () => {
    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("   ")

    expect(outcome).toBe("skipped")
    expect(txMock.$queryRaw).not.toHaveBeenCalled()
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled()
  })

  it("trims whitespace-padded orderId before lock/query execution", async () => {
    prismaMock.order.findUnique.mockResolvedValue(null)

    const worker = new OrderExecutionWorker()
    const outcome = await worker.processOrderById("  order-trimmed-1  ")

    expect(outcome).toBe("skipped")
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-trimmed-1" },
      }),
    )
  })

  it("normalizes malformed batch inputs before pending-order query", async () => {
    prismaMock.order.findMany.mockResolvedValue([])

    const worker = new OrderExecutionWorker()
    const result = await worker.processPendingOrders({
      limit: Number.NaN as unknown as number,
      maxAgeMs: -50 as unknown as number,
    })

    expect(result).toEqual({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          status: OrderStatus.PENDING,
        }),
      }),
    )

    const whereClause = prismaMock.order.findMany.mock.calls[0]?.[0]?.where
    expect(whereClause?.createdAt).toBeUndefined()
  })

  it("treats blank-string and boolean batch values as unset defaults", async () => {
    prismaMock.order.findMany.mockResolvedValue([])

    const worker = new OrderExecutionWorker()
    const result = await worker.processPendingOrders({
      limit: "   " as unknown as number,
      maxAgeMs: false as unknown as number,
    })

    expect(result).toEqual({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          status: OrderStatus.PENDING,
        }),
      }),
    )
    const whereClause = prismaMock.order.findMany.mock.calls[0]?.[0]?.where
    expect(whereClause?.createdAt).toBeUndefined()
  })

  it("treats null/undefined batch values as unset defaults", async () => {
    prismaMock.order.findMany.mockResolvedValue([])

    const worker = new OrderExecutionWorker()
    const result = await worker.processPendingOrders({
      limit: null as unknown as number,
      maxAgeMs: undefined as unknown as number,
    })

    expect(result).toEqual({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          status: OrderStatus.PENDING,
        }),
      }),
    )
    const whereClause = prismaMock.order.findMany.mock.calls[0]?.[0]?.where
    expect(whereClause?.createdAt).toBeUndefined()
  })

  it("treats non-coercible numeric batch values as unset defaults", async () => {
    prismaMock.order.findMany.mockResolvedValue([])

    const worker = new OrderExecutionWorker()
    const result = await worker.processPendingOrders({
      limit: Symbol("limit") as any,
      maxAgeMs: Symbol("max-age") as any,
    })

    expect(result).toEqual({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          status: OrderStatus.PENDING,
        }),
      }),
    )
    const whereClause = prismaMock.order.findMany.mock.calls[0]?.[0]?.where
    expect(whereClause?.createdAt).toBeUndefined()
  })

  it("falls back to lot size 1 during compensation when persisted lot size is malformed", async () => {
    marketSvcMock.waitForFreshQuote.mockResolvedValue({ last_trade_price: 150 } as any)
    marketSvcMock.getQuote.mockReturnValue({ last_trade_price: 150 } as any)
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o-comp-lot",
      status: OrderStatus.PENDING,
      tradingAccountId: "acct-1",
      symbol: "SBIN",
      quantity: 2,
      orderType: OrderType.MARKET,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      price: 150,
      averagePrice: null,
      stockId: "s-1",
      Stock: { id: "s-1", ltp: 150, segment: "NSE", lot_size: "not-a-number", instrumentId: "NSE_SBINEQ-1234" },
      tradingAccount: { id: "acct-1", userId: "u-1" },
    })

    const worker = new OrderExecutionWorker()
    ;(worker as any).positionRepo.upsert = jest.fn().mockRejectedValue(new Error("force-compensation"))

    const outcome = await worker.processOrderById("o-comp-lot")

    expect(outcome).toBe("cancelled")
    expect(calculateMarginMock).toHaveBeenCalledWith(
      "NSE",
      "MIS",
      2,
      150,
      1,
      OrderSide.BUY,
      expect.objectContaining({ optionType: undefined }),
    )
    expect(releaseMarginTxMock).toHaveBeenCalled()
  })

  it("subscribes parsed instrument tokens during pending batch processing", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: "o-sub-token",
        Stock: { instrumentId: "NSE_EQ-26000" },
      },
    ])

    const worker = new OrderExecutionWorker()
    const processOrderSpy = jest.spyOn(worker, "processOrderById").mockResolvedValue("skipped")

    const result = await worker.processPendingOrders({
      limit: 1,
      maxAgeMs: 0,
    })

    expect(result.scanned).toBe(1)
    expect(processOrderSpy).toHaveBeenCalledWith("o-sub-token")
    expect(marketSvcMock.ensureSubscribed).toHaveBeenCalled()
    const subArg = marketSvcMock.ensureSubscribed.mock.calls[0]?.[0] as unknown[]
    expect(Array.isArray(subArg) && subArg.length === 1).toBe(true)
  })
})

