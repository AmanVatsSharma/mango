/**
 * File:        lib/withdrawal/rules/registry.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Maps the stable `WithdrawalRiskRule.ruleKey` strings to their evaluator
 *              implementations. The composite-score engine reads this map to know which
 *              function to run for which DB-registered rule.
 *
 * Exports:
 *   - RULE_REGISTRY — Record<RuleKey, RuleEvaluator>
 *   - getEvaluator(ruleKey) — safe accessor; returns undefined for unknown keys.
 *   - DEFAULT_RULES   — seed list with default points + params (used by the seed script).
 *
 * Depends on:
 *   - all five rule modules in this directory.
 *
 * Side-effects: none (pure registry).
 *
 * Key invariants:
 *   - Keys here MUST match `WithdrawalRiskRule.ruleKey` 1:1.
 *   - Adding a new rule = (a) implement evaluator, (b) add to `RULE_REGISTRY`, (c) add to
 *     `DEFAULT_RULES` if it should be seeded by default. Removing a rule must be a *disable*
 *     (set isActive=false) — never delete the row, because `Withdrawal.holdRuleKeys` snapshots.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type { RuleEvaluator, RuleKey, RuleParams } from "../types"
import { firstWithdrawalRule } from "./first-withdrawal"
import { largeVsDepositRule } from "./large-vs-deposit"
import { postBigWinRule } from "./post-big-win"
import { fraudFlaggedRule } from "./fraud-flagged"
import { dormantReactivationRule } from "./dormant-reactivation"

export const RULE_REGISTRY: Record<string, RuleEvaluator> = {
  FIRST_WITHDRAWAL: firstWithdrawalRule,
  LARGE_VS_DEPOSIT: largeVsDepositRule,
  POST_BIG_WIN: postBigWinRule,
  FRAUD_FLAGGED: fraudFlaggedRule,
  DORMANT_REACTIVATION: dormantReactivationRule,
}

export function getEvaluator(ruleKey: string): RuleEvaluator | undefined {
  return RULE_REGISTRY[ruleKey]
}

export interface DefaultRuleSeed {
  ruleKey: RuleKey
  name: string
  description: string
  points: number
  params: RuleParams
}

/**
 * Seeded rule set. Idempotent — `npm run db:seed:phase-13a` upserts on `ruleKey`. Tuning a
 * `points` or `params` value here will NOT retroactively re-evaluate existing held withdrawals.
 */
export const DEFAULT_RULES: DefaultRuleSeed[] = [
  {
    ruleKey: "FIRST_WITHDRAWAL",
    name: "First-ever withdrawal",
    description:
      "User has no prior trusted (PROCESSING/COMPLETED) withdrawals. Highest-risk lifecycle window for fraud — auto-hold.",
    points: 25,
    params: {},
  },
  {
    ruleKey: "LARGE_VS_DEPOSIT",
    name: "Large withdrawal vs lifetime deposits",
    description:
      "Withdrawal amount is a high fraction of the user's lifetime completed deposits. Tunable via pctOfLifetimeDeposit (default 80%).",
    points: 30,
    params: { pctOfLifetimeDeposit: 80 },
  },
  {
    ruleKey: "POST_BIG_WIN",
    name: "Post big-win cash-out",
    description:
      "User banked > minWin (default ₹50,000) of net realised P&L within windowHours (default 24h). Classic B-book cash-out signal.",
    points: 30,
    params: { windowHours: 24, minWin: 50_000 },
  },
  {
    ruleKey: "FRAUD_FLAGGED",
    name: "Fraud flag on file",
    description:
      "User has an open KYC suspicious flag or AML hit. Phase 13b will widen this to HouseSurveillanceAlert.",
    points: 100,
    params: {},
  },
  {
    ruleKey: "DORMANT_REACTIVATION",
    name: "Dormant account reactivation",
    description:
      "User's most recent session is older than dormantDays (default 90). Possible account-takeover.",
    points: 15,
    params: { dormantDays: 90 },
  },
]
