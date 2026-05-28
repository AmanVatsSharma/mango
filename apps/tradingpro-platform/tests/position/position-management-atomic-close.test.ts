/**
 * @file tests/position/position-management-atomic-close.test.ts
 * @module tests-position
 * @description Verifies closePosition uses tx-scoped fund settlement methods atomically.
 * @author StockTrade
 * @created 2026-02-15
 * @updated 2026-04-08 — Option close passes marginRiskSide for opening long/short profile.
 */

const mockExecuteInTransaction = jest.fn()
const mockPositionRepo = {
  findById: jest.fn(),
  close: jest.fn(),
    findActive: jest.fn(),
    update: jest.fn(),
    getStatistics: jest.fn(),
}
const mockOrderRepo = {
  create: jest.fn(),
  markExecuted: jest.fn(),
}
const mockFundService = {
  releaseMarginTx: jest.fn(),
  creditTx: jest.fn(),
  debitTx: jest.fn(),
  releaseMargin: jest.fn(),
  credit: jest.fn(),
  debit: jest.fn(),
}
const mockMarginCalculator = {
  calculateMargin: jest.fn(),
}
const mockLogger = {
  logPosition: jest.fn().mockResolvedValue(undefined),
  error: jest.fn().mockResolvedValue(undefined),
}

jest.mock("@/lib/services/utils/prisma-transaction", () => ({
  executeInTransaction: (...args: any[]) => mockExecuteInTransaction(...args),
}))

jest.mock("@/lib/repositories/PositionRepository", () => ({
  PositionRepository: jest.fn().mockImplementation(() => mockPositionRepo),
}))

jest.mock("@/lib/repositories/OrderRepository", () => ({
  OrderRepository: jest.fn().mockImplementation(() => mockOrderRepo),
}))

jest.mock("@/lib/services/funds/FundManagementService", () => ({
  FundManagementService: jest.fn().mockImplementation(() => mockFundService),
}))

jest.mock("@/lib/services/risk/MarginCalculator", () => ({
  MarginCalculator: jest.fn().mockImplementation(() => mockMarginCalculator),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => mockLogger),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    stock: {
      findFirst: jest.fn(),
    },
  },
}))

import { PositionManagementService } from "@/lib/services/position/PositionManagementService"

describe("PositionManagementService closePosition atomic settlement", () => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    position: {
      findUnique: jest.fn().mockResolvedValue({
        quantity: 1,
        unrealizedPnL: 0,
        dayPnL: 0,
      }),
    },
    stock: {
      findUnique: jest.fn().mockResolvedValue({ id: "stock-1" }),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteInTransaction.mockImplementation(async (fn: any) => fn(tx))
    ;(tx.$queryRaw as jest.Mock).mockResolvedValue([{ locked: true }])
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 1,
      unrealizedPnL: 0,
      dayPnL: 0,
    })
    mockMarginCalculator.calculateMargin.mockResolvedValue({
      requiredMargin: 50,
      leverage: 5,
    })
    mockOrderRepo.create.mockResolvedValue({ id: "exit-1" })
    mockOrderRepo.markExecuted.mockResolvedValue(undefined)
    mockPositionRepo.close.mockResolvedValue(undefined)
    mockFundService.releaseMarginTx.mockResolvedValue({ success: true })
    mockFundService.creditTx.mockResolvedValue({ success: true })
    mockFundService.debitTx.mockResolvedValue({ success: true })
  })

  it("settles profit with tx-scoped releaseMarginTx + creditTx", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-1",
      symbol: "RELIANCE",
      quantity: 2,
      averagePrice: 100,
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-26000", segment: "NSE", lot_size: 1, ltp: 110 },
      orders: [{ id: "o-1", orderSide: "BUY", status: "EXECUTED", productType: "MIS" }],
    })
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 2,
      unrealizedPnL: 0,
      dayPnL: 0,
    })

    const service = new PositionManagementService()
    const result = await service.closePosition("pos-1", "acct-1", 110)

    expect(result.success).toBe(true)
    expect(mockExecuteInTransaction).toHaveBeenCalledTimes(1)
    expect(mockFundService.releaseMarginTx).toHaveBeenCalledWith(
      tx,
      "acct-1",
      50,
      expect.stringContaining("Margin released"),
      expect.objectContaining({ positionId: "pos-1", orderId: "exit-1" }),
    )
    expect(mockFundService.creditTx).toHaveBeenCalledWith(
      tx,
      "acct-1",
      20,
      expect.stringContaining("Profit"),
      expect.objectContaining({ positionId: "pos-1", orderId: "exit-1" }),
    )
    expect(mockFundService.debitTx).not.toHaveBeenCalled()
    expect(mockFundService.releaseMargin).not.toHaveBeenCalled()
    expect(mockFundService.credit).not.toHaveBeenCalled()
    expect(mockFundService.debit).not.toHaveBeenCalled()
  })

  it("passes marginRiskSide BUY on margin release when closing a long NFO option (exit order is SELL)", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-opt-long",
      symbol: "NIFTY24CE",
      quantity: 50,
      averagePrice: 100,
      stockId: "stock-opt",
      productType: "NRML",
      Stock: {
        instrumentId: "NFO-OPT-1",
        segment: "NFO",
        lot_size: 50,
        ltp: 120,
        optionType: "CE",
      },
      orders: [{ id: "o-opt", orderSide: "BUY", status: "EXECUTED", productType: "NRML" }],
    })
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 50,
      unrealizedPnL: 0,
      dayPnL: 0,
    })

    const service = new PositionManagementService()
    await service.closePosition("pos-opt-long", "acct-opt", 120)

    expect(mockMarginCalculator.calculateMargin).toHaveBeenCalled()
    expect(mockMarginCalculator.calculateMargin).toHaveBeenCalledWith(
      "NFO",
      expect.any(String),
      50,
      100,
      50,
      "SELL",
      expect.objectContaining({ optionType: "CE", marginRiskSide: "BUY" }),
    )
  })

  it("settles loss with tx-scoped debitTx", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-2",
      symbol: "INFY",
      quantity: 1,
      averagePrice: 100,
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-12345", segment: "NSE", lot_size: 1, ltp: 90 },
      orders: [{ id: "o-2", orderSide: "BUY", status: "EXECUTED", productType: "MIS" }],
    })
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 1,
      unrealizedPnL: 0,
      dayPnL: 0,
    })

    const service = new PositionManagementService()
    const result = await service.closePosition("pos-2", "acct-2", 90)

    expect(result.success).toBe(true)
    expect(mockFundService.releaseMarginTx).toHaveBeenCalled()
    expect(mockFundService.creditTx).not.toHaveBeenCalled()
    expect(mockFundService.debitTx).toHaveBeenCalledWith(
      tx,
      "acct-2",
      10,
      expect.stringContaining("Loss"),
      expect.objectContaining({ positionId: "pos-2", orderId: "exit-1" }),
      { allowInsufficientAvailable: true },
    )
  })

  it("handles non-coercible averagePrice values without throwing", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-3",
      symbol: "TCS",
      quantity: 1,
      averagePrice: Symbol("bad-average"),
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-54321", segment: "NSE", lot_size: 1, ltp: 0 },
      orders: [{ id: "o-3", orderSide: "BUY", status: "EXECUTED", productType: "MIS" }],
    })
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 1,
      unrealizedPnL: 0,
      dayPnL: 0,
    })

    const service = new PositionManagementService()
    const result = await service.closePosition("pos-3", "acct-3", 110)

    expect(result.success).toBe(true)
    expect(result.realizedPnL).toBe(110)
    expect(mockFundService.creditTx).toHaveBeenCalledWith(
      tx,
      "acct-3",
      110,
      expect.stringContaining("Profit"),
      expect.objectContaining({ positionId: "pos-3", orderId: "exit-1" }),
    )
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it("supports partial close with lot-aligned closeQuantity", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-4",
      symbol: "NIFTY24FEBFUT",
      quantity: 100,
      averagePrice: 100,
      stockId: "stock-1",
      unrealizedPnL: 500,
      dayPnL: 500,
      Stock: { instrumentId: "NFO-26000", segment: "NFO", lot_size: 25, ltp: 110 },
      orders: [{ id: "o-4", orderSide: "BUY", status: "EXECUTED", productType: "MIS" }],
    })
    ;(tx.position.findUnique as jest.Mock).mockResolvedValue({
      quantity: 100,
      unrealizedPnL: 500,
      dayPnL: 500,
    })

    const service = new PositionManagementService()
    const result = await service.closePosition("pos-4", "acct-4", 110, 50)

    expect(result.success).toBe(true)
    expect(result.isPartial).toBe(true)
    expect(result.closedQuantity).toBe(50)
    expect(result.remainingQuantity).toBe(50)
    expect(result.closedLots).toBe(2)
    expect(result.remainingLots).toBe(2)
    expect(mockPositionRepo.close).not.toHaveBeenCalled()
    expect(mockPositionRepo.update).toHaveBeenCalledWith(
      "pos-4",
      expect.objectContaining({
        quantity: 50,
      }),
      tx,
    )
    expect(mockOrderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 50,
      }),
      tx,
    )
  })

  it("rejects LONG stop-loss when it is above reference price", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-update-long",
      symbol: "RELIANCE",
      quantity: 10,
      averagePrice: 100,
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-26000", segment: "NSE", lot_size: 1, ltp: 100 },
      orders: [{ id: "o-5", orderSide: "BUY", status: "EXECUTED", productType: "MIS" }],
    })

    const service = new PositionManagementService()
    jest.spyOn(service as any, "getCurrentPrice").mockResolvedValue(100)

    await expect(service.updatePosition("pos-update-long", { stopLoss: 101 })).rejects.toThrow(
      "For LONG positions, stop-loss must be below current price.",
    )
    expect(mockExecuteInTransaction).not.toHaveBeenCalled()
    expect(mockPositionRepo.update).not.toHaveBeenCalled()
  })

  it("rejects SHORT target when it is above reference price", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-update-short",
      symbol: "BANKNIFTY",
      quantity: -10,
      averagePrice: 200,
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-26000", segment: "NSE", lot_size: 1, ltp: 200 },
      orders: [{ id: "o-6", orderSide: "SELL", status: "EXECUTED", productType: "MIS" }],
    })

    const service = new PositionManagementService()
    jest.spyOn(service as any, "getCurrentPrice").mockResolvedValue(200)

    await expect(service.updatePosition("pos-update-short", { target: 210 })).rejects.toThrow(
      "For SHORT positions, target must be below current price.",
    )
    expect(mockExecuteInTransaction).not.toHaveBeenCalled()
    expect(mockPositionRepo.update).not.toHaveBeenCalled()
  })

  it("accepts directional SHORT stop-loss/target updates and persists them", async () => {
    mockPositionRepo.findById.mockResolvedValue({
      id: "pos-update-short-ok",
      symbol: "BANKNIFTY",
      quantity: -10,
      averagePrice: 200,
      stockId: "stock-1",
      Stock: { instrumentId: "NSE_EQ-26000", segment: "NSE", lot_size: 1, ltp: 200 },
      orders: [{ id: "o-7", orderSide: "SELL", status: "EXECUTED", productType: "MIS" }],
    })
    mockPositionRepo.update.mockResolvedValue({ id: "pos-update-short-ok" })

    const service = new PositionManagementService()
    jest.spyOn(service as any, "getCurrentPrice").mockResolvedValue(200)

    const result = await service.updatePosition("pos-update-short-ok", {
      stopLoss: 220,
      target: 180,
    })

    expect(result).toEqual({
      success: true,
      positionId: "pos-update-short-ok",
      message: "Position updated successfully",
    })
    expect(mockExecuteInTransaction).toHaveBeenCalledTimes(1)
    expect(mockPositionRepo.update).toHaveBeenCalledWith(
      "pos-update-short-ok",
      { stopLoss: 220, target: 180 },
      tx,
    )
  })

  it("normalizes non-coercible quantity when calculating unrealized pnl", async () => {
    mockPositionRepo.findActive.mockResolvedValue([
      {
        id: "pos-4",
        symbol: "HDFCBANK",
        quantity: Symbol("bad-quantity"),
        averagePrice: 100,
        Stock: { instrumentId: "NSE_EQ-11111" },
      },
    ])
    mockPositionRepo.update.mockResolvedValue(undefined)

    const service = new PositionManagementService()
    jest.spyOn(service as any, "getCurrentPriceSnapshot").mockResolvedValue({
      currentPrice: 120,
      prevClose: 115,
    })

    const result = await service.calculateUnrealizedPnL("acct-4")

    expect(result).toEqual({
      totalUnrealizedPnL: 0,
      positions: [
        {
          positionId: "pos-4",
          symbol: "HDFCBANK",
          unrealizedPnL: 0,
          currentPrice: 120,
        },
      ],
    })
    expect(mockPositionRepo.update).toHaveBeenCalledWith("pos-4", {
      unrealizedPnL: 0,
      dayPnL: 0,
    })
  })

  it("computes dayPnL from prevClose instead of mirroring unrealizedPnL", async () => {
    mockPositionRepo.findActive.mockResolvedValue([
      {
        id: "pos-5",
        symbol: "INFY",
        quantity: 2,
        averagePrice: 100,
        Stock: { instrumentId: "NSE_EQ-500209" },
      },
    ])
    mockPositionRepo.update.mockResolvedValue(undefined)

    const service = new PositionManagementService()
    jest.spyOn(service as any, "getCurrentPriceSnapshot").mockResolvedValue({
      currentPrice: 120,
      prevClose: 110,
    })

    const result = await service.calculateUnrealizedPnL("acct-5")

    expect(result).toEqual({
      totalUnrealizedPnL: 40,
      positions: [
        {
          positionId: "pos-5",
          symbol: "INFY",
          unrealizedPnL: 40,
          currentPrice: 120,
        },
      ],
    })
    expect(mockPositionRepo.update).toHaveBeenCalledWith("pos-5", {
      unrealizedPnL: 40,
      dayPnL: 20,
    })
  })
})

