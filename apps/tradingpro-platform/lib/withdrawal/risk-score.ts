/**
 * File:        lib/withdrawal/risk-score.ts
 * Module:      Withdrawal · Risk Engine
 * Purpose:     Composite-score engine. Loads the active rule set from the DB, runs each
 *              evaluator against the in-flight withdrawal, sums the points, and returns the
 *              0–100 capped score plus the firing breakdown. Pure read — the caller decides
 *              what to persist.
 *
 * Exports:
 *   - evaluateWithdrawal(input) → Promise<RuleEvaluationResult>
 *
 * Depends on:
 *   - @/lib/prisma — to load the active rule registry.
 *   - ./rules/registry — to map ruleKey → evaluator function.
 *   - @/lib/observability/logger — structured logging on each evaluation.
 *
 * Side-effects: read-only (DB reads inside individual rule evaluators).
 *
 * Key invariants:
 *   - Total score is capped at 100 — if multiple high-point rules fire, we don't go to 130.
 *   - If a rule throws (DB hiccup, malformed params), we LOG and SKIP — one broken rule must
 *     never block the entire withdrawal flow. The user can still submit; the missed signal is
 *     surfaced in logs.
 *   - The fired list is ordered by points DESC so `topReason` is deterministic.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { baseLogger as logger } from "@/lib/observability/logger"
import type {
  FiredRule,
  RuleEvaluationResult,
  RuleEvaluatorContext,
  RuleParams,
} from "./types"
import { getEvaluator } from "./rules/registry"

export interface EvaluateInput {
  withdrawalId: string
  userId: string
  amount: number
}

export async function evaluateWithdrawal(
  input: EvaluateInput,
): Promise<RuleEvaluationResult> {
  const activeRules = await prisma.withdrawalRiskRule.findMany({
    where: { isActive: true },
    select: { ruleKey: true, points: true, params: true },
  })

  const fired: FiredRule[] = []
  for (const rule of activeRules) {
    const evaluator = getEvaluator(rule.ruleKey)
    if (!evaluator) {
      logger.warn(
        { ruleKey: rule.ruleKey, withdrawalId: input.withdrawalId },
        "withdrawal-risk: active rule has no evaluator registered — skipping",
      )
      continue
    }
    const ctx: RuleEvaluatorContext = {
      withdrawalId: input.withdrawalId,
      userId: input.userId,
      amount: input.amount,
      params: (rule.params ?? {}) as RuleParams,
    }
    try {
      const result = await evaluator(ctx)
      if (result.fired) {
        fired.push({
          ruleKey: rule.ruleKey,
          points: rule.points,
          message: result.message,
        })
      }
    } catch (err) {
      logger.error(
        { err, ruleKey: rule.ruleKey, withdrawalId: input.withdrawalId },
        "withdrawal-risk: rule evaluator threw — skipping",
      )
    }
  }

  fired.sort((a, b) => b.points - a.points)
  const totalScore = Math.min(
    100,
    fired.reduce((acc, f) => acc + f.points, 0),
  )
  return {
    totalScore,
    firedRuleKeys: fired.map((f) => f.ruleKey),
    topReason: fired[0]?.message ?? null,
    fired,
  }
}
