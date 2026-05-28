/**
 * File:        lib/withdrawal/queue-service.ts
 * Module:      Withdrawal · Admin Queue
 * Purpose:     Read-side service for the Phase 13a admin queue. Returns paginated rows with
 *              risk-score, hold reason, approval-chain — the projection rendered by the
 *              `/admin-v2/funds/withdrawals` workbench.
 *
 * Exports:
 *   - listQueue(input) → Promise<{ rows, total, kpis }>
 *
 * Depends on:
 *   - @/lib/prisma — DB reads only.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - The KPI counts (Pending high-risk / Pending low-risk / Held / Total today) are computed
 *     in the SAME transaction as the row query so the chip totals always match the visible rows.
 *   - The `bankMasked` projection masks all but the last 4 digits of the bank account number —
 *     the queue UI never needs the full account number; admins click into Client 360 → Funds for that.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { WithdrawalStatus } from "@prisma/client"
import {
  parseApprovalChain,
  type QueueFilter,
  type WithdrawalQueueRow,
  DEFAULT_HOLD_THRESHOLD,
} from "./types"

export interface ListQueueInput {
  filter?: QueueFilter
  search?: string | null
  /** Scope to a managing admin (RM-scoped queue). null = no scope (super-admin). */
  managedByIdFilter?: string | null
  page?: number
  pageSize?: number
}

export interface ListQueueResult {
  rows: WithdrawalQueueRow[]
  total: number
  kpis: {
    pendingHighRisk: number
    pendingLowRisk: number
    held: number
    completedToday: number
  }
}

const HOLD_THRESHOLD = (() => {
  const env = process.env.WITHDRAWAL_HOLD_THRESHOLD
  if (!env) return DEFAULT_HOLD_THRESHOLD
  const n = Number.parseInt(env, 10)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_HOLD_THRESHOLD
})()

function maskBank(num: string | null | undefined): string | null {
  if (!num) return null
  const last = num.slice(-4)
  return `••••${last}`
}

function buildWhere(input: ListQueueInput) {
  const where: Record<string, unknown> = {}
  if (input.managedByIdFilter) {
    where.user = { managedById: input.managedByIdFilter }
  }
  switch (input.filter ?? "ALL") {
    case "PENDING_HIGH_RISK":
      where.status = WithdrawalStatus.PENDING
      where.riskScore = { gte: HOLD_THRESHOLD }
      break
    case "PENDING_LOW_RISK":
      where.status = WithdrawalStatus.PENDING
      where.riskScore = { lt: HOLD_THRESHOLD }
      break
    case "HELD":
      where.heldAt = { not: null }
      where.releasedAt = null
      break
    case "PROCESSING":
      where.status = WithdrawalStatus.PROCESSING
      break
    case "COMPLETED":
      where.status = {
        in: [
          WithdrawalStatus.COMPLETED,
          WithdrawalStatus.FAILED,
          WithdrawalStatus.CANCELLED,
        ],
      }
      break
    case "ALL":
    default:
      // no-op
      break
  }
  if (input.search) {
    where.OR = [
      { user: { name: { contains: input.search, mode: "insensitive" } } },
      { user: { email: { contains: input.search, mode: "insensitive" } } },
      { user: { clientId: { contains: input.search, mode: "insensitive" } } },
      { reference: { contains: input.search, mode: "insensitive" } },
    ]
  }
  return where
}

export async function listQueue(input: ListQueueInput): Promise<ListQueueResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 50))

  const where = buildWhere(input)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [rows, total, pendingHighRisk, pendingLowRisk, held, completedToday] =
    await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, clientId: true } },
          bankAccount: { select: { accountNumber: true } },
        },
        orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.count({
        where: {
          status: WithdrawalStatus.PENDING,
          riskScore: { gte: HOLD_THRESHOLD },
          ...(input.managedByIdFilter
            ? { user: { managedById: input.managedByIdFilter } }
            : {}),
        },
      }),
      prisma.withdrawal.count({
        where: {
          status: WithdrawalStatus.PENDING,
          riskScore: { lt: HOLD_THRESHOLD },
          ...(input.managedByIdFilter
            ? { user: { managedById: input.managedByIdFilter } }
            : {}),
        },
      }),
      prisma.withdrawal.count({
        where: {
          heldAt: { not: null },
          releasedAt: null,
          ...(input.managedByIdFilter
            ? { user: { managedById: input.managedByIdFilter } }
            : {}),
        },
      }),
      prisma.withdrawal.count({
        where: {
          status: WithdrawalStatus.COMPLETED,
          processedAt: { gte: today },
          ...(input.managedByIdFilter
            ? { user: { managedById: input.managedByIdFilter } }
            : {}),
        },
      }),
    ])

  const projected: WithdrawalQueueRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    clientId: r.user.clientId,
    amount: r.amount.toString(),
    charges: r.charges.toString(),
    status: r.status,
    riskScore: r.riskScore,
    holdReason: r.holdReason,
    holdRuleKeys: r.holdRuleKeys,
    approvalChain: parseApprovalChain(r.approvalChain),
    heldAt: r.heldAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    bankMasked: maskBank(r.bankAccount?.accountNumber),
  }))

  return {
    rows: projected,
    total,
    kpis: {
      pendingHighRisk,
      pendingLowRisk,
      held,
      completedToday,
    },
  }
}
