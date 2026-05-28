/**
 * @file tests/funds/fund-management-debit-tx.test.ts
 * @module tests-funds
 * @description Unit tests for FundManagementService.debitTx insufficient-available behavior.
 * @author StockTrade
 * @created 2026-04-06
 */

const mockFindById = jest.fn()
const mockDebit = jest.fn()
const mockTransactionCreate = jest.fn()
const mockLoggerWarn = jest.fn().mockResolvedValue(undefined)

jest.mock("@/lib/repositories/TradingAccountRepository", () => ({
  TradingAccountRepository: jest.fn().mockImplementation(() => ({
    findById: mockFindById,
    debit: mockDebit,
  })),
}))

jest.mock("@/lib/repositories/TransactionRepository", () => ({
  TransactionRepository: jest.fn().mockImplementation(() => ({
    create: mockTransactionCreate,
  })),
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => ({
    warn: mockLoggerWarn,
    logFunds: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
  })),
}))

import { FundManagementService } from "@/lib/services/funds/FundManagementService"
import { TransactionType } from "@prisma/client"

describe("FundManagementService.debitTx", () => {
  const tx = {} as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockFindById.mockResolvedValue({
      id: "acct-1",
      balance: 100,
      availableMargin: 50,
      usedMargin: 50,
    })
    mockDebit.mockResolvedValue({
      id: "acct-1",
      balance: -400,
      availableMargin: -450,
      usedMargin: 50,
    })
    mockTransactionCreate.mockResolvedValue({ id: "txn-1" })
  })

  it("rejects debit when availableMargin < amount without bypass flag", async () => {
    mockFindById.mockResolvedValue({
      id: "acct-1",
      balance: 100,
      availableMargin: 5,
      usedMargin: 0,
    })

    const service = new FundManagementService()
    await expect(
      service.debitTx(tx, "acct-1", 10, "Loss from TEST", { positionId: "p1" }),
    ).rejects.toThrow("Insufficient funds")

    expect(mockDebit).not.toHaveBeenCalled()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })

  it("allows debit when availableMargin < amount with allowInsufficientAvailable", async () => {
    mockFindById.mockResolvedValue({
      id: "acct-1",
      balance: 100,
      availableMargin: 5,
      usedMargin: 0,
    })

    const service = new FundManagementService()
    const result = await service.debitTx(tx, "acct-1", 500, "Loss from TEST", { positionId: "p1" }, {
      allowInsufficientAvailable: true,
    })

    expect(result.success).toBe(true)
    expect(result.transactionId).toBe("txn-1")
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "DEBIT_ALLOW_INSUFFICIENT_AVAILABLE",
      expect.any(String),
      expect.objectContaining({
        tradingAccountId: "acct-1",
        amount: 500,
        availableMargin: 5,
      }),
    )
    expect(mockDebit).toHaveBeenCalledWith("acct-1", 500, tx)
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tradingAccountId: "acct-1",
        amount: 500,
        type: TransactionType.DEBIT,
      }),
      tx,
    )
  })

  it("rejects non-positive amount", async () => {
    const service = new FundManagementService()
    await expect(service.debitTx(tx, "acct-1", 0, "x")).rejects.toThrow("positive finite")
    await expect(service.debitTx(tx, "acct-1", -1, "x")).rejects.toThrow("positive finite")
    expect(mockFindById).not.toHaveBeenCalled()
  })
})
