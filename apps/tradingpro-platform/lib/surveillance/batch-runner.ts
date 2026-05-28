/**
 * File:        lib/surveillance/batch-runner.ts
 * Module:      Surveillance · Batch Runner
 * Purpose:     Nightly entry point. Loads every active batch rule from SurveillanceRule,
 *              runs each evaluator, persists fires, and sweeps low-confidence alerts.
 *              Designed to be called from `scripts/run-surveillance-batch.ts` (cron).
 *
 * Exports:
 *   - runSurveillanceBatch(opts?) — entry point. Returns a per-rule report.
 *
 * Depends on:
 *   - @/lib/prisma — read SurveillanceRule
 *   - ./rules/registry — BATCH_RULE_REGISTRY
 *   - ./writer — persistFires + autoDismissLowConfidence
 *
 * Side-effects:
 *   - DB reads and writes through the writer.
 *
 * Key invariants:
 *   - Each rule is independently try/caught — one broken rule never aborts the batch.
 *   - Auto-dismissal sweeps run AFTER all firing — so alerts that just escalated above the
 *     dismissal floor are not auto-dismissed in the same pass.
 *
 * Read order:
 *   1. runSurveillanceBatch — see "for each batch rule" loop.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { BATCH_RULE_REGISTRY } from "./rules/registry"
import { persistFires, autoDismissLowConfidence } from "./writer"
import type { RuleKey, RuleSnapshot, SurveillanceParams } from "./types"

const AUTO_DISMISS_DAYS_DEFAULT = 7

interface BatchReport {
  ruleKey: RuleKey
  isActive: boolean
  fires: number
  created: number
  updated: number
  failed: number
  autoDismissed: number
  errored: boolean
  error?: string
}

export async function runSurveillanceBatch(opts?: {
  /** Override "now" — useful for backfills/replays. Default: new Date(). */
  now?: Date
  /** Override env-driven N-day horizon for low-confidence auto-dismissal. */
  autoDismissDays?: number
}): Promise<{ ranAt: string; reports: BatchReport[] }> {
  const now = opts?.now ?? new Date()
  const autoDismissDays =
    opts?.autoDismissDays ??
    Number(process.env.SURVEILLANCE_AUTO_DISMISS_DAYS ?? AUTO_DISMISS_DAYS_DEFAULT)
  const autoDismissBefore = new Date(now.getTime() - autoDismissDays * 24 * 60 * 60 * 1000)

  const rules = await prisma.surveillanceRule.findMany({
    where: {
      ruleKey: { in: Object.keys(BATCH_RULE_REGISTRY) },
    },
  })

  const reports: BatchReport[] = []
  for (const ruleKey of Object.keys(BATCH_RULE_REGISTRY) as Array<keyof typeof BATCH_RULE_REGISTRY>) {
    const dbRule = rules.find((r) => r.ruleKey === ruleKey)
    const report: BatchReport = {
      ruleKey: ruleKey as RuleKey,
      isActive: !!dbRule?.isActive,
      fires: 0,
      created: 0,
      updated: 0,
      failed: 0,
      autoDismissed: 0,
      errored: false,
    }
    if (!dbRule || !dbRule.isActive) {
      reports.push(report)
      continue
    }
    const snapshot: RuleSnapshot = {
      ruleKey: dbRule.ruleKey as RuleKey,
      severity: dbRule.severity,
      baseConfidence: dbRule.baseConfidence,
      params: (dbRule.params ?? {}) as SurveillanceParams,
    }
    try {
      const evaluator = BATCH_RULE_REGISTRY[ruleKey]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fires = await (evaluator as any)(snapshot, { batchAt: now })
      report.fires = fires.length
      const stats = await persistFires(ruleKey as RuleKey, fires)
      report.created = stats.created
      report.updated = stats.updated
      report.failed = stats.failed
    } catch (err) {
      report.errored = true
      report.error = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.warn(`⚠️ [SURVEILLANCE-BATCH] Rule ${ruleKey} threw:`, err)
    }
    reports.push(report)
  }

  // Auto-dismissal sweep — done per-rule, so each rule's `params.autoDismissBelow` is honoured.
  for (const dbRule of rules) {
    const cutoff = Number(
      (dbRule.params as { autoDismissBelow?: number } | null)?.autoDismissBelow ?? 0,
    )
    if (cutoff <= 0) continue
    try {
      const r = await autoDismissLowConfidence({
        beforeAt: autoDismissBefore,
        ruleKey: dbRule.ruleKey,
        confidenceScoreCutoff: cutoff,
      })
      const report = reports.find((x) => x.ruleKey === dbRule.ruleKey)
      if (report) report.autoDismissed = r.dismissed
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ [SURVEILLANCE-BATCH] autoDismiss for ${dbRule.ruleKey} threw:`,
        err,
      )
    }
  }

  return { ranAt: now.toISOString(), reports }
}
