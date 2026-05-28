/**
 * File:        lib/surveillance/types.ts
 * Module:      Surveillance · Types & Contracts
 * Purpose:     Shared types, rule keys, and evaluator contracts for the Phase 13b
 *              internal surveillance engine. Imported by every rule, the worker, and the
 *              admin queue/router; no Prisma type leakage outside the engine boundary.
 *
 * Exports:
 *   - RuleKey                    — enum-like string union of every shipped rule key.
 *   - SurveillanceParams         — base shape every rule accepts (autoDismissBelow + free-form).
 *   - RuleSnapshot               — admin-tuned rule snapshot the worker passes to evaluators.
 *   - RuleFireResult             — what an evaluator returns when evidence matches.
 *   - SurveillanceEvaluator      — function shape every rule module must export as `evaluate`.
 *   - QueueFilter                — admin queue filter contract (status, severity, ruleKey, q).
 *   - SurveillanceQueueRow       — admin-facing queue row DTO (no Prisma types leak).
 *   - SurveillanceKpis           — top-of-page KPI hero shape.
 *   - parseConfidenceScore       — clamp 0-100 helper used by rules and admin overrides.
 *
 * Depends on:
 *   - @prisma/client — re-export SurveillanceSeverity / SurveillanceAlertStatus enums for UI.
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - `RuleKey` strings are *stable* — they are written into HouseSurveillanceAlert.ruleKey
 *     rows in production. Renaming a key breaks dedupe and orphans historical alerts.
 *   - `dedupeKey` is *deterministic* per rule (input → same key) — the @@unique constraint
 *     turns duplicate evidence into a no-op upsert.
 *   - LATENCY_ARB is intentionally absent here. It ships in 13b.5 once Order.quoteTickAt exists.
 *
 * Read order:
 *   1. RuleKey                  — the closed set of rules in 13b.
 *   2. RuleFireResult           — the worker contract.
 *   3. SurveillanceEvaluator    — the per-rule contract.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

// Enums are re-exported as *runtime* values so consumers can write
// `SurveillanceSeverity.HIGH` without re-importing from @prisma/client.
import { SurveillanceSeverity, SurveillanceAlertStatus } from "@prisma/client"

export { SurveillanceSeverity, SurveillanceAlertStatus }

/**
 * Closed set of rule keys shipped in Phase 13b.
 *
 * IMPORTANT: these strings are persisted in the DB. If you rename one, ship a one-shot
 * migration that rewrites HouseSurveillanceAlert.ruleKey for the old value first — the
 * @@unique([ruleKey, dedupeKey]) constraint will not catch a typo'd code-side rename.
 *
 * LATENCY_ARB is deferred to 13b.5 (needs Order.quoteTickAt).
 */
export type RuleKey =
  | "HEAVY_HITTER" // event-driven; volume > cohort median × multiplier in trailing window
  | "SUSPICIOUS_WINNER" // event-driven; winner-control rung escalates AND withdrawal queued <Δh
  | "COORDINATED_TRADING" // batch; N+ users same instrument/side within Δsec
  | "MULTI_ACCOUNT" // batch; contact-cluster sharing IP/device/network ≥ minClusterSize
  | "BONUS_ABUSE" // batch; turnover gates met but pattern matches wash-trade params

/**
 * Every rule accepts at least an autoDismissBelow threshold; rule-specific knobs are
 * additive. Workers read SurveillanceRule.params and union it with rule-private fields.
 */
export interface SurveillanceParams {
  /** Confidence floor (0-100). Alerts below this auto-dismiss after env-driven N days. */
  autoDismissBelow?: number
  [k: string]: unknown
}

/**
 * Admin-tuned rule snapshot passed from the worker to each evaluator. The evaluator must
 * NOT re-query the rule registry — the worker already loaded the active rule and frozen
 * its params for this evaluation pass.
 */
export interface RuleSnapshot<P extends SurveillanceParams = SurveillanceParams> {
  ruleKey: RuleKey
  severity: SurveillanceSeverity
  baseConfidence: number
  params: P
}

/**
 * Output of a rule evaluator when evidence matches. The worker upserts an alert keyed
 * by (ruleKey, dedupeKey) with this payload.
 *
 * INVARIANT: `evidence` must be self-contained — the alert is interpretable forever even
 * if the underlying rows mutate or are deleted. Never store raw FK ids alone; include the
 * snapshot values used to make the decision.
 */
export interface RuleFireResult {
  /** Deterministic per-rule dedupe key. Same evidence → same key → upsert no-ops. */
  dedupeKey: string
  /** Subject user — required for every rule today. */
  relatedUserId: string
  /** Optional FK breadcrumbs to the source artefacts. */
  relatedWithdrawalId?: string
  relatedTransactionId?: string
  relatedBonusGrantId?: string
  relatedAffiliateId?: string
  /** Final 0-100 confidence; rule may override snapshot.baseConfidence based on signal strength. */
  confidenceScore: number
  /** Optional severity escalation (e.g. CRITICAL when signal is overwhelming). */
  severity?: SurveillanceSeverity
  /** Operator-facing one-liner; written verbatim into HouseSurveillanceAlert.message. */
  message: string
  /** Free-form JSON snapshot of *what we saw* — counts, sums, IDs, IPs. */
  evidence: Record<string, unknown>
}

/**
 * Function shape every rule module must export as `evaluate`. The worker passes the
 * rule snapshot plus an event-shaped or batch-shaped context. Rules are pure: they read,
 * compute, and return; they do NOT write to the DB. The worker writes via upsert.
 */
export type SurveillanceEvaluator<TContext, P extends SurveillanceParams = SurveillanceParams> = (
  rule: RuleSnapshot<P>,
  ctx: TContext,
) => Promise<RuleFireResult[]>

/** Admin queue filter input. */
export interface QueueFilter {
  status?: SurveillanceAlertStatus | "ANY"
  severity?: SurveillanceSeverity | "ANY"
  ruleKey?: RuleKey | "ANY"
  /** Free-text search across message + relatedUser email/phone. */
  q?: string
  /** Pagination — page is 1-indexed for UI ergonomics. */
  page?: number
  pageSize?: number
}

/** Admin-facing queue row — no Prisma types leak; UI is stable across schema tweaks. */
export interface SurveillanceQueueRow {
  id: string
  ruleKey: RuleKey | string
  ruleName: string
  severity: SurveillanceSeverity
  confidenceScore: number
  status: SurveillanceAlertStatus
  message: string
  createdAt: string // ISO
  user: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
  }
  relatedWithdrawalId: string | null
  relatedTransactionId: string | null
  relatedBonusGrantId: string | null
  relatedAffiliateId: string | null
  assignedTo: { id: string; name: string | null } | null
  evidence: Record<string, unknown>
}

/** Top-of-page KPI hero. Derived in `queue-service.listQueue` so SWR re-renders consistently. */
export interface SurveillanceKpis {
  open: number
  highSeverity: number
  unassigned: number
  resolvedToday: number
}

/** Clamp 0-100; defensive guard at the engine boundary. */
export function parseConfidenceScore(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}
