/**
 * File:        lib/withdrawal/types.ts
 * Module:      Withdrawal · Risk Engine · Types
 * Purpose:     Shared types for the Phase 13a withdrawal-review risk engine. Defines the rule
 *              evaluator contract, the composite-score result, and the approval-chain shape
 *              persisted in `Withdrawal.approvalChain`.
 *
 * Exports:
 *   - RuleKey                     — string-literal union of seeded rule keys (extendable).
 *   - RuleParams                  — JSON shape per rule (admin-tunable).
 *   - RuleEvaluator               — async fn signature for a rule's check.
 *   - RuleEvaluation              — { fired, points, message? } returned by an evaluator.
 *   - RuleEvaluationResult        — composite { totalScore, ruleKeys[], topReason? }.
 *   - ApprovalStep                — one row in `Withdrawal.approvalChain`.
 *   - APPROVAL_CHAIN_DEFAULT      — preset ladder when riskScore ≥ holdThreshold.
 *   - DEFAULT_HOLD_THRESHOLD      — 50 by default; promoted to a config value later.
 *
 * Depends on:
 *   - @prisma/client — Prisma.JsonValue for the chain shape; no runtime imports.
 *
 * Side-effects: none (pure types).
 *
 * Key invariants:
 *   - `RuleKey` strings MUST match `WithdrawalRiskRule.ruleKey` 1:1; once seeded, never rename
 *     a rule key — `Withdrawal.holdRuleKeys` snapshots history and rename = silent drift.
 *   - `ApprovalStep.action === "APPROVED"` is terminal for that step. Re-opening means a new step.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type { Prisma, WithdrawalStatus } from "@prisma/client"

export type RuleKey =
  | "FIRST_WITHDRAWAL"
  | "LARGE_VS_DEPOSIT"
  | "POST_BIG_WIN"
  | "FRAUD_FLAGGED"
  | "DORMANT_REACTIVATION"
  // Future (Phase 13b/13c): allowed via the registry's open-ended map
  | (string & {})

export interface RuleParams {
  // FIRST_WITHDRAWAL — no params.
  // LARGE_VS_DEPOSIT
  pctOfLifetimeDeposit?: number
  // POST_BIG_WIN
  windowHours?: number
  minWin?: number
  // DORMANT_REACTIVATION
  dormantDays?: number
  // arbitrary extension
  [k: string]: unknown
}

export interface RuleEvaluatorContext {
  withdrawalId: string
  userId: string
  amount: number
  /** Live rule params from the DB row (already merged with defaults). */
  params: RuleParams
}

export interface RuleEvaluation {
  fired: boolean
  /** Points contributed when fired. Pulled from `WithdrawalRiskRule.points` by the engine. */
  message?: string
}

export type RuleEvaluator = (
  ctx: RuleEvaluatorContext,
) => Promise<RuleEvaluation>

export interface FiredRule {
  ruleKey: RuleKey
  points: number
  message?: string
}

export interface RuleEvaluationResult {
  /** Composite score capped at 100. */
  totalScore: number
  /** Frozen list of rule_keys that fired — written to `Withdrawal.holdRuleKeys`. */
  firedRuleKeys: RuleKey[]
  /** Human-friendly summary of the dominant fired rule (highest points). Written to `Withdrawal.holdReason`. */
  topReason: string | null
  /** Detailed per-rule breakdown for audit / UI display. NOT persisted. */
  fired: FiredRule[]
}

export const DEFAULT_HOLD_THRESHOLD = 50

/**
 * Approval ladder rendered into `Withdrawal.approvalChain`. The chain is created at HOLD time;
 * each step transitions APPROVED / REJECTED on `release` or `bulk-approve`. Phase 14 lifts this
 * shape into the generic `ApprovalRequest` model.
 */
export type ApprovalStepAction =
  | "REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED"

export interface ApprovalStep {
  stepIndex: number
  /** Logical role required to approve this step. */
  role: "RM" | "OPS" | "SUPER_ADMIN"
  action: ApprovalStepAction
  /** Admin user id who acted on this step. */
  approverId?: string | null
  approverName?: string | null
  at?: string | null
  note?: string | null
}

export type ApprovalChain = ApprovalStep[]

/**
 * Default ladder used when a withdrawal is auto-held. The exact chain may be overridden by
 * amount-tier in a follow-up patch (e.g., > ₹5L escalates straight to SUPER_ADMIN).
 */
export const APPROVAL_CHAIN_DEFAULT: ApprovalChain = [
  { stepIndex: 0, role: "OPS", action: "REQUIRED" },
]

/**
 * Type guard for parsing the JSON column. The DB column is `Json @default("[]")`; never trust
 * it without parsing — corrupted rows should be treated as an empty chain by the UI.
 */
export function parseApprovalChain(raw: Prisma.JsonValue | null | undefined): ApprovalChain {
  if (!Array.isArray(raw)) return []
  const out: ApprovalStep[] = []
  for (const s of raw) {
    if (
      !!s &&
      typeof s === "object" &&
      !Array.isArray(s) &&
      "stepIndex" in s &&
      "role" in s &&
      "action" in s
    ) {
      out.push(s as unknown as ApprovalStep)
    }
  }
  return out
}

/**
 * The high-level admin queue filter. Used by the queue API + UI.
 * - "PENDING_HIGH_RISK"   = riskScore >= holdThreshold AND status in {PENDING}
 * - "PENDING_LOW_RISK"    = riskScore < holdThreshold AND status in {PENDING}
 * - "HELD"                = heldAt != null AND releasedAt == null
 * - "PROCESSING"          = status == PROCESSING
 * - "COMPLETED"           = status in {COMPLETED, FAILED, REJECTED, CANCELLED}
 */
export type QueueFilter =
  | "ALL"
  | "PENDING_HIGH_RISK"
  | "PENDING_LOW_RISK"
  | "HELD"
  | "PROCESSING"
  | "COMPLETED"

export interface WithdrawalQueueRow {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  clientId: string | null
  amount: string
  charges: string
  status: WithdrawalStatus
  riskScore: number
  holdReason: string | null
  holdRuleKeys: string[]
  approvalChain: ApprovalChain
  heldAt: string | null
  releasedAt: string | null
  createdAt: string
  bankMasked: string | null
}
