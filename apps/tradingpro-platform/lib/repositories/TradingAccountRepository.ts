/**
 * Trading Account Repository
 * 
 * Handles all database operations for trading accounts:
 * - Balance management
 * - Margin blocking/releasing
 * - Account queries
 * - Fund operations
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

console.log("🏦 [TRADING-ACCOUNT-REPO] Module loaded")

export class TradingAccountRepository {
  
  /**
   * Get trading account by ID
   */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    console.log("🔍 [TRADING-ACCOUNT-REPO] Finding account by ID:", id)
    
    const client = tx || prisma
    const account = await client.tradingAccount.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true
          }
        }
      }
    })

    if (account) {
      console.log("✅ [TRADING-ACCOUNT-REPO] Account found:", {
        id: account.id,
        balance: account.balance,
        availableMargin: account.availableMargin
      })
    } else {
      console.log("⚠️ [TRADING-ACCOUNT-REPO] Account not found")
    }

    return account
  }

  /**
   * Get trading account by user ID
   */
  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    console.log("🔍 [TRADING-ACCOUNT-REPO] Finding account by user ID:", userId)
    
    const client = tx || prisma
    const account = await client.tradingAccount.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true
          }
        }
      }
    })

    if (account) {
      console.log("✅ [TRADING-ACCOUNT-REPO] Account found for user")
    } else {
      console.log("⚠️ [TRADING-ACCOUNT-REPO] No account found for user")
    }

    return account
  }

  /**
   * Update account balance and margins (atomic)
   */
  async updateBalanceAndMargins(
    accountId: string,
    balanceDelta: number,
    availableMarginDelta: number,
    usedMarginDelta: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("💰 [TRADING-ACCOUNT-REPO] Updating balance and margins:", {
      accountId,
      balanceDelta,
      availableMarginDelta,
      usedMarginDelta
    })

    const client = tx || prisma

    const account = await client.tradingAccount.update({
      where: { id: accountId },
      data: {
        balance: { increment: balanceDelta },
        availableMargin: { increment: availableMarginDelta },
        usedMargin: { increment: usedMarginDelta },
        updatedAt: new Date()
      }
    })

    console.log("✅ [TRADING-ACCOUNT-REPO] Account updated:", {
      newBalance: account.balance,
      newAvailableMargin: account.availableMargin,
      newUsedMargin: account.usedMargin
    })

    return account
  }

  /**
   * Block margin (reduce available, increase used)
   */
  async blockMargin(
    accountId: string,
    amount: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔒 [TRADING-ACCOUNT-REPO] Blocking margin:", {
      accountId,
      amount
    })

    return this.updateBalanceAndMargins(
      accountId,
      0,           // No balance change
      -amount,     // Decrease available margin
      amount,      // Increase used margin
      tx
    )
  }

  /**
   * Release margin (increase available, decrease used)
   */
  async releaseMargin(
    accountId: string,
    amount: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔓 [TRADING-ACCOUNT-REPO] Releasing margin:", {
      accountId,
      amount
    })

    return this.updateBalanceAndMargins(
      accountId,
      0,           // No balance change
      amount,      // Increase available margin
      -amount,     // Decrease used margin
      tx
    )
  }

  /**
   * Debit from account (reduce both balance and available margin)
   */
  async debit(
    accountId: string,
    amount: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("💸 [TRADING-ACCOUNT-REPO] Debiting account:", {
      accountId,
      amount
    })

    return this.updateBalanceAndMargins(
      accountId,
      -amount,     // Decrease balance
      -amount,     // Decrease available margin
      0,           // No used margin change
      tx
    )
  }

  /**
   * Credit to account (increase both balance and available margin)
   */
  async credit(
    accountId: string,
    amount: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("💰 [TRADING-ACCOUNT-REPO] Crediting account:", {
      accountId,
      amount
    })

    return this.updateBalanceAndMargins(
      accountId,
      amount,      // Increase balance
      amount,      // Increase available margin
      0,           // No used margin change
      tx
    )
  }

  /**
   * Check if account has sufficient margin
   */
  async hasSufficientMargin(
    accountId: string,
    requiredAmount: number,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    console.log("✅ [TRADING-ACCOUNT-REPO] Checking sufficient margin:", {
      accountId,
      requiredAmount
    })

    const account = await this.findById(accountId, tx)
    
    if (!account) {
      console.error("❌ [TRADING-ACCOUNT-REPO] Account not found for margin check")
      return false
    }

    const hasSufficient = account.availableMargin >= requiredAmount
    console.log(`${hasSufficient ? '✅' : '❌'} [TRADING-ACCOUNT-REPO] Margin check result:`, {
      available: account.availableMargin,
      required: requiredAmount,
      hasSufficient
    })

    return hasSufficient
  }

  /**
   * Get account summary
   */
  async getAccountSummary(accountId: string, tx?: Prisma.TransactionClient) {
    console.log("📊 [TRADING-ACCOUNT-REPO] Getting account summary:", accountId)

    const client = tx || prisma

    const [account, positionCount, orderCount] = await Promise.all([
      client.tradingAccount.findUnique({
        where: { id: accountId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true
            }
          }
        }
      }),
      client.position.count({
        where: {
          tradingAccountId: accountId,
          quantity: { not: 0 }
        }
      }),
      client.order.count({
        where: {
          tradingAccountId: accountId,
          status: 'PENDING'
        }
      })
    ])

    console.log("✅ [TRADING-ACCOUNT-REPO] Account summary retrieved:", {
      positionCount,
      orderCount
    })

    return {
      ...account,
      activePositions: positionCount,
      pendingOrders: orderCount
    }
  }
}

/**
 * Create repository instance
 */
export function createTradingAccountRepository(): TradingAccountRepository {
  console.log("🏭 [TRADING-ACCOUNT-REPO] Creating repository instance")
  return new TradingAccountRepository()
}

console.log("✅ [TRADING-ACCOUNT-REPO] Module initialized")