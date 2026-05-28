/**
 * File:        lib/affiliate/commission-accrual.ts
 * Module:      Affiliate / IB Program · Commission accrual engine
 * Purpose:     Compute commissions for one settled fill and persist them, idempotently.
 *              Called by OrderExecutionWorker.runPostFillBookkeeping AFTER the trade is
 *              committed and AFTER bonus burndown / winner promotion fire. Cascades through
 *              parent affiliates so sub-affiliate hierarchies pay too.
 *
 * Exports:
 *   - accrueForTrade(event)  — main entry called per fill
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on AffiliateCommission (idempotent via the @@unique dedupe key).
 *   - Reads AffiliateAttribution + Affiliate + AffiliateCommissionRule per call.
 *
 * Key invariants:
 *   - A SINGLE Transaction.id can produce up to N commission rows (one per (affiliate, kind))
 *     — but the @@unique([affiliateId, sourceTransactionId, kind]) DB constraint guarantees
 *     no duplicates if the worker hook re-fires.
 *   - Sub-affiliate cascade: each parent in the chain runs ITS OWN rule set against the SAME
 *     event. The plan does NOT call for fractional pass-through (parent doesn't take a slice
 *     of the child's commission); it uses parent's own rules. This matches industry standard
 *     "tiered IB" where each level has independent commission terms.
 *   - Per-month caps are enforced by reading the affiliate's already-accrued total for the
 *     calendar month BEFORE writing — under contention this is best-effort (DB-level cap is
 *     a Phase 11.5 nice-to-have if it becomes a real problem).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getActiveAttributionForUser } from "./attribution"
import {
  toNumber,
  type AccrualEvent,
  type AccrualResult,
  type AffiliateCommissionKind,
} from "./types"

/** Compute a single rule's amount in rupees. Returns 0 when the rule doesn't apply. */
function ruleAmount(
  kind: AffiliateCommissionKind,
  rate: number,
  event: AccrualEvent,
): number {
  switch (kind) {
    case "SPREAD": {
      const rev = toNumber(event.spreadRevenue)
      if (rev <= 0) return 0
      return rev * rate
    }
    case "LOSS": {
      // Client loss = broker gain = positive number for the broker. event.realizedPnl is
      // expressed from the CLIENT'S perspective: negative = client lost.
      const clientPnl = toNumber(event.realizedPnl)
      if (clientPnl >= 0) return 0 // client won or break-even → no LOSS-scope payout
      const brokerGain = -clientPnl
      return brokerGain * rate
    }
    case "LOT": {
      const lots = toNumber(event.lots)
      if (lots <= 0) return 0
      return lots * rate
    }
    case "FIXED": {
      // Fires once per closing trade.
      if (!event.isClose) return 0
      return rate
    }
    default:
      return 0
  }
}

/** Best-effort per-month cap check. Reads sum for the affiliate × calendar month. */
async function alreadyAccruedThisMonth(
  affiliateId: string,
  asOf: Date,
): Promise<number> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1)
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)
  const agg = await prisma.affiliateCommission.aggregate({
    where: {
      affiliateId,
      accruedAt: { gte: monthStart, lt: monthEnd },
      status: { in: ["ACCRUED", "PAYABLE", "PAID"] },
    },
    _sum: { amount: true },
  })
  return toNumber(agg._sum.amount)
}

interface AccrualPlan {
  affiliateId: string
  kind: AffiliateCommissionKind
  amount: number
  capHit: { perEvent?: number; perMonth?: number }
  ruleId: string
}

/**
 * Walk the affiliate chain (top of cascade → root). For each affiliate, run all ACTIVE rules
 * against the event and produce zero-or-more accrual plans. Returns the flat list to insert.
 */
interface RuleRow {
  id: string
  kind: AffiliateCommissionKind
  rate: Prisma.Decimal | number | string
  perEventCap: Prisma.Decimal | number | string | null
  perMonthCap: Prisma.Decimal | number | string | null
}

interface AffiliateChainNode {
  id: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED"
  parentAffiliateId: string | null
  commissionRules: RuleRow[]
}

async function buildAccrualPlans(
  topAffiliateId: string,
  event: AccrualEvent,
): Promise<AccrualPlan[]> {
  const plans: AccrualPlan[] = []
  let currentId: string | null = topAffiliateId
  const visited = new Set<string>() // safety against cycles

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const aff: AffiliateChainNode | null = await prisma.affiliate.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        status: true,
        parentAffiliateId: true,
        commissionRules: {
          where: {
            isActive: true,
            OR: [
              { validFrom: null, validTo: null },
              { validFrom: { lte: new Date() }, validTo: null },
              { validFrom: null, validTo: { gt: new Date() } },
              { validFrom: { lte: new Date() }, validTo: { gt: new Date() } },
            ],
          },
          select: {
            id: true,
            kind: true,
            rate: true,
            perEventCap: true,
            perMonthCap: true,
          },
        },
      },
    })
    if (!aff || aff.status !== "ACTIVE") break

    const monthlyAccrued = aff.commissionRules.some((r: RuleRow) => r.perMonthCap)
      ? await alreadyAccruedThisMonth(aff.id, new Date())
      : 0

    for (const rule of aff.commissionRules) {
      const raw = ruleAmount(rule.kind, toNumber(rule.rate), event)
      if (raw <= 0) continue

      const perEventCap = rule.perEventCap ? toNumber(rule.perEventCap) : null
      const perMonthCap = rule.perMonthCap ? toNumber(rule.perMonthCap) : null

      let amount = raw
      const capHit: AccrualPlan["capHit"] = {}
      if (perEventCap !== null && amount > perEventCap) {
        capHit.perEvent = amount
        amount = perEventCap
      }
      if (perMonthCap !== null) {
        const headroom = Math.max(0, perMonthCap - monthlyAccrued)
        if (amount > headroom) {
          capHit.perMonth = amount
          amount = headroom
        }
      }
      if (amount <= 0) continue

      plans.push({
        affiliateId: aff.id,
        kind: rule.kind,
        amount,
        capHit,
        ruleId: rule.id,
      })
    }

    currentId = aff.parentAffiliateId
  }
  return plans
}

export async function accrueForTrade(event: AccrualEvent): Promise<AccrualResult> {
  if (!event.userId || !event.sourceTransactionId) {
    return { accruals: 0, dedupeHits: 0, affiliateIds: [] }
  }

  const attribution = await getActiveAttributionForUser(event.userId)
  if (!attribution) {
    return { accruals: 0, dedupeHits: 0, affiliateIds: [] }
  }

  const plans = await buildAccrualPlans(attribution.affiliateId, event)
  if (plans.length === 0) {
    return { accruals: 0, dedupeHits: 0, affiliateIds: [] }
  }

  let accruals = 0
  let dedupeHits = 0
  const affiliateIdsSet = new Set<string>()

  // We don't wrap these in a single transaction — the @@unique constraint provides
  // per-row idempotency and a partial-failure here (e.g., one row dupes, others succeed)
  // is the desired semantics. Caller's worker is also fail-soft.
  for (const plan of plans) {
    try {
      await prisma.affiliateCommission.create({
        data: {
          affiliateId: plan.affiliateId,
          sourceUserId: event.userId,
          sourceTransactionId: event.sourceTransactionId,
          kind: plan.kind,
          amount: new Prisma.Decimal(plan.amount.toFixed(2)),
          status: "ACCRUED",
          metadata: {
            ruleId: plan.ruleId,
            cascadeFromAffiliateId: attribution.affiliateId,
            capHit: plan.capHit,
          } as Prisma.InputJsonValue,
        },
      })
      accruals += 1
      affiliateIdsSet.add(plan.affiliateId)
    } catch (err) {
      // Unique violation = already accrued for the same (affiliate, txn, kind) → idempotent hit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        dedupeHits += 1
        continue
      }
      // Anything else: re-throw so the caller's .catch logs telemetry.
      throw err
    }
  }

  return { accruals, dedupeHits, affiliateIds: Array.from(affiliateIdsSet) }
}
