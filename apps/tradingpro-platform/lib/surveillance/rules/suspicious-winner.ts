/**
 * File:        lib/surveillance/rules/suspicious-winner.ts
 * Module:      Surveillance · SUSPICIOUS_WINNER
 * Purpose:     Event-driven rule. Fires when a withdrawal is queued for a user whose
 *              winner-control rung has escalated within `windowHours` (more aggressive
 *              mitigation immediately preceded a cash-out attempt — classic milking).
 *
 * Exports:
 *   - SuspiciousWinnerParams   — { windowHours, autoDismissBelow }
 *   - SuspiciousWinnerContext  — { withdrawalId, userId, queuedAt }
 *   - evaluateSuspiciousWinner — SurveillanceEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — reads ClientWinnerControlHistory.
 *
 * Side-effects: none (read-only). Per single-writer rule, this rule MUST NOT mutate
 *   ClientWinnerControl or any other live state.
 *
 * Key invariants:
 *   - "Escalation" = AUTO_PROMOTE or MANUAL_SET to a stricter rung. We compare WinnerRung
 *     enum positions (NONE < SOFT < MEDIUM < HARD < TOTAL) to detect direction.
 *   - dedupeKey = `${withdrawalId}` — one alert per queued withdrawal, ever.
 *
 * Read order:
 *   1. evaluateSuspiciousWinner — escalation detection block.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { WinnerRung } from "@prisma/client"
import {
  SurveillanceSeverity,
  parseConfidenceScore,
  type RuleFireResult,
  type SurveillanceParams,
  type SurveillanceEvaluator,
} from "../types"

export interface SuspiciousWinnerParams extends SurveillanceParams {
  windowHours: number
}

export interface SuspiciousWinnerContext {
  withdrawalId: string
  userId: string
  queuedAt: Date
  /** Optional withdrawal amount in rupees — used to amplify confidence for large cash-outs. */
  amount?: number
}

const DEFAULTS: SuspiciousWinnerParams = {
  windowHours: 12,
  autoDismissBelow: 60,
}

/**
 * WinnerRung position table — strict least→most-aggressive ordering.
 * Mirrors the Phase 9 mitigation ladder. Keep in sync with prisma WinnerRung enum.
 */
const RUNG_POSITION: Record<WinnerRung, number> = {
  NONE: 0,
  WATCH: 1,
  SPREAD_WIDEN: 2,
  POSITION_CAP: 3,
  INSTRUMENT_BLOCK: 4,
  ORDER_REJECT: 5,
  CLOSE_ONLY: 6,
  CLOSED_OUT: 7,
}

/** Aggressive end of the ladder — these escalate the surveillance alert to CRITICAL. */
const CRITICAL_RUNGS = new Set<WinnerRung>([
  WinnerRung.ORDER_REJECT,
  WinnerRung.CLOSE_ONLY,
  WinnerRung.CLOSED_OUT,
])

export const evaluateSuspiciousWinner: SurveillanceEvaluator<
  SuspiciousWinnerContext,
  SuspiciousWinnerParams
> = async (rule, ctx) => {
  const params = { ...DEFAULTS, ...rule.params }
  const windowStart = new Date(ctx.queuedAt.getTime() - params.windowHours * 60 * 60 * 1000)

  const control = await prisma.clientWinnerControl.findUnique({
    where: { userId: ctx.userId },
    select: { id: true, rung: true },
  })
  if (!control) return [] // user has no winner-control row — nothing to escalate.

  const recent = await prisma.clientWinnerControlHistory.findMany({
    where: {
      controlId: control.id,
      createdAt: { gte: windowStart, lte: ctx.queuedAt },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, fromRung: true, toRung: true, createdAt: true, reason: true },
  })

  // Find the most recent escalation (toRung > fromRung) within the window.
  const escalation = recent.find(
    (h) => RUNG_POSITION[h.toRung] > RUNG_POSITION[h.fromRung],
  )
  if (!escalation) return []

  const hoursSince =
    (ctx.queuedAt.getTime() - escalation.createdAt.getTime()) / (60 * 60 * 1000)

  // Tighter window → higher confidence (a withdrawal queued 1h after escalation is more
  // suspicious than one queued 11h after).
  const tightnessBonus = Math.max(0, 30 * (1 - hoursSince / params.windowHours))
  const sizeBonus = ctx.amount && ctx.amount >= 100_000 ? 10 : 0
  const confidenceScore = parseConfidenceScore(rule.baseConfidence + tightnessBonus + sizeBonus)

  return [
    {
      dedupeKey: ctx.withdrawalId,
      relatedUserId: ctx.userId,
      relatedWithdrawalId: ctx.withdrawalId,
      confidenceScore,
      severity: CRITICAL_RUNGS.has(escalation.toRung) ? SurveillanceSeverity.CRITICAL : rule.severity,
      message: `Withdrawal queued ${hoursSince.toFixed(1)}h after winner-control escalation ${escalation.fromRung}→${escalation.toRung}.`,
      evidence: {
        currentRung: control.rung,
        escalation: {
          action: escalation.action,
          fromRung: escalation.fromRung,
          toRung: escalation.toRung,
          at: escalation.createdAt.toISOString(),
          reason: escalation.reason ?? null,
        },
        withdrawalQueuedAt: ctx.queuedAt.toISOString(),
        withdrawalAmount: ctx.amount ?? null,
        hoursBetween: Number(hoursSince.toFixed(2)),
        params: { ...params } as Record<string, unknown>,
      } as Record<string, unknown>,
    },
  ]
}
