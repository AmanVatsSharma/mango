/**
 * File:        lib/winners/rule-engine.ts
 * Module:      Winners · Auto-Promotion Rule Engine
 * Purpose:     Decide whether a client should auto-advance to the next mitigation rung
 *              based on win-rate + lifetime broker liability thresholds. Designed to be
 *              triggered from a settled-Transaction event subscriber (debounced 60s/client,
 *              idempotent on Transaction.id).
 *
 *              Wired into the post-fill hook in OrderExecutionWorker.runPostFillBookkeeping
 *              — fires on every closing trade with applyPromotion=true. Idempotency key is
 *              the latest Realised P&L Transaction id linked to the filled order.
 *
 * Exports:
 *   - evaluateClientForPromotion(userId, opts?) — main entry; returns proposed action
 *   - PromotionDecision                          — { advance: bool, toRung, reason }
 *   - getRulesConfig()                          — current thresholds (env-tunable)
 *
 * Depends on:
 *   - @/lib/prisma — reads Transaction history for win-rate + liability calc
 *   - ./control-service — reads existing rung; performs the actual write if advance=true
 *   - ./types — DEFAULT_WINNER_RULES, WinnerRulesConfig, WinnerRung
 *
 * Side-effects:
 *   - DB read (Transactions for the target user)
 *   - On `applyPromotion=true`: DB write via control-service
 *   - Redis pub/sub (via control-service.updateControl)
 *
 * Key invariants:
 *   - Pinned controls are never auto-promoted (admin override).
 *   - One rung at a time — never skip rungs (the plan's "severity-driven skip" is
 *     handled by surveillance triggers in Phase 13, not this engine).
 *   - Idempotency on Transaction.id: if the engine has already evaluated for this txn,
 *     it returns { advance: false, reason: "ALREADY_EVALUATED" } without DB write.
 *   - Debounce window: if the last history row for this client is < debounceSeconds old,
 *     the engine returns { advance: false, reason: "DEBOUNCED" }.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { prisma } from "@/lib/prisma"
import { getControl, updateControl } from "./control-service"
import {
  DEFAULT_WINNER_RULES,
  WINNER_RUNGS,
  type WinnerRulesConfig,
  type WinnerRung,
} from "./types"

export interface PromotionDecision {
  advance: boolean
  toRung: WinnerRung
  fromRung: WinnerRung
  reason: string
  metrics?: {
    winRate: number
    settledTrades: number
    lifetimeBrokerLiability: number
  }
}

/** Phase 9 ships with hard-coded defaults. Phase 13 surveillance config UI tunes them. */
export function getRulesConfig(): WinnerRulesConfig {
  return DEFAULT_WINNER_RULES
}

interface EvaluateOpts {
  /** When provided, the engine writes the new rung if advance=true. Default false. */
  applyPromotion?: boolean
  /** Triggering Transaction.id for idempotency dedupe in history. */
  triggeredByTransactionId?: string
}

export async function evaluateClientForPromotion(
  userId: string,
  opts: EvaluateOpts = {},
): Promise<PromotionDecision> {
  const rules = getRulesConfig()
  const control = await getControl(userId)

  if (control.pinned) {
    return {
      advance: false,
      fromRung: control.rung,
      toRung: control.rung,
      reason: "PINNED",
    }
  }

  // Idempotency: have we already processed this transaction event?
  if (opts.triggeredByTransactionId && control.id) {
    const existing = await prisma.clientWinnerControlHistory.findFirst({
      where: {
        controlId: control.id,
        triggeredByTransactionId: opts.triggeredByTransactionId,
      },
      select: { id: true },
    })
    if (existing) {
      return {
        advance: false,
        fromRung: control.rung,
        toRung: control.rung,
        reason: "ALREADY_EVALUATED",
      }
    }
  }

  // Debounce: skip if last history row is fresh
  if (control.id) {
    const last = await prisma.clientWinnerControlHistory.findFirst({
      where: { controlId: control.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    if (last) {
      const ageMs = Date.now() - last.createdAt.getTime()
      if (ageMs < rules.debounceSeconds * 1000) {
        return {
          advance: false,
          fromRung: control.rung,
          toRung: control.rung,
          reason: "DEBOUNCED",
        }
      }
    }
  }

  const metrics = await computeMetrics(userId)
  const fromRung = control.rung
  const proposed = proposeNextRung(fromRung, metrics, rules)

  if (proposed === fromRung) {
    return {
      advance: false,
      fromRung,
      toRung: fromRung,
      reason: "NO_CHANGE",
      metrics,
    }
  }

  // Only advance one rung at a time.
  const fromIdx = WINNER_RUNGS.indexOf(fromRung)
  const proposedIdx = WINNER_RUNGS.indexOf(proposed)
  const nextRung: WinnerRung = proposedIdx > fromIdx ? WINNER_RUNGS[fromIdx + 1] : proposed

  if (opts.applyPromotion) {
    await updateControl(
      userId,
      {
        rung: nextRung,
        // When auto-promoting INTO SPREAD_WIDEN / POSITION_CAP, attach the default knobs.
        ...(nextRung === "SPREAD_WIDEN"
          ? { spreadMultiplier: rules.defaultSpreadMultiplier }
          : {}),
        ...(nextRung === "POSITION_CAP"
          ? { positionCapPct: rules.defaultPositionCapPct }
          : {}),
        reason: `Auto-promotion: ${describeMetrics(metrics)}`,
      },
      {
        performedById: SYSTEM_ACTOR,
        action: proposedIdx > fromIdx ? "AUTO_PROMOTE" : "AUTO_DEMOTE",
        triggeredByTransactionId: opts.triggeredByTransactionId,
        metadata: { metrics, rules },
      },
    )
  }

  return {
    advance: true,
    fromRung,
    toRung: nextRung,
    reason: describeMetrics(metrics),
    metrics,
  }
}

/**
 * The system actor stands in for "auto engine" in audit rows. control-service's
 * `updatedBy.connect` requires a real User; in production the migration seeds a
 * `system@bharaterp.local` user with role=SUPER_ADMIN. Phase 9.5 wires the actor
 * resolution to that seed; Phase 9 ships an env-overridable fallback for dev.
 */
const SYSTEM_ACTOR = process.env.WINNER_ENGINE_SYSTEM_USER_ID ?? "system"

interface ClientMetrics {
  winRate: number
  settledTrades: number
  lifetimeBrokerLiability: number
}

async function computeMetrics(userId: string): Promise<ClientMetrics> {
  const account = await prisma.tradingAccount.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!account) {
    return { winRate: 0, settledTrades: 0, lifetimeBrokerLiability: 0 }
  }

  const txns = await prisma.transaction.findMany({
    where: {
      tradingAccountId: account.id,
      orderId: { not: null },
      description: { startsWith: "Realized P&L" },
    },
    select: { amount: true, type: true },
    take: 5000, // hard cap to keep the engine cheap
  })

  let wins = 0
  let losses = 0
  let lifetimeBrokerLiability = 0
  for (const t of txns) {
    const amt = Number(t.amount)
    if (t.type === "CREDIT") {
      wins += 1
      // client gained → broker lost → liability +amt
      lifetimeBrokerLiability += amt
    } else if (t.type === "DEBIT") {
      losses += 1
      // client lost → broker gained → liability -amt
      lifetimeBrokerLiability -= amt
    }
  }

  const settledTrades = wins + losses
  const winRate = settledTrades === 0 ? 0 : wins / settledTrades

  return { winRate, settledTrades, lifetimeBrokerLiability }
}

function proposeNextRung(
  current: WinnerRung,
  metrics: ClientMetrics,
  rules: WinnerRulesConfig,
): WinnerRung {
  // Engine never auto-promotes past INSTRUMENT_BLOCK (rung 4).
  // ORDER_REJECT / CLOSE_ONLY / CLOSED_OUT are admin-only escalations.
  let target: WinnerRung = current

  const meetsWatch =
    metrics.settledTrades >= rules.watchMinTrades && metrics.winRate >= rules.watchWinRate
  if (meetsWatch && current === "NONE") target = "WATCH"

  if (metrics.lifetimeBrokerLiability >= rules.spreadWidenLiability) {
    target = pickHigher(target, "SPREAD_WIDEN")
  }
  if (metrics.lifetimeBrokerLiability >= rules.positionCapLiability) {
    target = pickHigher(target, "POSITION_CAP")
  }
  if (metrics.lifetimeBrokerLiability >= rules.instrumentBlockLiability) {
    target = pickHigher(target, "INSTRUMENT_BLOCK")
  }

  return target
}

function pickHigher(a: WinnerRung, b: WinnerRung): WinnerRung {
  return WINNER_RUNGS.indexOf(a) >= WINNER_RUNGS.indexOf(b) ? a : b
}

function describeMetrics(m: ClientMetrics): string {
  const winRatePct = (m.winRate * 100).toFixed(1)
  const liabL = (m.lifetimeBrokerLiability / 100000).toFixed(1)
  return `${m.settledTrades} trades · ${winRatePct}% win-rate · broker liability ₹${liabL}L`
}
