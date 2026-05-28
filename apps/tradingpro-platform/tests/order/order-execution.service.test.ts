/**
 * @file tests/order/order-execution.service.test.ts
 * @module tests-order
 * @description Unit tests covering stock recovery helpers in OrderExecutionService
 * @author StockTrade
 * @created 2025-10-31
 * @updated 2026-04-06 — placement with zero floored charges; pricing expectations aligned with quote max-age / MARKET fallback metadata.
 */

jest.mock("@/lib/server/workers/registry", () => ({
  getWorkersSnapshot: jest.fn(),
}))

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: jest.fn(),
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS: 1_500,
}))

jest.mock("@/lib/services/utils/prisma-transaction", () => ({
  executeInTransaction: jest.fn(),
}))

jest.mock("@/lib/services/order/place-order-watchlist-hydration", () => ({
  hydratePlaceOrderFromWatchlist: jest.fn(async (input: unknown) => ({
    input,
    merged: false,
  })),
}))

import { OrderExecutionService } from "@/lib/services/order/OrderExecutionService"
import { OrderType, OrderSide } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getWorkersSnapshot } from "@/lib/server/workers/registry"
import { getServerMarketDataService } from "@/lib/market-data/server-market-data.service"
import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"

describe("OrderExecutionService stock resolution", () => {
  const buildService = () => {
    const loggerMock = {
      warn: jest.fn().mockResolvedValue(undefined),
      logSystemEvent: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined)
    } as any

    const service = new OrderExecutionService(loggerMock)
    return { service, loggerMock }
  }

  const baseInput = {
    tradingAccountId: "acct-1",
    stockId: "stock-1",
    instrumentId: "NSE_EQ-123456",
    symbol: "RELIANCE",
    quantity: 1,
    price: null,
    orderType: OrderType.MARKET,
    orderSide: OrderSide.BUY,
    productType: "MIS",
    segment: "NSE",
    exchange: "NSE",
    lotSize: 1,
    token: 123456,
    ltp: 2500,
    close: 2495,
    name: "Reliance Industries"
  }

  it("returns existing stock when found by primary id", async () => {
    const { service } = buildService()

    const existingStock = { id: "stock-1" }

    const tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue(existingStock),
        findFirst: jest.fn(),
        create: jest.fn()
      }
    }

    const result = await (service as any).ensureStockForOrder(tx, baseInput)

    expect(result).toBe(existingStock)
    expect(tx.stock.findUnique).toHaveBeenCalledTimes(1)
    expect(tx.stock.findFirst).not.toHaveBeenCalled()
    expect(tx.stock.create).not.toHaveBeenCalled()
  })

  it("recovers stock using token and instrument lookups", async () => {
    const { service, loggerMock } = buildService()

    const recoveredStock = { id: "stock-2" }

    const tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValueOnce(recoveredStock),
        create: jest.fn()
      }
    }

    const input = { ...baseInput, stockId: "missing", instrumentId: "NSE_EQ-555555", token: 555555 }

    const result = await (service as any).ensureStockForOrder(tx, input)

    expect(result).toBe(recoveredStock)
    expect(tx.stock.findUnique).toHaveBeenCalledTimes(1)
    expect(tx.stock.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.stock.create).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it("creates a new stock using watchlist metadata when none exist", async () => {
    const { service, loggerMock } = buildService()

    const createdStock = { id: "stock-3" }

    const tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(createdStock)
      }
    }

    const input = {
      ...baseInput,
      stockId: "missing",
      instrumentId: "NSE_EQ-789012",
      token: 789012,
      exchange: "NSE_EQ",
      segment: "NSE_EQ",
      ltp: 2505,
      close: 2500,
      lotSize: 1,
      strikePrice: null,
      optionType: null,
      expiry: null,
      name: "Reliance Industries"
    }

    const result = await (service as any).ensureStockForOrder(tx, input)

    expect(result).toBe(createdStock)
    expect(tx.stock.create).toHaveBeenCalledTimes(1)
    expect(tx.stock.create.mock.calls[0][0].data.instrumentId).toBe("NSE_EQ-789012")
    expect(tx.stock.create.mock.calls[0][0].data.token).toBe(789012)
    expect(loggerMock.warn).toHaveBeenCalled()
    expect(loggerMock.logSystemEvent).toHaveBeenCalled()
  })

  it("creates stock safely when instrument token segment is non-numeric", async () => {
    const { service } = buildService()

    const createdStock = { id: "stock-4" }
    const tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(createdStock),
      },
    }

    const input = {
      ...baseInput,
      stockId: "missing",
      token: undefined,
      instrumentId: "NSE_EQ-INVALID_TOKEN",
    }

    const result = await (service as any).ensureStockForOrder(tx, input)

    expect(result).toBe(createdStock)
    expect(tx.stock.create).toHaveBeenCalledTimes(1)
    expect(tx.stock.create.mock.calls[0][0].data.instrumentId).toBe("NSE_EQ-INVALID_TOKEN")
    expect(tx.stock.create.mock.calls[0][0].data.token).toBeUndefined()
  })

  it("ignores invalid compact expiry dates when creating stock records", async () => {
    const { service } = buildService()

    const createdStock = { id: "stock-5" }
    const tx = {
      stock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(createdStock),
      },
    }

    const input = {
      ...baseInput,
      stockId: "missing",
      token: 26000,
      instrumentId: "NSE_EQ-26000",
      expiry: "20260231",
    }

    const result = await (service as any).ensureStockForOrder(tx, input)

    expect(result).toBe(createdStock)
    expect(tx.stock.create).toHaveBeenCalledTimes(1)
    expect(tx.stock.create.mock.calls[0][0].data.expiry).toBeUndefined()
  })
})

describe("OrderExecutionService pricing policy", () => {
  const buildService = () => {
    const loggerMock = {
      warn: jest.fn().mockResolvedValue(undefined),
      logSystemEvent: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
      logOrder: jest.fn().mockResolvedValue(undefined),
    } as any
    return new OrderExecutionService(loggerMock)
  }

  const pricingInput = {
    tradingAccountId: "acct-pricing-1",
    stockId: "stock-pricing-1",
    instrumentId: "NSE_EQ-123456",
    symbol: "RELIANCE",
    quantity: 1,
    price: 2500,
    orderType: OrderType.MARKET,
    orderSide: OrderSide.BUY,
    productType: "MIS",
    segment: "NSE",
    exchange: "NSE",
    lotSize: 1,
    token: 123456,
    ltp: 2490,
    close: 2480,
    name: "Reliance Industries",
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("uses server-side quote price when order worker is healthy", async () => {
    const service = buildService()

    const getWorkersSnapshotMock = getWorkersSnapshot as jest.MockedFunction<typeof getWorkersSnapshot>
    getWorkersSnapshotMock.mockResolvedValue([
      { id: "order_execution", enabled: true, health: "healthy" } as any,
    ])

    const ensureInitialized = jest.fn().mockResolvedValue(undefined)
    const waitForFreshQuote = jest.fn().mockResolvedValue({ last_trade_price: 2512.4 })
    const getHealth = jest.fn().mockReturnValue({ isConnected: true })
    const getServerMarketDataServiceMock =
      getServerMarketDataService as jest.MockedFunction<typeof getServerMarketDataService>
    getServerMarketDataServiceMock.mockReturnValue({
      ensureInitialized,
      waitForFreshQuote,
      getHealth,
    } as any)

    const stockSpy = jest.spyOn(prisma.stock, "findFirst").mockResolvedValue(null as any)

    const result = await (service as any).resolveExecutionPriceForPlacement(pricingInput)

    expect(result.executionPrice).toBe(2512.4)
    expect(result.pricingPath).toBe("SERVER")
    expect(result.sourceDetail).toBe("SERVER_WS")
    expect(result.workerHealth).toBe("healthy")
    expect(waitForFreshQuote).toHaveBeenCalledWith(
      123456,
      expect.objectContaining({ maxAgeMs: 60_000, resubscribeRetryTimeoutMs: 1_500 }),
    )
    expect(stockSpy).not.toHaveBeenCalled()
  })

  it("falls back to client market metadata when fresh server quote is unavailable", async () => {
    const service = buildService()

    const getWorkersSnapshotMock = getWorkersSnapshot as jest.MockedFunction<typeof getWorkersSnapshot>
    getWorkersSnapshotMock.mockResolvedValue([
      { id: "order_execution", enabled: true, health: "stale" } as any,
    ])
    const getServerMarketDataServiceMock =
      getServerMarketDataService as jest.MockedFunction<typeof getServerMarketDataService>
    getServerMarketDataServiceMock.mockReturnValue({
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      waitForFreshQuote: jest.fn().mockResolvedValue(null),
      getHealth: jest.fn().mockReturnValue({ isConnected: false }),
    } as any)

    const result = await (service as any).resolveExecutionPriceForPlacement({
      ...pricingInput,
      price: null,
      ltp: 2491.15,
      close: 2488.55,
      ltpTimestamp: Date.now(),
    })
    expect(result).toMatchObject({
      executionPrice: 2491.15,
      pricingPath: "CLIENT_FALLBACK",
      sourceDetail: "CLIENT_LTP",
      workerHealth: "stale",
    })
    expect(getWorkersSnapshotMock).toHaveBeenCalledTimes(1)
    expect(getServerMarketDataServiceMock).toHaveBeenCalledTimes(1)
  })
})

describe("OrderExecutionService placement — zero floored charges", () => {
  const executeInTransactionMock = executeInTransaction as jest.MockedFunction<typeof executeInTransaction>

  const buildLogger = () =>
    ({
      logOrder: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
      warn: jest.fn().mockResolvedValue(undefined),
      logSystemEvent: jest.fn().mockResolvedValue(undefined),
    }) as any

  beforeEach(() => {
    executeInTransactionMock.mockImplementation(async (fn: any) => fn({}))
    jest.spyOn(prisma.tradingAccount, "findUnique").mockResolvedValue({ id: "acct-zc", userId: "user-zc" } as any)
  })

  afterEach(() => {
    executeInTransactionMock.mockReset()
    executeInTransactionMock.mockImplementation(async (fn: any) => fn({}))
    jest.restoreAllMocks()
  })

  it("skips debitTx when totalCharges is 0 but still blocks margin", async () => {
    const service = new OrderExecutionService(buildLogger())

    jest.spyOn(service as any, "resolveExecutionPriceForPlacement").mockResolvedValue({
      executionPrice: 100,
      pricingPath: "LIMIT",
      sourceDetail: "LIMIT_ORDER",
      workerHealth: "healthy",
    })

    jest.spyOn((service as any).marginCalculator, "calculateMargin").mockResolvedValue({
      requiredMargin: 50,
      totalCharges: 0,
      totalRequired: 50,
      brokerage: 0,
      leverage: 5,
      turnover: 100,
      segment: "NSE",
      productType: "MIS",
      chargesBreakdown: {},
    })
    jest.spyOn((service as any).marginCalculator, "validateMargin").mockResolvedValue({
      isValid: true,
      availableMargin: 100000,
      requiredAmount: 50,
      shortfall: 0,
    })

    jest.spyOn(service as any, "ensureStockForOrder").mockResolvedValue({
      id: "stock-zc",
      segment: "NSE",
      lot_size: 1,
    })
    jest.spyOn((service as any).orderRepo, "create").mockResolvedValue({ id: "ord-zc-1" })

    const debitTx = jest.spyOn((service as any).fundService, "debitTx")
    const blockMarginTx = jest.spyOn((service as any).fundService, "blockMarginTx").mockResolvedValue({
      success: true,
      newBalance: 0,
      newAvailableMargin: 0,
      newUsedMargin: 0,
      transactionId: "tx-1",
    })

    const result = await service.placeOrder({
      tradingAccountId: "acct-zc",
      userId: "user-zc",
      symbol: "ZC",
      quantity: 1,
      price: 100,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      segment: "NSE",
      exchange: "NSE",
      token: 1,
    })

    expect(result.success).toBe(true)
    expect(result.orderId).toBe("ord-zc-1")
    expect(debitTx).not.toHaveBeenCalled()
    expect(blockMarginTx).toHaveBeenCalledTimes(1)
  })

  it("skips blockMarginTx and debitTx when required margin and charges are both 0", async () => {
    const service = new OrderExecutionService(buildLogger())

    jest.spyOn(service as any, "resolveExecutionPriceForPlacement").mockResolvedValue({
      executionPrice: 1,
      pricingPath: "LIMIT",
      sourceDetail: "LIMIT_ORDER",
      workerHealth: "healthy",
    })

    jest.spyOn((service as any).marginCalculator, "calculateMargin").mockResolvedValue({
      requiredMargin: 0,
      totalCharges: 0,
      totalRequired: 0,
      brokerage: 0,
      leverage: 100,
      turnover: 1,
      segment: "NSE",
      productType: "MIS",
      chargesBreakdown: {},
    })
    jest.spyOn((service as any).marginCalculator, "validateMargin").mockResolvedValue({
      isValid: true,
      availableMargin: 100000,
      requiredAmount: 0,
      shortfall: 0,
    })

    jest.spyOn(service as any, "ensureStockForOrder").mockResolvedValue({
      id: "stock-zc2",
      segment: "NSE",
      lot_size: 1,
    })
    jest.spyOn((service as any).orderRepo, "create").mockResolvedValue({ id: "ord-zc-2" })

    const debitTx = jest.spyOn((service as any).fundService, "debitTx")
    const blockMarginTx = jest.spyOn((service as any).fundService, "blockMarginTx").mockResolvedValue({
      success: true,
      newBalance: 0,
      newAvailableMargin: 0,
      newUsedMargin: 0,
      transactionId: "tx-2",
    })

    const result = await service.placeOrder({
      tradingAccountId: "acct-zc",
      userId: "user-zc",
      symbol: "ZC2",
      quantity: 1,
      price: 1,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.BUY,
      productType: "MIS",
      segment: "NSE",
      exchange: "NSE",
      token: 2,
    })

    expect(result.success).toBe(true)
    expect(debitTx).not.toHaveBeenCalled()
    expect(blockMarginTx).not.toHaveBeenCalled()
  })
})

