/**
 * File:        lib/surveillance/event-dispatcher.ts
 * Module:      Surveillance · Event Dispatcher
 * Purpose:     Glue between Phase 12-style transactional event hooks and the surveillance
 *              event-rule registry. Two thin functions — one for post-Transaction commit,
 *              one for post-Withdrawal queue — each loads the matching active rules and
 *              fans out to evaluators concurrently.
 *
 * Exports:
 *   - dispatchTransactionEvent({ userId, eventAt })
 *   - dispatchWithdrawalQueuedEvent({ withdrawalId, userId, queuedAt, amount? })
 *
 * Depends on:
 *   - @/lib/prisma — read SurveillanceRule
 *   - ./rules/registry — EVENT_RULE_REGISTRY
 *   - ./writer — persistFires
 *
 * Side-effects:
 *   - DB writes via writer.persistFires.
 *   - Wraps every per-rule evaluation in try/catch so a broken rule never throws into
 *     the calling code path (e.g. ConsoleService.createTransaction).
 *
 * Key invariants:
 *   - **NEVER** throws into the caller's path. Surveillance is post-hoc; a broken rule
 *     must not corrupt a deposit, a transaction, or a withdrawal.
 *   - Event handlers are *not* awaited by the caller in the hot path — they are
 *     fire-and-forget. The writer side is the durable record.
 *
 * Read order:
 *   1. dispatchTransactionEvent — see error swallow at the boundary.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { EVENT_RULE_REGISTRY } from "./rules/registry"
import { persistFires } from "./writer"
import type { RuleKey, RuleSnapshot, SurveillanceParams } from "./types"

/** Cheap helper: fetch the active rule snapshot for a given rule key, or null. */
async function loadActiveRule(ruleKey: RuleKey): Promise<RuleSnapshot | null> {
  const rule = await prisma.surveillanceRule.findFirst({
    where: { ruleKey, isActive: true },
    select: { ruleKey: true, severity: true, baseConfidence: true, params: true },
  })
  if (!rule) return null
  return {
    ruleKey: rule.ruleKey as RuleKey,
    severity: rule.severity,
    baseConfidence: rule.baseConfidence,
    params: (rule.params ?? {}) as SurveillanceParams,
  }
}

/**
 * Called by the post-Transaction commit hook. Evaluates HEAVY_HITTER for the trading user.
 */
export async function dispatchTransactionEvent(input: {
  userId: string
  eventAt: Date
}): Promise<void> {
  try {
    const rule = await loadActiveRule("HEAVY_HITTER")
    if (!rule) return
    // The rule expects HeavyHitterParams shape; the loader casts to the generic
    // SurveillanceParams. The evaluator merges defaults so missing keys are filled.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fires = await EVENT_RULE_REGISTRY.HEAVY_HITTER(rule as any, {
      userId: input.userId,
      eventAt: input.eventAt,
    })
    if (fires.length === 0) return
    await persistFires("HEAVY_HITTER", fires)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("⚠️ [SURVEILLANCE] dispatchTransactionEvent failed:", err)
  }
}

/**
 * Called by the post-Withdrawal-create hook (lib/withdrawal/hold-rules.ts → applyHoldOnCreate).
 * Evaluates SUSPICIOUS_WINNER for the queued withdrawal.
 */
export async function dispatchWithdrawalQueuedEvent(input: {
  withdrawalId: string
  userId: string
  queuedAt: Date
  amount?: number
}): Promise<void> {
  try {
    const rule = await loadActiveRule("SUSPICIOUS_WINNER")
    if (!rule) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fires = await EVENT_RULE_REGISTRY.SUSPICIOUS_WINNER(rule as any, {
      withdrawalId: input.withdrawalId,
      userId: input.userId,
      queuedAt: input.queuedAt,
      amount: input.amount,
    })
    if (fires.length === 0) return
    await persistFires("SUSPICIOUS_WINNER", fires)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("⚠️ [SURVEILLANCE] dispatchWithdrawalQueuedEvent failed:", err)
  }
}
