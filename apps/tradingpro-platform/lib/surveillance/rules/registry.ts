/**
 * File:        lib/surveillance/rules/registry.ts
 * Module:      Surveillance · Rule Registry
 * Purpose:     Central index of every shipped Phase 13b surveillance rule. The worker reads
 *              ACTIVE rows from `SurveillanceRule` (DB) and looks up each rule's evaluator
 *              by `ruleKey` here. New rules → register here AND seed via `lib/surveillance/seed.ts`.
 *
 * Exports:
 *   - EVENT_RULE_REGISTRY  — { [RuleKey]: SurveillanceEvaluator<EventContext> } for post-Transaction subscribe.
 *   - BATCH_RULE_REGISTRY  — { [RuleKey]: SurveillanceEvaluator<BatchContext> } for nightly batch.
 *   - DEFAULT_RULES        — seed list (idempotent upsert in seed.ts).
 *
 * Depends on:
 *   - ./heavy-hitter, ./suspicious-winner, ./coordinated-trading, ./multi-account, ./bonus-abuse.
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Event vs batch split is *physical*: a rule lives in exactly one map.
 *     Event rules must be cheap (≤ ~50ms p99); batch rules can scan.
 *   - DEFAULT_RULES is the canonical seed shape. Once a row is created in production it
 *     is admin-tuned; the seeder MUST NOT overwrite `points`/`params`/`isActive` on existing rows.
 *
 * Read order:
 *   1. EVENT_RULE_REGISTRY  — what fires post-trade.
 *   2. BATCH_RULE_REGISTRY  — what runs nightly.
 *   3. DEFAULT_RULES        — what gets seeded on first install.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import type { Prisma } from "@prisma/client"
import { SurveillanceSeverity, type RuleKey, type SurveillanceEvaluator } from "../types"
import { evaluateHeavyHitter, type HeavyHitterContext, type HeavyHitterParams } from "./heavy-hitter"
import {
  evaluateSuspiciousWinner,
  type SuspiciousWinnerContext,
  type SuspiciousWinnerParams,
} from "./suspicious-winner"
import {
  evaluateCoordinatedTrading,
  type CoordinatedTradingContext,
  type CoordinatedTradingParams,
} from "./coordinated-trading"
import {
  evaluateMultiAccount,
  type MultiAccountContext,
  type MultiAccountParams,
} from "./multi-account"
import { evaluateBonusAbuse, type BonusAbuseContext, type BonusAbuseParams } from "./bonus-abuse"

/**
 * Event-driven rules. The worker subscribes to post-Transaction commit events
 * (Phase 12 transaction-event hook) and runs these inline. Cost budget: ≤50ms p99.
 */
export const EVENT_RULE_REGISTRY: {
  HEAVY_HITTER: SurveillanceEvaluator<HeavyHitterContext, HeavyHitterParams>
  SUSPICIOUS_WINNER: SurveillanceEvaluator<SuspiciousWinnerContext, SuspiciousWinnerParams>
} = {
  HEAVY_HITTER: evaluateHeavyHitter,
  SUSPICIOUS_WINNER: evaluateSuspiciousWinner,
}

/**
 * Batch-only rules. Run from the nightly job (`scripts/run-surveillance-batch.ts`).
 * No latency budget — they may scan minutes of data.
 */
export const BATCH_RULE_REGISTRY: {
  COORDINATED_TRADING: SurveillanceEvaluator<CoordinatedTradingContext, CoordinatedTradingParams>
  MULTI_ACCOUNT: SurveillanceEvaluator<MultiAccountContext, MultiAccountParams>
  BONUS_ABUSE: SurveillanceEvaluator<BonusAbuseContext, BonusAbuseParams>
} = {
  COORDINATED_TRADING: evaluateCoordinatedTrading,
  MULTI_ACCOUNT: evaluateMultiAccount,
  BONUS_ABUSE: evaluateBonusAbuse,
}

/** Seed shape used by lib/surveillance/seed.ts. */
export interface DefaultRule {
  ruleKey: RuleKey
  name: string
  description: string
  severity: SurveillanceSeverity
  baseConfidence: number
  params: Prisma.InputJsonValue
}

export const DEFAULT_RULES: DefaultRule[] = [
  {
    ruleKey: "HEAVY_HITTER",
    name: "Heavy hitter — abnormal trading volume",
    description:
      "Single user's trailing-N-hour notional exceeds cohort median × multiplier. " +
      "Indicates a sudden ramp inconsistent with prior behaviour.",
    severity: SurveillanceSeverity.MEDIUM,
    baseConfidence: 70,
    params: {
      windowHours: 6,
      multiplier: 5,
      minNotional: 200_000,
      autoDismissBelow: 50,
    },
  },
  {
    ruleKey: "SUSPICIOUS_WINNER",
    name: "Suspicious winner — withdrawal post-escalation",
    description:
      "User's winner-control rung escalates (more aggressive mitigation) AND a withdrawal " +
      "is queued within `windowHours`. Classic milking pattern.",
    severity: SurveillanceSeverity.HIGH,
    baseConfidence: 80,
    params: {
      windowHours: 12,
      autoDismissBelow: 60,
    },
  },
  {
    ruleKey: "COORDINATED_TRADING",
    name: "Coordinated trading — same instrument/side cluster",
    description:
      "Three or more accounts open the same instrument on the same side within Δsec. " +
      "Suggests pumped-coordination or signal sharing across linked accounts.",
    severity: SurveillanceSeverity.HIGH,
    baseConfidence: 60,
    params: {
      minAccounts: 3,
      windowSec: 30,
      lookbackHours: 24,
      autoDismissBelow: 50,
    },
  },
  {
    ruleKey: "MULTI_ACCOUNT",
    name: "Multi-account — shared IP/device/network cluster",
    description:
      "Contact-cluster of N+ accounts sharing ipFingerprint / deviceId / networkKey. " +
      "Reuses the Phase 5 contact-clusters API; alert links to the cluster id.",
    severity: SurveillanceSeverity.HIGH,
    baseConfidence: 75,
    params: {
      minClusterSize: 3,
      lookbackDays: 30,
      autoDismissBelow: 55,
    },
  },
  {
    ruleKey: "BONUS_ABUSE",
    name: "Bonus abuse — wash-pattern turnover",
    description:
      "BonusGrant with > minTurnoverPct progress whose underlying trades match wash-trade " +
      "heuristics (round-trip notional within Δsec, opposite-side fills).",
    severity: SurveillanceSeverity.MEDIUM,
    baseConfidence: 65,
    params: {
      minTurnoverPct: 50,
      washWindowSec: 60,
      autoDismissBelow: 45,
    },
  },
]
