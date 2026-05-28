/**
 * File:        lib/withdrawal/hold-rules.ts
 * Module:      Withdrawal · Risk Engine · Orchestrator
 * Purpose:     One public entry point — `evaluateAndApplyHold(withdrawalId)`. Runs the
 *              risk-score engine, persists the score + holdReason + holdRuleKeys snapshot,
 *              builds the approval-chain ladder if score crosses the threshold, and writes
 *              `heldAt`. Caller-agnostic — usable from the user-side post-create hook or
 *              the admin "re-evaluate" action.
 *
 * Exports:
 *   - evaluateAndApplyHold(withdrawalId) → Promise<HoldResult>
 *   - HoldResult — { riskScore, holdReason, holdRuleKeys, isHeld }
 *
 * Depends on:
 *   - @/lib/prisma — DB writes.
 *   - ./risk-score — composite scorer.
 *   - ./approval-chain — chain builder.
 *   - @/lib/observability/logger — audit trail.
 *
 * Side-effects:
 *   - Updates `Withdrawal.{riskScore, holdReason, holdRuleKeys, approvalChain, heldAt}`.
 *
 * Key invariants:
 *   - Idempotent: re-running on the same withdrawal recomputes and overwrites — used by the
 *     admin "re-evaluate" action when the rule registry changes.
 *   - NEVER changes `Withdrawal.status`. Status changes belong to AdminFundService (approve/reject).
 *     Hold is a *flag* on a PENDING row, not a separate status — keeps Phase 13a additive.
 *   - The configured hold threshold lives in env var `WITHDRAWAL_HOLD_THRESHOLD` (default 50).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { baseLogger as logger } from "@/lib/observability/logger"
import { evaluateWithdrawal } from "./risk-score"
import { buildDefaultChain } from "./approval-chain"
import { DEFAULT_HOLD_THRESHOLD } from "./types"
import type { Prisma } from "@prisma/client"

export interface HoldResult {
  riskScore: number
  holdReason: string | null
  holdRuleKeys: string[]
  isHeld: boolean
}

function readHoldThreshold(): number {
  const env = process.env.WITHDRAWAL_HOLD_THRESHOLD
  if (!env) return DEFAULT_HOLD_THRESHOLD
  const n = Number.parseInt(env, 10)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_HOLD_THRESHOLD
}

export async function evaluateAndApplyHold(
  withdrawalId: string,
): Promise<HoldResult> {
  const w = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true },
  })
  if (!w) {
    throw new Error(`withdrawal ${withdrawalId} not found`)
  }

  const amount = Number(w.amount)
  const result = await evaluateWithdrawal({
    withdrawalId: w.id,
    userId: w.userId,
    amount,
  })

  const threshold = readHoldThreshold()
  const isHeld = result.totalScore >= threshold
  const approvalChain = isHeld ? buildDefaultChain(amount) : []
  const heldAt = isHeld ? new Date() : null

  await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: {
      riskScore: result.totalScore,
      holdReason: result.topReason,
      holdRuleKeys: result.firedRuleKeys,
      approvalChain: approvalChain as unknown as Prisma.InputJsonValue,
      heldAt,
      releasedAt: null,
    },
  })

  logger.info(
    {
      withdrawalId,
      riskScore: result.totalScore,
      threshold,
      isHeld,
      ruleCount: result.firedRuleKeys.length,
    },
    "withdrawal-risk: hold evaluation complete",
  )

  return {
    riskScore: result.totalScore,
    holdReason: result.topReason,
    holdRuleKeys: result.firedRuleKeys,
    isHeld,
  }
}

/**
 * Post-create hook — call from `ConsoleService.createWithdrawal` AFTER the row commits. Failure
 * to evaluate must NEVER block the user-side request; we log and move on.
 *
 * Phase 13b — also fire the SUSPICIOUS_WINNER surveillance rule. Surveillance is
 * fire-and-forget and writes only to HouseSurveillanceAlert; it never mutates the
 * withdrawal row, ClientWinnerControl, or any other live state.
 */
export async function applyHoldOnCreate(withdrawalId: string): Promise<void> {
  try {
    await evaluateAndApplyHold(withdrawalId)
  } catch (err) {
    logger.error(
      { err, withdrawalId },
      "withdrawal-risk: post-create evaluation failed (non-blocking)",
    )
  }

  try {
    const w = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      select: { id: true, userId: true, amount: true, createdAt: true },
    })
    if (w) {
      const { dispatchWithdrawalQueuedEvent } = await import(
        "@/lib/surveillance/event-dispatcher"
      )
      await dispatchWithdrawalQueuedEvent({
        withdrawalId: w.id,
        userId: w.userId,
        queuedAt: w.createdAt,
        amount: Number(w.amount),
      })
    }
  } catch (err) {
    logger.warn(
      { err, withdrawalId },
      "surveillance: SUSPICIOUS_WINNER dispatch failed (non-blocking)",
    )
  }
}
