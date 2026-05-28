/**
 * File:        lib/bonus/burndown.ts
 * Module:      Bonus · Turnover Burndown
 * Purpose:     Pure-ish service called by trade-execution worker on every settled trade.
 *              Advances turnoverProgress on the user's ACTIVE bonus grants. When progress
 *              meets the rule's turnoverMultiplier × grant.amount threshold, status flips
 *              to UNLOCKED (credit becomes withdrawable). Expired grants are tagged EXPIRED.
 *
 *              Wired into the post-fill hook in OrderExecutionWorker.runPostFillBookkeeping
 *              — fires on EVERY fill (gross turnover convention). Idempotency key is the
 *              latest Realised P&L Transaction id, falling back to orderId on opening fills.
 *
 * Exports:
 *   - advanceTurnoverForUser(input)   — main entry called by the trade-execution worker
 *   - sweepExpiredGrants(asOf?)       — periodic janitor — flags ACTIVE grants past expiry
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on BonusGrant (turnoverProgress, status, unlockedAt)
 *
 * Key invariants:
 *   - Turnover is allocated PROPORTIONALLY across the user's ACTIVE grants — bigger grants
 *     get more credit per ₹ traded, weighted by amount. This matches the industry standard
 *     where wagering requirements blend across active bonuses.
 *   - Idempotency is the caller's responsibility. The OrderExecutionWorker hook dedupes
 *     by Transaction.id (each settled tx fires this exactly once); Phase 13 surveillance
 *     batch jobs must also pass distinct idempotency keys.
 *   - Unlocking does NOT auto-credit balance — `creditBalance` was already credited at issue.
 *     UNLOCKED only changes the withdrawability gate (Phase 10.5 enforces).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { GrantBurndownInput, GrantBurndownResult } from "./types"

export async function advanceTurnoverForUser(
  input: GrantBurndownInput,
): Promise<GrantBurndownResult> {
  if (!Number.isFinite(input.notional) || input.notional <= 0) {
    return { advanced: 0, unlocked: [], expired: [] }
  }

  const grants = await prisma.bonusGrant.findMany({
    where: { userId: input.userId, status: "ACTIVE" },
    include: { rule: { select: { turnoverMultiplier: true } } },
  })
  if (grants.length === 0) return { advanced: 0, unlocked: [], expired: [] }

  const now = new Date()
  const expired: string[] = []
  const advancing = grants.filter((g) => {
    if (g.expiresAt && g.expiresAt < now) {
      expired.push(g.id)
      return false
    }
    return true
  })

  if (advancing.length === 0 && expired.length === 0) {
    return { advanced: 0, unlocked: [], expired: [] }
  }

  const totalAmount = advancing.reduce((s, g) => s + Number(g.amount), 0)
  const unlocked: string[] = []
  let advanced = 0

  await prisma.$transaction(async (tx) => {
    // Mark expired grants first.
    if (expired.length > 0) {
      await tx.bonusGrant.updateMany({
        where: { id: { in: expired }, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      })
    }

    if (totalAmount === 0 || advancing.length === 0) return

    for (const g of advancing) {
      const share = Number(g.amount) / totalAmount
      const credit = input.notional * share
      const newProgress = Number(g.turnoverProgress) + credit
      const required = Number(g.amount) * Number(g.rule.turnoverMultiplier)
      const willUnlock = newProgress >= required

      await tx.bonusGrant.update({
        where: { id: g.id },
        data: {
          turnoverProgress: new Prisma.Decimal(newProgress.toFixed(2)),
          ...(willUnlock
            ? { status: "UNLOCKED" as const, unlockedAt: now }
            : {}),
        },
      })
      advanced += 1
      if (willUnlock) unlocked.push(g.id)
    }
  })

  return { advanced, unlocked, expired }
}

export async function sweepExpiredGrants(asOf?: Date): Promise<number> {
  const cutoff = asOf ?? new Date()
  const result = await prisma.bonusGrant.updateMany({
    where: { status: "ACTIVE", expiresAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  })
  return result.count
}
