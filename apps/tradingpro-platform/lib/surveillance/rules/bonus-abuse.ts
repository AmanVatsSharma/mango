/**
 * File:        lib/surveillance/rules/bonus-abuse.ts
 * Module:      Surveillance · BONUS_ABUSE
 * Purpose:     Batch rule. Flags BonusGrants whose turnover progress is hitting unlock gates
 *              while the underlying trading pattern matches wash-trade heuristics
 *              (round-trip notional within Δsec on opposite sides).
 *
 * Exports:
 *   - BonusAbuseParams   — { minTurnoverPct, washWindowSec, autoDismissBelow }
 *   - BonusAbuseContext  — { batchAt }
 *   - evaluateBonusAbuse
 *
 * Depends on:
 *   - @/lib/prisma — reads BonusGrant + Order (filled OPENs paired with CLOSEs).
 *
 * Side-effects: none. Per single-writer rule, this rule MUST NOT mutate BonusGrant.status —
 *   admin acts on the alert via Phase 10's existing clawback API.
 *
 * Key invariants:
 *   - "Wash" heuristic: ≥ 50% of the user's filled-order notional in the last
 *     lookback window is part of a round-trip closed within `washWindowSec`. This is a
 *     starter heuristic; tuning via params is expected.
 *   - dedupeKey = `${grantId}` — one alert per grant, ever (the alert is overwritten on
 *     re-fire as evidence updates).
 *
 * Read order:
 *   1. evaluateBonusAbuse — turnover gate, then wash-rate calc.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { OrderStatus } from "@prisma/client"
import {
  parseConfidenceScore,
  type RuleFireResult,
  type SurveillanceParams,
  type SurveillanceEvaluator,
} from "../types"

export interface BonusAbuseParams extends SurveillanceParams {
  /** Min % of grant amount turned over before the rule even considers the grant. */
  minTurnoverPct: number
  /** Δsec to consider an OPEN+CLOSE pair a "wash" round-trip. */
  washWindowSec: number
  /** Lookback for trade analysis, hours. */
  lookbackHours?: number
}

export interface BonusAbuseContext {
  batchAt: Date
}

const DEFAULTS: BonusAbuseParams = {
  minTurnoverPct: 50,
  washWindowSec: 60,
  lookbackHours: 168, // 7 days
  autoDismissBelow: 45,
}

export const evaluateBonusAbuse: SurveillanceEvaluator<
  BonusAbuseContext,
  BonusAbuseParams
> = async (rule, ctx) => {
  const params = { ...DEFAULTS, ...rule.params }
  const since = new Date(
    ctx.batchAt.getTime() - (params.lookbackHours ?? 168) * 60 * 60 * 1000,
  )

  // Active grants whose progress crossed the operator-set turnover threshold.
  const grants = await prisma.bonusGrant.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      amount: true,
      turnoverProgress: true,
    },
  })

  const fires: RuleFireResult[] = []
  for (const g of grants) {
    const grantAmount = Number(g.amount)
    const progress = Number(g.turnoverProgress)
    if (grantAmount <= 0) continue
    const pct = (progress / grantAmount) * 100
    if (pct < params.minTurnoverPct) continue

    // Pull this user's filled trades in the lookback window — fingerprint round-trips.
    const orders = await prisma.order.findMany({
      where: {
        tradingAccount: { userId: g.userId },
        executedAt: { gte: since, lte: ctx.batchAt },
        filledQuantity: { gt: 0 },
        averagePrice: { not: null },
        status: OrderStatus.EXECUTED,
      },
      select: {
        id: true,
        symbol: true,
        orderSide: true,
        orderPurpose: true,
        executedAt: true,
        filledQuantity: true,
        averagePrice: true,
      },
      orderBy: { executedAt: "asc" },
    })
    if (orders.length < 2) continue

    let washNotional = 0
    let totalNotional = 0
    const washMs = params.washWindowSec * 1000

    // Greedy pair: for each OPEN, find the nearest CLOSE on same symbol within washMs.
    const closes = orders.filter((o) => o.orderPurpose === "CLOSE")
    for (const o of orders) {
      const notional = o.filledQuantity * Number(o.averagePrice ?? 0)
      totalNotional += notional
      if (o.orderPurpose !== "OPEN") continue
      const partner = closes.find((c) => {
        if (c.symbol !== o.symbol) return false
        if (!c.executedAt || !o.executedAt) return false
        const dt = c.executedAt.getTime() - o.executedAt.getTime()
        return dt > 0 && dt <= washMs
      })
      if (partner) washNotional += notional
    }

    if (totalNotional <= 0) continue
    const washRate = washNotional / totalNotional
    if (washRate < 0.5) continue // 50% wash threshold; sub-tunable later.

    const confidenceScore = parseConfidenceScore(rule.baseConfidence + (washRate - 0.5) * 60)

    const evidence: Record<string, unknown> = {
      grantId: g.id,
      grantAmount,
      turnoverProgress: progress,
      turnoverPct: Number(pct.toFixed(2)),
      washNotional: Math.round(washNotional),
      totalNotional: Math.round(totalNotional),
      washRate: Number(washRate.toFixed(3)),
      params: { ...params } as Record<string, unknown>,
    }

    fires.push({
      dedupeKey: g.id,
      relatedUserId: g.userId,
      relatedBonusGrantId: g.id,
      confidenceScore,
      message: `Bonus abuse: ${(washRate * 100).toFixed(0)}% wash-pattern turnover on grant (₹${Math.round(grantAmount).toLocaleString("en-IN")}, ${pct.toFixed(0)}% turned over).`,
      evidence,
    })
  }

  return fires
}
