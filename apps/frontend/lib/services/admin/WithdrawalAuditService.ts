/**
 * @file lib/services/admin/WithdrawalAuditService.ts
 * @module admin-console
 * @description Filtered super-admin audit trail for withdrawal approvals and rejections (trading_logs FUNDS + withdrawals join).
 * @author StockTrade
 * @created 2026-03-20
 * @updated 2026-04-01
 *
 * Notes:
 * - Mirrors DepositAuditService; amount is gross withdrawal + charges (debit total on approve).
 * - Each record includes `beneficiaryMask` from linked `BankAccount` for operator payout context.
 */

import { prisma } from "@/lib/prisma"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import { formatAdminBeneficiaryMask } from "@/lib/admin/admin-bank-display"
import { LogCategory, Prisma } from "@prisma/client"

export type WithdrawalAuditStatus = "APPROVED" | "REJECTED"

export interface WithdrawalAuditFilters {
  status?: WithdrawalAuditStatus | "ALL"
  adminId?: string
  adminName?: string
  from?: Date
  to?: Date
  search?: string
  page?: number
  pageSize?: number
}

export interface WithdrawalAuditRecord {
  id: string
  withdrawalId: string | null
  status: WithdrawalAuditStatus
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  bankReference: string | null
  /** Masked user beneficiary bank summary (linked withdrawal → BankAccount). */
  beneficiaryMask: string | null
  user?: {
    id: string
    name: string | null
    email: string | null
    clientId: string | null
  }
  remarks: string | null
  createdAt: Date
}

export interface WithdrawalAuditResponse {
  records: WithdrawalAuditRecord[]
  page: number
  pageSize: number
  total: number
}

const ACTION_STATUS_MAP: Record<string, WithdrawalAuditStatus> = {
  ADMIN_APPROVE_WITHDRAWAL_COMPLETED: "APPROVED",
  ADMIN_REJECT_WITHDRAWAL_COMPLETED: "REJECTED",
}

function withdrawalDebitTotal(amount: unknown, charges: unknown): number | null {
  const gross = parseFiniteMarketNumber(amount)
  const fee = parseFiniteMarketNumber(charges) ?? 0
  if (gross === null) return null
  return gross + fee
}

export class WithdrawalAuditService {
  static async list(filters: WithdrawalAuditFilters = {}): Promise<WithdrawalAuditResponse> {
    const {
      status = "ALL",
      adminId,
      adminName,
      from,
      to,
      search,
      page = 1,
      pageSize = 20,
    } = filters

    const normalizedStatus: WithdrawalAuditFilters["status"] =
      status && ["APPROVED", "REJECTED", "ALL"].includes(status) ? status : "ALL"

    const actions =
      normalizedStatus === "ALL"
        ? Object.keys(ACTION_STATUS_MAP)
        : Object.entries(ACTION_STATUS_MAP)
            .filter(([, mappedStatus]) => mappedStatus === normalizedStatus)
            .map(([action]) => action)

    const where: Prisma.TradingLogWhereInput = {
      category: LogCategory.FUNDS,
      action: { in: actions },
    }

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      }
    }

    const andClauses: Prisma.TradingLogWhereInput[] = []

    if (adminId) {
      andClauses.push({
        details: {
          path: ["adminId"],
          equals: adminId,
        },
      })
    }

    if (adminName) {
      andClauses.push({
        details: {
          path: ["adminName"],
          string_contains: adminName,
          mode: "insensitive",
        },
      })
    }

    if (search) {
      andClauses.push({
        OR: [
          {
            details: {
              path: ["withdrawalId"],
              string_contains: search,
              mode: "insensitive",
            },
          },
          {
            message: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      })
    }

    if (andClauses.length) {
      where.AND = andClauses
    }

    const skip = (page - 1) * pageSize

    const [entries, total] = await Promise.all([
      prisma.tradingLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.tradingLog.count({ where }),
    ])

    if (!entries.length) {
      return {
        records: [],
        page,
        pageSize,
        total,
      }
    }

    const withdrawalIds = entries
      .map((entry) => {
        const details = entry.details as Record<string, unknown> | null
        return details?.withdrawalId as string | undefined
      })
      .filter((id): id is string => Boolean(id))

    const withdrawals = withdrawalIds.length
      ? await prisma.withdrawal.findMany({
          where: { id: { in: withdrawalIds } },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                clientId: true,
              },
            },
            bankAccount: {
              select: {
                id: true,
                bankName: true,
                accountNumber: true,
                ifscCode: true,
                accountHolderName: true,
                accountType: true,
                isDefault: true,
                isActive: true,
              },
            },
          },
        })
      : []

    const withdrawalMap = new Map(withdrawals.map((w) => [w.id, w]))

    const records: WithdrawalAuditRecord[] = entries.map((entry) => {
      const details = entry.details as Record<string, unknown> | null
      const withdrawalId = (details?.withdrawalId as string | undefined) ?? null
      const row = withdrawalId ? withdrawalMap.get(withdrawalId) : undefined
      const transactionId = details?.transactionId as string | undefined

      const beneficiaryMask = row?.bankAccount
        ? formatAdminBeneficiaryMask(row.bankAccount)
        : null

      const record: WithdrawalAuditRecord = {
        id: entry.id,
        withdrawalId,
        status: ACTION_STATUS_MAP[entry.action] ?? "APPROVED",
        adminId: (details?.adminId as string | undefined) ?? null,
        adminName: (details?.adminName as string | undefined) ?? null,
        adminRole: (details?.actorRole as string | undefined) ?? null,
        reason: (details?.reason as string | undefined) ?? null,
        amount: row ? withdrawalDebitTotal(row.amount, row.charges) : null,
        bankReference: transactionId?.trim() ? transactionId : null,
        beneficiaryMask,
        user: row
          ? {
              id: row.userId,
              name: row.user?.name ?? null,
              email: row.user?.email ?? null,
              clientId: row.user?.clientId ?? null,
            }
          : undefined,
        remarks: row?.remarks ?? null,
        createdAt: entry.createdAt,
      }

      return record
    })

    return {
      records,
      page,
      pageSize,
      total,
    }
  }
}
