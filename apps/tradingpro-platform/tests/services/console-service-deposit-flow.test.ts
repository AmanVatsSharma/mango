/**
 * @file console-service-deposit-flow.test.ts
 * @module tests-services
 * @description Unit/flow tests for ConsoleService.createDepositRequest — validation, auto-provision USER trading account, admin rejection, Prisma FK mapping.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-01 — jest.mock factories use jest.fn(); require() after mocks for stable bindings.
 */

jest.mock("@/lib/server/payment-deposit-config", () => ({
  loadPaymentDepositConfigV1: jest.fn(),
  validateDepositAmountAgainstConfig: jest.fn(),
}))

const executeInTransactionMock = jest.fn()
jest.mock("@/lib/services/utils/prisma-transaction", () => ({
  executeInTransaction: (...args: unknown[]) => executeInTransactionMock(...args),
}))

jest.mock("@/lib/services/notifications/NotificationService", () => ({
  NotificationService: {
    notifyDeposit: jest.fn().mockResolvedValue(undefined),
  },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultPaymentDepositConfigV1 } = require("@/lib/payment-deposit-config.shared")
const PaymentDepositServer = require("@/lib/server/payment-deposit-config")
const { Prisma, Role } = require("@prisma/client")
const { ConsoleService } = require("@/lib/services/console/ConsoleService")
/* eslint-enable @typescript-eslint/no-require-imports */

const loadPaymentDepositConfigV1Mock = PaymentDepositServer.loadPaymentDepositConfigV1 as jest.Mock
const validateDepositAmountAgainstConfigMock =
  PaymentDepositServer.validateDepositAmountAgainstConfig as jest.Mock

function txWithExistingTradingAccount() {
  const findUniqueTa = jest
    .fn()
    .mockImplementation(async () => ({ id: "ta-existing", availableMargin: 10_000 }))
  return {
    tradingAccount: {
      findUnique: findUniqueTa,
      create: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    deposit: {
      create: jest.fn().mockImplementation(async () => ({ id: "dep-new" })),
    },
  }
}

function txAutoProvisionUser() {
  return {
    tradingAccount: {
      findUnique: jest.fn().mockImplementation(async () => null),
      create: jest.fn().mockImplementation(async () => ({
        id: "ta-auto",
        userId: "user-c",
        availableMargin: 0,
        balance: 0,
        usedMargin: 0,
      })),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(async () => ({ role: Role.USER, clientId: "CLIENT99" })),
    },
    deposit: {
      create: jest.fn().mockImplementation(async () => ({ id: "dep-auto" })),
    },
  }
}

function txAdminNoTradingAccount() {
  return {
    tradingAccount: {
      findUnique: jest.fn().mockImplementation(async () => null),
      create: jest.fn(),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(async () => ({ role: Role.ADMIN, clientId: null })),
    },
    deposit: { create: jest.fn() },
  }
}

describe("ConsoleService.createDepositRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    loadPaymentDepositConfigV1Mock.mockResolvedValue(getDefaultPaymentDepositConfigV1())
    validateDepositAmountAgainstConfigMock.mockReturnValue(null)
    executeInTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = txWithExistingTradingAccount()
      await fn(tx)
      return undefined
    })
  })

  it("returns validation error when amount is below configured minimum (no transaction)", async () => {
    validateDepositAmountAgainstConfigMock.mockReturnValueOnce(
      "Minimum deposit for this method is ₹100"
    )
    const result = await ConsoleService.createDepositRequest("user-a", {
      amount: 1,
      method: "upi",
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain("Minimum deposit")
    expect(executeInTransactionMock).not.toHaveBeenCalled()
  })

  it("creates deposit when trading account already exists", async () => {
    let capturedTx: ReturnType<typeof txWithExistingTradingAccount> | null = null
    executeInTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      capturedTx = txWithExistingTradingAccount()
      await fn(capturedTx)
    })

    const result = await ConsoleService.createDepositRequest("user-b", {
      amount: 5000,
      method: "upi",
    })

    expect(result.success).toBe(true)
    expect(result.depositId).toBe("dep-new")
    expect(capturedTx!.tradingAccount.create).not.toHaveBeenCalled()
    expect(capturedTx!.deposit.create).toHaveBeenCalled()
  })

  it("auto-provisions trading account for USER when missing", async () => {
    let capturedTx: ReturnType<typeof txAutoProvisionUser> | null = null
    executeInTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      capturedTx = txAutoProvisionUser()
      await fn(capturedTx)
    })

    const result = await ConsoleService.createDepositRequest("user-c", {
      amount: 5000,
      method: "upi",
    })

    expect(result.success).toBe(true)
    expect(result.depositId).toBe("dep-auto")
    expect(capturedTx!.tradingAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-c",
          clientId: "CLIENT99",
        }),
      })
    )
  })

  it("rejects deposit for non-USER when trading account is missing", async () => {
    executeInTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(txAdminNoTradingAccount())
    })

    const result = await ConsoleService.createDepositRequest("admin-x", {
      amount: 5000,
      method: "upi",
    })

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/not available for this account type/i)
  })

  it("maps Prisma P2003 on deposit.create to user-safe message", async () => {
    executeInTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = txWithExistingTradingAccount()
      tx.deposit.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
          code: "P2003",
          clientVersion: "test",
        })
      )
      await fn(tx)
    })

    const result = await ConsoleService.createDepositRequest("user-d", {
      amount: 5000,
      method: "upi",
    })

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Invalid linked bank account/i)
  })
})
