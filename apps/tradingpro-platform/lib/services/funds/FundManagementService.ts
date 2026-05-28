/**
 * Fund Management Service
 * 
 * Core service for managing trading account funds:
 * - Margin blocking and releasing
 * - Debit and credit operations
 * - Balance management
 * - Transaction logging
 * 
 * All operations are atomic using Prisma transactions
 */

import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import { TradingAccountRepository } from "@/lib/repositories/TradingAccountRepository"
import { TransactionRepository } from "@/lib/repositories/TransactionRepository"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { Prisma, TransactionType } from "@prisma/client"

console.log("💰 [FUND-MGMT-SERVICE] Module loaded")

export interface FundOperationResult {
  success: boolean
  newBalance: number
  newAvailableMargin: number
  newUsedMargin: number
  transactionId: string
}

/** Options for tx-scoped debits (e.g. realized loss may exceed available after margin release). */
export interface DebitTxOptions {
  allowInsufficientAvailable?: boolean
}

export class FundManagementService {
  private accountRepo: TradingAccountRepository
  private transactionRepo: TransactionRepository
  private logger: TradingLogger

  constructor(logger?: TradingLogger) {
    this.accountRepo = new TradingAccountRepository()
    this.transactionRepo = new TransactionRepository()
    this.logger = logger || new TradingLogger()
    
    console.log("🏗️ [FUND-MGMT-SERVICE] Service instance created")
  }

  /**
   * Block margin for an order
   * Reduces available margin and increases used margin
   * @param description - Statement text for the transaction; pass a detailed description (symbol, order ref, amount) for clear user statements.
   */
  async blockMarginTx(
    tx: Prisma.TransactionClient,
    tradingAccountId: string,
    amount: number,
    description: string = "Margin blocked (no context)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("🔒 [FUND-MGMT-SERVICE] Blocking margin (tx):", {
      tradingAccountId,
      amount,
      description
    })

    // Check if account has sufficient margin
    const account = await this.accountRepo.findById(tradingAccountId, tx)

    if (!account) {
      console.error("❌ [FUND-MGMT-SERVICE] Account not found:", tradingAccountId)
      throw new Error("Trading account not found")
    }

    if (account.availableMargin < amount) {
      console.error("❌ [FUND-MGMT-SERVICE] Insufficient margin:", {
        required: amount,
        available: account.availableMargin
      })
      throw new Error(`Insufficient margin. Required: ₹${amount}, Available: ₹${account.availableMargin}`)
    }

    // Block margin
    const updatedAccount = await this.accountRepo.blockMargin(tradingAccountId, amount, tx)

    // Create transaction record
    const transaction = await this.transactionRepo.create(
      {
        tradingAccountId,
        amount,
        type: TransactionType.DEBIT,
        description,
        orderId: context?.orderId,
        positionId: context?.positionId
      },
      tx
    )

    return {
      success: true,
      newBalance: updatedAccount.balance,
      newAvailableMargin: updatedAccount.availableMargin,
      newUsedMargin: updatedAccount.usedMargin,
      transactionId: transaction.id
    }
  }

  /**
   * @param description - Statement text for the transaction; pass a detailed description for clear user statements.
   */
  async releaseMarginTx(
    tx: Prisma.TransactionClient,
    tradingAccountId: string,
    amount: number,
    description: string = "Margin released (no context)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("🔓 [FUND-MGMT-SERVICE] Releasing margin (tx):", {
      tradingAccountId,
      amount,
      description
    })

    const updatedAccount = await this.accountRepo.releaseMargin(tradingAccountId, amount, tx)

    const transaction = await this.transactionRepo.create(
      {
        tradingAccountId,
        amount,
        type: TransactionType.CREDIT,
        description,
        orderId: context?.orderId,
        positionId: context?.positionId
      },
      tx
    )

    return {
      success: true,
      newBalance: updatedAccount.balance,
      newAvailableMargin: updatedAccount.availableMargin,
      newUsedMargin: updatedAccount.usedMargin,
      transactionId: transaction.id
    }
  }

  /**
   * @param description - Statement text for the transaction; pass a detailed description (e.g. brokerage, symbol, order ref) for clear user statements.
   * @param options.allowInsufficientAvailable - When true (realized loss settlement only), skip the available-margin floor so balance/available can go negative.
   */
  async debitTx(
    tx: Prisma.TransactionClient,
    tradingAccountId: string,
    amount: number,
    description: string = "Debit (no description)",
    context?: { orderId?: string; positionId?: string },
    options?: DebitTxOptions,
  ): Promise<FundOperationResult> {
    console.log("💸 [FUND-MGMT-SERVICE] Debiting account (tx):", {
      tradingAccountId,
      amount,
      description
    })

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Debit amount must be a positive finite number (got ${amount})`)
    }

    const allowInsufficientAvailable = options?.allowInsufficientAvailable === true

    // Safety check using availableMargin
    const account = await this.accountRepo.findById(tradingAccountId, tx)
    if (!account) {
      console.error("❌ [FUND-MGMT-SERVICE] Account not found:", tradingAccountId)
      throw new Error("Trading account not found")
    }
    if (account.availableMargin < amount) {
      if (!allowInsufficientAvailable) {
        console.error("❌ [FUND-MGMT-SERVICE] Insufficient funds:", {
          required: amount,
          available: account.availableMargin
        })
        throw new Error(`Insufficient funds. Required: ₹${amount}, Available: ₹${account.availableMargin}`)
      }
      await this.logger.warn(
        "DEBIT_ALLOW_INSUFFICIENT_AVAILABLE",
        "Debiting realized loss despite availableMargin shortfall (negative balance/margin allowed)",
        {
          tradingAccountId,
          amount,
          availableMargin: account.availableMargin,
          description,
          orderId: context?.orderId,
          positionId: context?.positionId,
        },
      )
      console.warn("⚠️ [FUND-MGMT-SERVICE] Realized-loss debit exceeds availableMargin:", {
        tradingAccountId,
        amount,
        available: account.availableMargin,
        description,
      })
    }

    const updatedAccount = await this.accountRepo.debit(tradingAccountId, amount, tx)
    const transaction = await this.transactionRepo.create(
      {
        tradingAccountId,
        amount,
        type: TransactionType.DEBIT,
        description,
        orderId: context?.orderId,
        positionId: context?.positionId
      },
      tx
    )

    return {
      success: true,
      newBalance: updatedAccount.balance,
      newAvailableMargin: updatedAccount.availableMargin,
      newUsedMargin: updatedAccount.usedMargin,
      transactionId: transaction.id
    }
  }

  /**
   * @param description - Statement text for the transaction; pass a detailed description for clear user statements.
   */
  async creditTx(
    tx: Prisma.TransactionClient,
    tradingAccountId: string,
    amount: number,
    description: string = "Credit (no description)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("💰 [FUND-MGMT-SERVICE] Crediting account (tx):", {
      tradingAccountId,
      amount,
      description
    })

    const updatedAccount = await this.accountRepo.credit(tradingAccountId, amount, tx)
    const transaction = await this.transactionRepo.create(
      {
        tradingAccountId,
        amount,
        type: TransactionType.CREDIT,
        description,
        orderId: context?.orderId,
        positionId: context?.positionId
      },
      tx
    )

    return {
      success: true,
      newBalance: updatedAccount.balance,
      newAvailableMargin: updatedAccount.availableMargin,
      newUsedMargin: updatedAccount.usedMargin,
      transactionId: transaction.id
    }
  }

  async blockMargin(
    tradingAccountId: string,
    amount: number,
    description: string = "Margin blocked (no context)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("🔒 [FUND-MGMT-SERVICE] Blocking margin:", {
      tradingAccountId,
      amount,
      description
    })

    await this.logger.logFunds("MARGIN_BLOCK_START", `Blocking ${amount} margin`, {
      tradingAccountId,
      amount
    })

    try {
      const result = await executeInTransaction(async (tx) => {
        const result = await this.blockMarginTx(tx, tradingAccountId, amount, description, context)
        console.log("✅ [FUND-MGMT-SERVICE] Margin blocked successfully")
        return result
      })

      await this.logger.logFunds("MARGIN_BLOCKED", `Blocked ${amount} margin successfully`, {
        tradingAccountId,
        amount,
        result
      })

      console.log("🎉 [FUND-MGMT-SERVICE] Margin block operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [FUND-MGMT-SERVICE] Margin block failed:", error)
      await this.logger.error("MARGIN_BLOCK_FAILED", error.message, error, {
        tradingAccountId,
        amount
      })
      throw error
    }
  }

  /**
   * Release margin after order completion or cancellation
   * Increases available margin and decreases used margin
   */
  async releaseMargin(
    tradingAccountId: string,
    amount: number,
    description: string = "Margin released (no context)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("🔓 [FUND-MGMT-SERVICE] Releasing margin:", {
      tradingAccountId,
      amount,
      description
    })

    await this.logger.logFunds("MARGIN_RELEASE_START", `Releasing ${amount} margin`, {
      tradingAccountId,
      amount
    })

    try {
      const result = await executeInTransaction(async (tx) => {
        const result = await this.releaseMarginTx(tx, tradingAccountId, amount, description, context)
        console.log("✅ [FUND-MGMT-SERVICE] Margin released successfully")
        return result
      })

      await this.logger.logFunds("MARGIN_RELEASED", `Released ${amount} margin successfully`, {
        tradingAccountId,
        amount,
        result
      })

      console.log("🎉 [FUND-MGMT-SERVICE] Margin release operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [FUND-MGMT-SERVICE] Margin release failed:", error)
      await this.logger.error("MARGIN_RELEASE_FAILED", error.message, error, {
        tradingAccountId,
        amount
      })
      throw error
    }
  }

  /**
   * Debit amount from account (for charges, fees, etc.)
   * Reduces both balance and available margin
   */
  async debit(
    tradingAccountId: string,
    amount: number,
    description: string = "Debit (no description)",
    context?: { orderId?: string; positionId?: string },
    debitOptions?: DebitTxOptions,
  ): Promise<FundOperationResult> {
    console.log("💸 [FUND-MGMT-SERVICE] Debiting account:", {
      tradingAccountId,
      amount,
      description
    })

    await this.logger.logFunds("DEBIT_START", `Debiting ${amount}`, {
      tradingAccountId,
      amount
    })

    try {
      const result = await executeInTransaction(async (tx) => {
        const result = await this.debitTx(tx, tradingAccountId, amount, description, context, debitOptions)
        console.log("✅ [FUND-MGMT-SERVICE] Debit completed successfully")
        return result
      })

      await this.logger.logFunds("DEBIT_COMPLETED", `Debited ${amount} successfully`, {
        tradingAccountId,
        amount,
        result
      })

      console.log("🎉 [FUND-MGMT-SERVICE] Debit operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [FUND-MGMT-SERVICE] Debit failed:", error)
      await this.logger.error("DEBIT_FAILED", error.message, error, {
        tradingAccountId,
        amount
      })
      throw error
    }
  }

  /**
   * Credit amount to account (for deposits, P&L, etc.)
   * Increases both balance and available margin
   */
  async credit(
    tradingAccountId: string,
    amount: number,
    description: string = "Credit (no description)",
    context?: { orderId?: string; positionId?: string }
  ): Promise<FundOperationResult> {
    console.log("💰 [FUND-MGMT-SERVICE] Crediting account:", {
      tradingAccountId,
      amount,
      description
    })

    await this.logger.logFunds("CREDIT_START", `Crediting ${amount}`, {
      tradingAccountId,
      amount
    })

    try {
      const result = await executeInTransaction(async (tx) => {
        const result = await this.creditTx(tx, tradingAccountId, amount, description, context)
        console.log("✅ [FUND-MGMT-SERVICE] Credit completed successfully")
        return result
      })

      await this.logger.logFunds("CREDIT_COMPLETED", `Credited ${amount} successfully`, {
        tradingAccountId,
        amount,
        result
      })

      console.log("🎉 [FUND-MGMT-SERVICE] Credit operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [FUND-MGMT-SERVICE] Credit failed:", error)
      await this.logger.error("CREDIT_FAILED", error.message, error, {
        tradingAccountId,
        amount
      })
      throw error
    }
  }

  /**
   * Get account balance and margin information
   */
  async getAccountFunds(tradingAccountId: string) {
    console.log("📊 [FUND-MGMT-SERVICE] Getting account funds:", tradingAccountId)

    const account = await this.accountRepo.findById(tradingAccountId)
    
    if (!account) {
      console.error("❌ [FUND-MGMT-SERVICE] Account not found:", tradingAccountId)
      throw new Error("Trading account not found")
    }

    const funds = {
      balance: account.balance,
      availableMargin: account.availableMargin,
      usedMargin: account.usedMargin,
      totalMargin: account.balance
    }

    console.log("✅ [FUND-MGMT-SERVICE] Account funds retrieved:", funds)
    return funds
  }
}

/**
 * Create fund management service instance
 */
export function createFundManagementService(logger?: TradingLogger): FundManagementService {
  console.log("🏭 [FUND-MGMT-SERVICE] Creating service instance")
  return new FundManagementService(logger)
}

console.log("✅ [FUND-MGMT-SERVICE] Module initialized")