/**
 * Admin Fund Service
 * 
 * Handles all admin operations for fund management:
 * - Add funds to user manually
 * - Withdraw funds from user manually
 * - Approve/reject deposit requests
 * - Approve/reject withdrawal requests
 * - View all pending requests
 */

import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import { evaluateReferralRewardsAfterQualifiedDeposit } from "@/lib/services/referral/referral-reward-evaluator"
import { prisma } from "@/lib/prisma"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { DepositStatus, WithdrawalStatus } from "@prisma/client"
import { getS3Service } from "@/lib/aws-s3"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import { unlink } from "fs/promises"
import path from "path"

console.log("💰 [ADMIN-FUND-SERVICE] Module loaded")

const parseAdminFundFiniteAmount = (value: unknown, fieldName: string): number => {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    throw new Error(`Invalid ${fieldName}`)
  }
  return parsedValue
}

/** Short ID for statement descriptions (last 8 chars). */
function shortRefId(id: string): string {
  if (!id || typeof id !== "string") return "unknown"
  return id.length > 8 ? id.slice(-8) : id
}

export interface AddFundsInput {
  userId: string
  amount: number
  description: string
  adminId: string
  adminName: string
}

export interface ApproveDepositInput {
  depositId: string
  adminId: string
  adminName: string
}

export interface RejectDepositInput {
  depositId: string
  reason: string
  adminId: string
  adminName: string
}

export interface ApproveWithdrawalInput {
  withdrawalId: string
  transactionId: string
  adminId: string
  adminName: string
}

export interface RejectWithdrawalInput {
  withdrawalId: string
  reason: string
  adminId: string
  adminName: string
  actorRole?: "ADMIN" | "SUPER_ADMIN" | "MODERATOR"
}

export class AdminFundService {
  private logger: TradingLogger
  
  /**
   * Delete deposit proof image from storage (S3 or local) and clear fields
   */
  private async cleanupDepositProof(depositId: string, screenshotKey?: string | null) {
    try {
      if (!screenshotKey) return
      console.log("🧹 [ADMIN-FUND-SERVICE] Cleaning up deposit proof", { depositId, screenshotKey })

      if (screenshotKey.startsWith('local:')) {
        const rel = screenshotKey.replace(/^local:/, '')
        const filePath = path.join(process.cwd(), 'public', rel)
        try {
          await unlink(filePath)
          console.log("✅ [ADMIN-FUND-SERVICE] Local proof deleted", { filePath })
        } catch (e) {
          console.warn("⚠️ [ADMIN-FUND-SERVICE] Failed to delete local proof", { filePath, error: (e as any)?.message })
        }
      } else {
        try {
          const s3 = getS3Service()
          const ok = await s3.deleteFile(screenshotKey)
          console.log(ok ? "✅ [ADMIN-FUND-SERVICE] S3 proof deleted" : "⚠️ [ADMIN-FUND-SERVICE] S3 delete returned false", { screenshotKey })
        } catch (e) {
          console.warn("⚠️ [ADMIN-FUND-SERVICE] Failed to delete S3 proof", { screenshotKey, error: (e as any)?.message })
        }
      }

      // Null out fields in DB
      await prisma.deposit.update({
        where: { id: depositId },
        data: { screenshotUrl: null, screenshotKey: null }
      })
      console.log("✅ [ADMIN-FUND-SERVICE] Cleared screenshot fields for deposit", depositId)
    } catch (e) {
      console.warn("⚠️ [ADMIN-FUND-SERVICE] cleanupDepositProof failed", { depositId, error: (e as any)?.message })
    }
  }

  constructor(logger?: TradingLogger) {
    this.logger = logger || new TradingLogger({ clientId: 'ADMIN' })
    console.log("🏗️ [ADMIN-FUND-SERVICE] Service instance created")
  }

  /**
   * Add funds to user manually (admin operation)
   */
  async addFundsToUser(input: AddFundsInput) {
    console.log("💰 [ADMIN-FUND-SERVICE] Admin adding funds to user:", {
      userId: input.userId,
      amount: input.amount,
      adminId: input.adminId
    })

    await this.logger.logFunds(
      "ADMIN_ADD_FUNDS_START",
      `Admin ${input.adminName} adding ₹${input.amount} to user ${input.userId}`,
      { ...input }
    )

    try {
      const result = await executeInTransaction(async (tx) => {
        // Get user's trading account
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          include: { tradingAccount: true }
        })

        if (!user) {
          throw new Error("User not found")
        }

        if (!user.tradingAccount) {
          throw new Error("User has no trading account")
        }

        const tradingAccountId = user.tradingAccount.id

        // Update trading account balance
        const updatedAccount = await tx.tradingAccount.update({
          where: { id: tradingAccountId },
          data: {
            balance: { increment: input.amount },
            availableMargin: { increment: input.amount }
          }
        })

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            tradingAccountId,
            amount: input.amount,
            type: 'CREDIT',
            description: `Admin credit: ₹${Number(input.amount).toLocaleString()}. Reason: ${input.description}. By: ${input.adminName}.`
          }
        })

        // Create deposit record for tracking
        const deposit = await tx.deposit.create({
          data: {
            userId: input.userId,
            tradingAccountId,
            amount: input.amount,
            method: 'admin_credit',
            status: DepositStatus.COMPLETED,
            remarks: input.description,
            processedAt: new Date()
          }
        })

        console.log("✅ [ADMIN-FUND-SERVICE] Funds added successfully")

        return {
          success: true,
          newBalance: updatedAccount.balance,
          newAvailableMargin: updatedAccount.availableMargin,
          transactionId: transaction.id,
          depositId: deposit.id
        }
      })

      await this.logger.logFunds(
        "ADMIN_ADD_FUNDS_COMPLETED",
        `Admin successfully added ₹${input.amount} to user ${input.userId}`,
        { ...input, result }
      )

      console.log("🎉 [ADMIN-FUND-SERVICE] Add funds operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Add funds failed:", error)
      await this.logger.error("ADMIN_ADD_FUNDS_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Withdraw funds from user manually (admin operation)
   */
  async withdrawFundsFromUser(input: AddFundsInput) {
    console.log("💸 [ADMIN-FUND-SERVICE] Admin withdrawing funds from user:", {
      userId: input.userId,
      amount: input.amount,
      adminId: input.adminId
    })

    await this.logger.logFunds(
      "ADMIN_WITHDRAW_FUNDS_START",
      `Admin ${input.adminName} withdrawing ₹${input.amount} from user ${input.userId}`,
      { ...input }
    )

    try {
      const result = await executeInTransaction(async (tx) => {
        // Get user's trading account
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          include: { tradingAccount: true }
        })

        if (!user) {
          throw new Error("User not found")
        }

        if (!user.tradingAccount) {
          throw new Error("User has no trading account")
        }

        const tradingAccountId = user.tradingAccount.id

        // Check if user has sufficient balance
        if (user.tradingAccount.availableMargin < input.amount) {
          throw new Error(`Insufficient funds. Available: ₹${user.tradingAccount.availableMargin}, Required: ₹${input.amount}`)
        }

        // Update trading account balance
        const updatedAccount = await tx.tradingAccount.update({
          where: { id: tradingAccountId },
          data: {
            balance: { decrement: input.amount },
            availableMargin: { decrement: input.amount }
          }
        })

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            tradingAccountId,
            amount: input.amount,
            type: 'DEBIT',
            description: `Admin debit: ₹${Number(input.amount).toLocaleString()}. Reason: ${input.description}. By: ${input.adminName}.`
          }
        })

        // Create withdrawal record for tracking
        const withdrawal = await tx.withdrawal.create({
          data: {
            userId: input.userId,
            tradingAccountId,
            amount: input.amount,
            status: WithdrawalStatus.COMPLETED,
            remarks: input.description,
            processedAt: new Date(),
            bankAccountId: user.tradingAccount.id // Dummy, admin withdrawal
          }
        })

        console.log("✅ [ADMIN-FUND-SERVICE] Funds withdrawn successfully")

        return {
          success: true,
          newBalance: updatedAccount.balance,
          newAvailableMargin: updatedAccount.availableMargin,
          transactionId: transaction.id,
          withdrawalId: withdrawal.id
        }
      })

      await this.logger.logFunds(
        "ADMIN_WITHDRAW_FUNDS_COMPLETED",
        `Admin successfully withdrew ₹${input.amount} from user ${input.userId}`,
        { ...input, result }
      )

      console.log("🎉 [ADMIN-FUND-SERVICE] Withdraw funds operation completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Withdraw funds failed:", error)
      await this.logger.error("ADMIN_WITHDRAW_FUNDS_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Get all pending deposit requests
   */
  async getPendingDeposits(managedByIdFilter?: string) {
    console.log("📋 [ADMIN-FUND-SERVICE] Fetching pending deposits", { managedByIdFilter })

    const deposits = await prisma.deposit.findMany({
      where: {
        status: { in: [DepositStatus.PENDING, DepositStatus.PROCESSING] },
        // managedById is planned in production DB; condition included here for future compatibility
        ...(managedByIdFilter ? { user: { /* @ts-ignore - field present in prod */ managedById: managedByIdFilter } } : {})
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true,
            // @ts-ignore - field present in prod
            managedById: true,
          }
        },
        tradingAccount: {
          select: {
            id: true,
            balance: true,
            availableMargin: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log(`✅ [ADMIN-FUND-SERVICE] Found ${deposits.length} pending deposits`)
    return deposits
  }

  /**
   * Get all pending withdrawal requests
   */
  async getPendingWithdrawals(managedByIdFilter?: string) {
    console.log("📋 [ADMIN-FUND-SERVICE] Fetching pending withdrawals", { managedByIdFilter })

    const withdrawals = await prisma.withdrawal.findMany({
      where: {
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
        // managedById is planned in production DB; condition included here for future compatibility
        ...(managedByIdFilter ? { user: { /* @ts-ignore - field present in prod */ managedById: managedByIdFilter } } : {})
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true,
            // @ts-ignore - field present in prod
            managedById: true,
          }
        },
        tradingAccount: {
          select: {
            id: true,
            balance: true,
            availableMargin: true
          }
        },
        bankAccount: true
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log(`✅ [ADMIN-FUND-SERVICE] Found ${withdrawals.length} pending withdrawals`)
    return withdrawals
  }

  /**
   * Approve deposit request
   */
  async approveDeposit(input: ApproveDepositInput & { actorRole?: 'ADMIN' | 'SUPER_ADMIN' | 'MODERATOR' }) {
    console.log("✅ [ADMIN-FUND-SERVICE] Approving deposit:", input.depositId)

    await this.logger.logFunds(
      "ADMIN_APPROVE_DEPOSIT_START",
      `Admin ${input.adminName} approving deposit ${input.depositId}`,
      { ...input }
    )

    try {
      let proofKey: string | null = null
      const result = await executeInTransaction(async (tx) => {
        // Get deposit details
        const deposit = await tx.deposit.findUnique({
          where: { id: input.depositId },
          include: {
            user: true,
            tradingAccount: true
          }
        })

        if (!deposit) {
          throw new Error("Deposit not found")
        }

        if (deposit.status !== DepositStatus.PENDING) {
          throw new Error(`Cannot approve ${deposit.status} deposit`)
        }

        // Authorization: moderators cannot approve; admins can only approve their managed users
        if (input.actorRole === 'MODERATOR') {
          throw new Error('Not authorized to approve deposits')
        }
        if (input.actorRole !== 'SUPER_ADMIN') {
          // @ts-ignore - field present in prod
          if (deposit.user.managedById && deposit.user.managedById !== input.adminId) {
            throw new Error('Cannot approve deposit outside your managed users')
          }
        }

        // Remember proof key for cleanup after commit
        proofKey = deposit.screenshotKey || null
        const depositAmount = parseAdminFundFiniteAmount(deposit.amount, "deposit amount")

        // Update trading account balance
        const updatedAccount = await tx.tradingAccount.update({
          where: { id: deposit.tradingAccountId },
          data: {
            balance: { increment: depositAmount },
            availableMargin: { increment: depositAmount }
          }
        })

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            tradingAccountId: deposit.tradingAccountId,
            amount: deposit.amount,
            type: 'CREDIT',
            description: `Deposit approved: ₹${Number(depositAmount).toLocaleString()} via ${deposit.method}. UTR/Ref: ${deposit.utr || 'N/A'}. Deposit ref: ${shortRefId(deposit.id)}. Approved by: ${input.adminName}.`
          }
        })

        // Update deposit status
        await tx.deposit.update({
          where: { id: input.depositId },
          data: {
            status: DepositStatus.COMPLETED,
            processedAt: new Date(),
            remarks: deposit.remarks ? `${deposit.remarks} | Approved by ${input.adminName}` : `Approved by ${input.adminName}`
          }
        })

        await evaluateReferralRewardsAfterQualifiedDeposit(tx, {
          refereeUserId: deposit.userId,
          depositId: input.depositId,
        })

        console.log("✅ [ADMIN-FUND-SERVICE] Deposit approved successfully")

        return {
          success: true,
          amount: depositAmount,
          newBalance: updatedAccount.balance,
          newAvailableMargin: updatedAccount.availableMargin,
          transactionId: transaction.id
        }
      })

      await this.logger.logFunds(
        "ADMIN_APPROVE_DEPOSIT_COMPLETED",
        `Admin successfully approved deposit ${input.depositId}`,
        { ...input, result }
      )

      console.log("🎉 [ADMIN-FUND-SERVICE] Approve deposit completed:", result)
      // Best-effort cleanup of proof image
      await this.cleanupDepositProof(input.depositId, proofKey)
      return result

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Approve deposit failed:", error)
      await this.logger.error("ADMIN_APPROVE_DEPOSIT_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Reject deposit request
   */
  async rejectDeposit(input: RejectDepositInput) {
    console.log("❌ [ADMIN-FUND-SERVICE] Rejecting deposit:", input.depositId)

    await this.logger.logFunds(
      "ADMIN_REJECT_DEPOSIT_START",
      `Admin ${input.adminName} rejecting deposit ${input.depositId}`,
      { ...input }
    )

    try {
      const existing = await prisma.deposit.findUnique({ where: { id: input.depositId } })
      if (!existing) {
        throw new Error("Deposit not found")
      }

      const deposit = await prisma.deposit.update({
        where: { id: input.depositId },
        data: {
          status: DepositStatus.FAILED,
          remarks: `Rejected by ${input.adminName}: ${input.reason}`
        }
      })

      await this.logger.logFunds(
        "ADMIN_REJECT_DEPOSIT_COMPLETED",
        `Admin rejected deposit ${input.depositId}: ${input.reason}`,
        { ...input }
      )

      console.log("✅ [ADMIN-FUND-SERVICE] Deposit rejected")
      // Cleanup proof image after rejection
      await this.cleanupDepositProof(input.depositId, existing.screenshotKey || null)
      return { success: true, depositId: deposit.id }

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Reject deposit failed:", error)
      await this.logger.error("ADMIN_REJECT_DEPOSIT_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Approve withdrawal request
   */
  async approveWithdrawal(input: ApproveWithdrawalInput & { actorRole?: 'ADMIN' | 'SUPER_ADMIN' | 'MODERATOR' }) {
    console.log("✅ [ADMIN-FUND-SERVICE] Approving withdrawal:", input.withdrawalId)

    await this.logger.logFunds(
      "ADMIN_APPROVE_WITHDRAWAL_START",
      `Admin ${input.adminName} approving withdrawal ${input.withdrawalId}`,
      { ...input }
    )

    try {
      const result = await executeInTransaction(async (tx) => {
        // Get withdrawal details
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id: input.withdrawalId },
          include: {
            user: true,
            tradingAccount: true,
            bankAccount: true
          }
        })

        if (!withdrawal) {
          throw new Error("Withdrawal not found")
        }

        // Authorization: moderators cannot approve; admins can only approve their managed users
        if (input.actorRole === 'MODERATOR') {
          throw new Error('Not authorized to approve withdrawals')
        }
        if (input.actorRole !== 'SUPER_ADMIN') {
          // @ts-ignore - field present in prod
          if (withdrawal.user.managedById && withdrawal.user.managedById !== input.adminId) {
            throw new Error('Cannot approve withdrawal outside your managed users')
          }
        }

        if (withdrawal.status !== WithdrawalStatus.PENDING) {
          throw new Error(`Cannot approve ${withdrawal.status} withdrawal`)
        }

        // Check if user has sufficient balance
        const withdrawalAmount = parseAdminFundFiniteAmount(withdrawal.amount, "withdrawal amount")
        const withdrawalCharges = parseAdminFundFiniteAmount(withdrawal.charges, "withdrawal charges")
        const withdrawalTotalAmount = withdrawalAmount + withdrawalCharges
        const availableMargin = parseAdminFundFiniteAmount(withdrawal.tradingAccount.availableMargin, "available margin")
        if (availableMargin < withdrawalTotalAmount) {
          throw new Error("Insufficient funds in user account")
        }

        // Update trading account balance
        const updatedAccount = await tx.tradingAccount.update({
          where: { id: withdrawal.tradingAccountId },
          data: {
            balance: { decrement: withdrawalTotalAmount },
            availableMargin: { decrement: withdrawalTotalAmount }
          }
        })

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            tradingAccountId: withdrawal.tradingAccountId,
            amount: withdrawalTotalAmount,
            type: 'DEBIT',
            description: `Withdrawal approved: ₹${Number(withdrawalTotalAmount).toLocaleString()} to ${withdrawal.bankAccount.bankName}. Bank ref: ${input.transactionId}. Withdrawal ref: ${shortRefId(withdrawal.id)}. Approved by: ${input.adminName}.`
          }
        })

        // Update withdrawal status
        await tx.withdrawal.update({
          where: { id: input.withdrawalId },
          data: {
            status: WithdrawalStatus.COMPLETED,
            processedAt: new Date(),
            reference: input.transactionId,
            remarks: withdrawal.remarks ? `${withdrawal.remarks} | Approved by ${input.adminName}` : `Approved by ${input.adminName}`
          }
        })

        console.log("✅ [ADMIN-FUND-SERVICE] Withdrawal approved successfully")

        return {
          success: true,
          amount: withdrawalTotalAmount,
          newBalance: updatedAccount.balance,
          newAvailableMargin: updatedAccount.availableMargin,
          transactionId: transaction.id
        }
      })

      await this.logger.logFunds(
        "ADMIN_APPROVE_WITHDRAWAL_COMPLETED",
        `Admin successfully approved withdrawal ${input.withdrawalId}`,
        { ...input, result }
      )

      console.log("🎉 [ADMIN-FUND-SERVICE] Approve withdrawal completed:", result)
      return result

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Approve withdrawal failed:", error)
      await this.logger.error("ADMIN_APPROVE_WITHDRAWAL_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Reject withdrawal request
   */
  async rejectWithdrawal(input: RejectWithdrawalInput) {
    console.log("❌ [ADMIN-FUND-SERVICE] Rejecting withdrawal:", input.withdrawalId)

    await this.logger.logFunds(
      "ADMIN_REJECT_WITHDRAWAL_START",
      `Admin ${input.adminName} rejecting withdrawal ${input.withdrawalId}`,
      { ...input }
    )

    try {
      const withdrawal = await prisma.withdrawal.update({
        where: { id: input.withdrawalId },
        data: {
          status: WithdrawalStatus.FAILED,
          remarks: `Rejected by ${input.adminName}: ${input.reason}`
        }
      })

      await this.logger.logFunds(
        "ADMIN_REJECT_WITHDRAWAL_COMPLETED",
        `Admin rejected withdrawal ${input.withdrawalId}: ${input.reason}`,
        { ...input }
      )

      console.log("✅ [ADMIN-FUND-SERVICE] Withdrawal rejected")
      return { success: true, withdrawalId: withdrawal.id }

    } catch (error: any) {
      console.error("❌ [ADMIN-FUND-SERVICE] Reject withdrawal failed:", error)
      await this.logger.error("ADMIN_REJECT_WITHDRAWAL_FAILED", error.message, error, { ...input })
      throw error
    }
  }

  /**
   * Immutable FUNDS log when an admin views or copies full payout bank fields (audited).
   */
  async logPayoutSensitiveAccess(input: {
    adminId: string
    adminName: string
    targetUserId: string
    withdrawalId?: string
    bankAccountId?: string
    event: "OPEN_PAYOUT_DETAILS" | "COPY_SENSITIVE"
    field?: string
    actorRole?: string
  }): Promise<void> {
    await this.logger.logFunds(
      "ADMIN_PAYOUT_SENSITIVE_ACCESS",
      `Admin ${input.adminName} ${input.event}${input.field ? ` (${input.field})` : ""}`,
      {
        adminId: input.adminId,
        adminName: input.adminName,
        targetUserId: input.targetUserId,
        withdrawalId: input.withdrawalId,
        bankAccountId: input.bankAccountId,
        event: input.event,
        field: input.field ?? null,
        actorRole: input.actorRole ?? null,
      }
    )
  }
}

/**
 * Create admin fund service instance
 */
export function createAdminFundService(logger?: TradingLogger): AdminFundService {
  console.log("🏭 [ADMIN-FUND-SERVICE] Creating service instance")
  return new AdminFundService(logger)
}

console.log("✅ [ADMIN-FUND-SERVICE] Module initialized")