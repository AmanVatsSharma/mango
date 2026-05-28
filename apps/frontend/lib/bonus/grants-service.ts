/**
 * File:        lib/bonus/grants-service.ts
 * Module:      Bonus · Grants Service
 * Purpose:     Issue / list / clawback BonusGrant rows + bulk issuance + per-user view.
 *              Atomically credits TradingAccount.creditBalance on issue and decrements on clawback.
 *
 * Exports:
 *   - listGrants(opts?)             — paginated list (status / userId / ruleId filters)
 *   - listGrantsForUser(userId)     — Client 360 → Bonus tab feed
 *   - issueGrant(input, by)         — single manual issue
 *   - bulkIssue(input, by)          — campaign-style mass grant (cap 500/req)
 *   - clawbackGrant(id, reason, by) — admin-initiated reversal
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on BonusGrant + TradingAccount.creditBalance (atomic via $transaction)
 *
 * Key invariants:
 *   - Every issue runs inside a Prisma transaction: BonusGrant insert + creditBalance += amount.
 *   - Clawback reverses creditBalance only if grant.status === ACTIVE and credit hasn't been
 *     consumed by withdrawal flow yet (Phase 10 ships ledger; consumption-block is Phase 10.5).
 *   - bulkIssue is best-effort: per-row try/catch, returns aggregate {attempted, granted, failed[]}.
 *     Cap = 500 user ids per request to keep the worker honest.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { BonusGrantStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type {
  BonusGrantRow,
  BulkIssueInput,
  BulkIssueResult,
} from "./types"

const MAX_BULK_PER_REQUEST = 500

type PrismaGrantRow = Prisma.BonusGrantGetPayload<{
  include: {
    rule: { select: { id: true; name: true; kind: true; turnoverMultiplier: true } }
    user: { select: { id: true; name: true; clientId: true } }
    grantedBy: { select: { id: true; name: true; email: true } }
  }
}>

function toRow(row: PrismaGrantRow): BonusGrantRow {
  const amount = Number(row.amount)
  const turnoverRequired = amount * Number(row.rule.turnoverMultiplier)
  const turnoverProgress = Number(row.turnoverProgress)
  const unlockProgress =
    turnoverRequired > 0 ? Math.min(1, turnoverProgress / turnoverRequired) : 0
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    clientId: row.user?.clientId ?? null,
    ruleId: row.ruleId,
    ruleName: row.rule.name,
    ruleKind: row.rule.kind,
    amount,
    status: row.status,
    turnoverProgress,
    turnoverRequired,
    unlockProgress,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    unlockedAt: row.unlockedAt?.toISOString() ?? null,
    clawedBackAt: row.clawedBackAt?.toISOString() ?? null,
    clawbackReason: row.clawbackReason,
    source: row.source,
    grantedById: row.grantedById,
    grantedByName: row.grantedBy?.name ?? row.grantedBy?.email ?? null,
    grantedAt: row.grantedAt.toISOString(),
  }
}

interface ListOpts {
  status?: BonusGrantStatus
  userId?: string
  ruleId?: string
  limit?: number
  offset?: number
}

const GRANT_INCLUDE = {
  rule: { select: { id: true, name: true, kind: true, turnoverMultiplier: true } },
  user: { select: { id: true, name: true, clientId: true } },
  grantedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.BonusGrantInclude

export async function listGrants(opts: ListOpts = {}): Promise<{
  rows: BonusGrantRow[]
  total: number
  byStatus: Record<BonusGrantStatus, number>
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)

  const where: Prisma.BonusGrantWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.ruleId ? { ruleId: opts.ruleId } : {}),
  }

  const [rows, total, statusGroups] = await Promise.all([
    prisma.bonusGrant.findMany({
      where,
      include: GRANT_INCLUDE,
      orderBy: { grantedAt: "desc" },
      take: limit,
      skip: offset,
    }) as Promise<PrismaGrantRow[]>,
    prisma.bonusGrant.count({ where }),
    prisma.bonusGrant.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ])

  const byStatus: Record<BonusGrantStatus, number> = {
    ACTIVE: 0,
    UNLOCKED: 0,
    EXPIRED: 0,
    CLAWED_BACK: 0,
  }
  for (const g of statusGroups) byStatus[g.status] = g._count._all

  return {
    rows: rows.map(toRow),
    total,
    byStatus,
  }
}

export async function listGrantsForUser(userId: string): Promise<BonusGrantRow[]> {
  const rows = (await prisma.bonusGrant.findMany({
    where: { userId },
    include: GRANT_INCLUDE,
    orderBy: { grantedAt: "desc" },
  })) as PrismaGrantRow[]
  return rows.map(toRow)
}

interface IssueInput {
  userId: string
  ruleId: string
  amount: number
  source?: string
  metadata?: Record<string, unknown>
}

export async function issueGrant(input: IssueInput, performedById: string): Promise<BonusGrantRow> {
  if (!input.userId || !input.ruleId) throw new Error("userId and ruleId are required")
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("amount must be a positive finite number")
  }

  const rule = await prisma.bonusRule.findUnique({ where: { id: input.ruleId } })
  if (!rule) throw new Error("Rule not found")
  if (!rule.isActive) throw new Error("Rule is inactive")

  // Cap by maxAmount if defined.
  const finalAmount =
    rule.maxAmount && Number(rule.maxAmount) > 0
      ? Math.min(input.amount, Number(rule.maxAmount))
      : input.amount

  const expiresAt = rule.expiryDays
    ? new Date(Date.now() + rule.expiryDays * 24 * 60 * 60 * 1000)
    : null

  const created = await prisma.$transaction(async (tx) => {
    const grant = await tx.bonusGrant.create({
      data: {
        userId: input.userId,
        ruleId: input.ruleId,
        amount: finalAmount,
        status: "ACTIVE",
        expiresAt,
        source: input.source ?? null,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        grantedById: performedById,
      },
      include: GRANT_INCLUDE,
    })

    // Credit the trading account; create one if missing (this should rarely happen
    // since onboarding creates it, but defensive on the bonus path).
    await tx.tradingAccount.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        creditBalance: Math.round(finalAmount),
      },
      update: {
        creditBalance: { increment: Math.round(finalAmount) },
      },
    })

    return grant as PrismaGrantRow
  })

  return toRow(created)
}

export async function bulkIssue(
  input: BulkIssueInput,
  performedById: string,
): Promise<BulkIssueResult> {
  const userIds = (input.userIds ?? []).slice(0, MAX_BULK_PER_REQUEST)
  if (userIds.length === 0) {
    return { success: false, attempted: 0, granted: 0, failed: [] }
  }
  let granted = 0
  const failed: BulkIssueResult["failed"] = []

  for (const userId of userIds) {
    try {
      await issueGrant(
        { userId, ruleId: input.ruleId, amount: input.amount, source: input.source },
        performedById,
      )
      granted += 1
    } catch (e) {
      failed.push({
        userId,
        reason: e instanceof Error ? e.message : "issue failed",
      })
    }
  }

  return {
    success: failed.length === 0,
    attempted: userIds.length,
    granted,
    failed,
  }
}

export async function clawbackGrant(
  grantId: string,
  reason: string,
  performedById: string,
): Promise<BonusGrantRow> {
  if (!reason || reason.trim().length === 0) {
    throw new Error("Clawback reason is required")
  }
  const grant = await prisma.bonusGrant.findUnique({ where: { id: grantId } })
  if (!grant) throw new Error("Grant not found")
  if (grant.status !== "ACTIVE" && grant.status !== "UNLOCKED") {
    throw new Error(`Cannot clawback grant in status ${grant.status}`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Decrement creditBalance — but only the active (non-burned-down) portion.
    // For Phase 10 simplicity we deduct the full grant amount; Phase 10.5 ledger
    // reconciliation will deduct only the unspent portion once burndown integrates
    // with the order-pipeline credit consumer.
    await tx.tradingAccount.update({
      where: { userId: grant.userId },
      data: { creditBalance: { decrement: Math.round(Number(grant.amount)) } },
    })
    const existingMetadata =
      grant.metadata && typeof grant.metadata === "object" && !Array.isArray(grant.metadata)
        ? (grant.metadata as Record<string, unknown>)
        : {}
    return (await tx.bonusGrant.update({
      where: { id: grantId },
      data: {
        status: "CLAWED_BACK",
        clawedBackAt: new Date(),
        clawbackReason: reason,
        metadata: {
          ...existingMetadata,
          clawedBackById: performedById,
        } as Prisma.InputJsonValue,
      },
      include: GRANT_INCLUDE,
    })) as PrismaGrantRow
  })

  return toRow(updated)
}
