/**
 * File:        lib/surveillance/rules/heavy-hitter.ts
 * Module:      Surveillance · HEAVY_HITTER
 * Purpose:     Event-driven rule. Fires when a single user's trailing-window filled-order
 *              notional exceeds (a) an absolute floor and (b) a multiplier vs. their own
 *              prior-window notional. Detects sudden ramps.
 *
 * Exports:
 *   - HeavyHitterParams      — params shape (windowHours, multiplier, minNotional, autoDismissBelow)
 *   - HeavyHitterContext     — event input { userId, eventAt }
 *   - evaluateHeavyHitter    — SurveillanceEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — read-only access to Order.
 *
 * Side-effects: none (read-only).
 *
 * Key invariants:
 *   - Compares the user against THEMSELVES, not against a cohort. The cohort-median variant is
 *     much more expensive (full-table scan) and is deferred. User-vs-user-prior catches the
 *     vast majority of "sudden ramp" patterns and remains cheap.
 *   - dedupeKey = `${userId}:${windowStartISO}` — re-firing inside the same trailing window is a
 *     no-op upsert. The window slides forward as time passes (next event in a new hour ⇒ new key).
 *
 * Read order:
 *   1. evaluateHeavyHitter — see "current vs prior" math.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import {
  SurveillanceSeverity,
  parseConfidenceScore,
  type RuleSnapshot,
  type RuleFireResult,
  type SurveillanceParams,
  type SurveillanceEvaluator,
} from "../types"

export interface HeavyHitterParams extends SurveillanceParams {
  /** Trailing window length in hours. Default 6. */
  windowHours: number
  /** Multiplier vs user's prior equal-length window. Default 5. */
  multiplier: number
  /** Absolute floor in rupees; below this we don't fire even if multiplier matches. */
  minNotional: number
}

/** The worker passes the event subject and the event timestamp; rule evaluates from those. */
export interface HeavyHitterContext {
  userId: string
  eventAt: Date
}

const DEFAULTS: HeavyHitterParams = {
  windowHours: 6,
  multiplier: 5,
  minNotional: 200_000,
  autoDismissBelow: 50,
}

export const evaluateHeavyHitter: SurveillanceEvaluator<HeavyHitterContext, HeavyHitterParams> = async (
  rule: RuleSnapshot<HeavyHitterParams>,
  ctx: HeavyHitterContext,
): Promise<RuleFireResult[]> => {
  const params = { ...DEFAULTS, ...rule.params }
  const windowMs = params.windowHours * 60 * 60 * 1000
  const windowStart = new Date(ctx.eventAt.getTime() - windowMs)
  const priorWindowStart = new Date(windowStart.getTime() - windowMs)

  // Sum filled notional in the current and prior windows for this user.
  // notional ≈ filledQuantity × averagePrice (rupees). Unfilled rows are ignored.
  const orders = await prisma.order.findMany({
    where: {
      tradingAccount: { userId: ctx.userId },
      executedAt: { gte: priorWindowStart, lte: ctx.eventAt },
      filledQuantity: { gt: 0 },
      averagePrice: { not: null },
    },
    select: { executedAt: true, filledQuantity: true, averagePrice: true },
  })

  let current = 0
  let prior = 0
  for (const o of orders) {
    if (!o.executedAt || !o.averagePrice) continue
    const notional = o.filledQuantity * Number(o.averagePrice)
    if (o.executedAt >= windowStart) current += notional
    else prior += notional
  }

  // Floor + multiplier gate. Prior=0 → require current ≥ minNotional × multiplier (cold-start rule).
  if (current < params.minNotional) return []
  const ratio = prior > 0 ? current / prior : current / params.minNotional
  if (ratio < params.multiplier) return []

  // Confidence scales with how far past the multiplier we are (capped at 100).
  const overshoot = Math.min(2, ratio / params.multiplier) // 1.0 → at threshold, 2.0 → 2× threshold
  const confidenceScore = parseConfidenceScore(rule.baseConfidence + (overshoot - 1) * 30)

  // dedupeKey buckets the alert per trailing window — sliding window naturally re-fires the
  // next time a new window begins, but never twice for the same window.
  const windowBucket = Math.floor(windowStart.getTime() / windowMs)
  const dedupeKey = `${ctx.userId}:${windowBucket}`

  const evidence: Record<string, unknown> = {
    windowStart: windowStart.toISOString(),
    windowEnd: ctx.eventAt.toISOString(),
    currentNotional: Math.round(current),
    priorNotional: Math.round(prior),
    ratio: Number(ratio.toFixed(2)),
    params: { ...params } as Record<string, unknown>,
  }

  return [
    {
      dedupeKey,
      relatedUserId: ctx.userId,
      confidenceScore,
      severity:
        ratio >= params.multiplier * 2 ? SurveillanceSeverity.HIGH : rule.severity,
      message: `Heavy hitter: ₹${Math.round(current).toLocaleString("en-IN")} traded in last ${params.windowHours}h (${ratio.toFixed(1)}× prior window).`,
      evidence,
    },
  ]
}
