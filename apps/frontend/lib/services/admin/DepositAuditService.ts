/**
 * File: lib/services/admin/DepositAuditService.ts
 * Module: admin-console
 * Purpose: Provide filtered access to admin deposit approval and rejection audit logs
 * Author: Cursor / GPT-5 Codex
 * Last-updated: 2025-11-12
 * Notes:
 * - Fetches TradingLogger entries tied to deposit approvals/rejections
 * - Joins deposit data for richer context and filtering
 */

import { prisma } from "@/lib/prisma"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import { LogCategory, Prisma } from "@prisma/client"

export type DepositAuditStatus = "APPROVED" | "REJECTED"

export interface DepositAuditFilters {
  status?: DepositAuditStatus | "ALL"
  adminId?: string
  adminName?: string
  from?: Date
  to?: Date
  search?: string
  page?: number
  pageSize?: number
}

export interface DepositAuditRecord {
  id: string
  depositId: string | null
  status: DepositAuditStatus
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  user?: {
    id: string
    name: string | null
    email: string | null
    clientId: string | null
  }
  remarks: string | null
  createdAt: Date
}

export interface DepositAuditResponse {
  records: DepositAuditRecord[]
  page: number
  pageSize: number
  total: number
}

const ACTION_STATUS_MAP: Record<string, DepositAuditStatus> = {
  ADMIN_APPROVE_DEPOSIT_COMPLETED: "APPROVED",
  ADMIN_REJECT_DEPOSIT_COMPLETED: "REJECTED",
}

export class DepositAuditService {
  static async list(filters: DepositAuditFilters = {}): Promise<DepositAuditResponse> {
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

    const normalizedStatus: DepositAuditFilters["status"] =
      status && ["APPROVED", "REJECTED", "ALL"].includes(status)
        ? status
        : "ALL"

    console.log("🔍 [DepositAuditService] Fetching audit logs with filters:", {
      status: normalizedStatus,
      adminId,
      adminName,
      from,
      to,
      search,
      page,
      pageSize,
    })

    const actions = normalizedStatus === "ALL"
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
              path: ["depositId"],
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

    console.log("✅ [DepositAuditService] Retrieved audit log rows:", entries.length)

    if (!entries.length) {
      return {
        records: [],
        page,
        pageSize,
        total,
      }
    }

    const depositIds = entries
      .map((entry) => {
        const details = entry.details as Record<string, any> | null
        return details?.depositId as string | undefined
      })
      .filter((id): id is string => Boolean(id))

    const deposits = depositIds.length
      ? await prisma.deposit.findMany({
          where: { id: { in: depositIds } },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                clientId: true,
              },
            },
          },
        })
      : []

    const depositMap = new Map(deposits.map((deposit) => [deposit.id, deposit]))

    const records: DepositAuditRecord[] = entries.map((entry) => {
      const details = entry.details as Record<string, any> | null
      const depositId = (details?.depositId as string | undefined) ?? null
      const deposit = depositId ? depositMap.get(depositId) : undefined

      const record: DepositAuditRecord = {
        id: entry.id,
        depositId,
        status: ACTION_STATUS_MAP[entry.action] || "APPROVED",
        adminId: (details?.adminId as string | undefined) ?? null,
        adminName: (details?.adminName as string | undefined) ?? null,
        adminRole: (details?.actorRole as string | undefined) ?? null,
        reason: (details?.reason as string | undefined) ?? null,
        amount: deposit ? parseFiniteMarketNumber(deposit.amount) : null,
        user: deposit
          ? {
              id: deposit.userId,
              name: deposit.user?.name ?? null,
              email: deposit.user?.email ?? null,
              clientId: deposit.user?.clientId ?? null,
            }
          : undefined,
        remarks: deposit?.remarks ?? null,
        createdAt: entry.createdAt,
      }

      console.log("🧾 [DepositAuditService] Prepared audit record:", record)
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

console.log("✅ [DepositAuditService] Module initialized")
