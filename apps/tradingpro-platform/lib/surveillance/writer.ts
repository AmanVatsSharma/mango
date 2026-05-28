/**
 * File:        lib/surveillance/writer.ts
 * Module:      Surveillance · Alert Writer
 * Purpose:     Single point of write for HouseSurveillanceAlert. Every rule's
 *              `RuleFireResult[]` flows through here. The writer enforces the
 *              `@@unique([ruleKey, dedupeKey])` contract via `prisma.upsert` so the same
 *              evidence never produces two rows.
 *
 * Exports:
 *   - persistFires(ruleKey, fires)          — upserts a rule's batch of fires
 *   - autoDismissLowConfidence(beforeAt)    — sweep helper for the nightly job
 *
 * Depends on:
 *   - @/lib/prisma — writes HouseSurveillanceAlert.
 *
 * Side-effects:
 *   - DB writes (upsert + bulk update). Logs warn-level on per-row failure;
 *     one bad row never blocks the rest.
 *
 * Key invariants:
 *   - Writer is the ONLY allowed mutator of HouseSurveillanceAlert.status from rule code.
 *     Admin actions go through API handlers, which call into a separate service. This
 *     keeps the rule-side contract pure and the admin-side contract auditable.
 *   - On re-fire of an existing alert: we update `confidenceScore`, `severity`, `message`,
 *     `evidence`, and bump `updatedAt` — but never reset `status`. If an admin already
 *     dismissed an alert for an evidence pattern, re-fire will not reopen it.
 *
 * Read order:
 *   1. persistFires — see "preserve status on re-fire" branch.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { SurveillanceAlertStatus } from "@prisma/client"
import type { RuleFireResult, RuleKey } from "./types"

/**
 * Upsert a rule's batch of fires. We deliberately do NOT touch `status` on update —
 * dismissed alerts stay dismissed, even if evidence re-fires. The operator is in charge
 * of reopening; auto-reopen would create an inescapable noise loop.
 */
export async function persistFires(
  ruleKey: RuleKey,
  fires: RuleFireResult[],
): Promise<{ created: number; updated: number; failed: number }> {
  let created = 0
  let updated = 0
  let failed = 0
  for (const f of fires) {
    try {
      const existing = await prisma.houseSurveillanceAlert.findUnique({
        where: { ruleKey_dedupeKey: { ruleKey, dedupeKey: f.dedupeKey } },
        select: { id: true },
      })
      if (existing) {
        await prisma.houseSurveillanceAlert.update({
          where: { id: existing.id },
          data: {
            confidenceScore: f.confidenceScore,
            ...(f.severity ? { severity: f.severity } : {}),
            message: f.message,
            evidence: f.evidence as Prisma.InputJsonValue,
          },
        })
        updated += 1
      } else {
        await prisma.houseSurveillanceAlert.create({
          data: {
            ruleKey,
            dedupeKey: f.dedupeKey,
            confidenceScore: f.confidenceScore,
            ...(f.severity ? { severity: f.severity } : {}),
            relatedUserId: f.relatedUserId,
            relatedWithdrawalId: f.relatedWithdrawalId ?? null,
            relatedTransactionId: f.relatedTransactionId ?? null,
            relatedBonusGrantId: f.relatedBonusGrantId ?? null,
            relatedAffiliateId: f.relatedAffiliateId ?? null,
            message: f.message,
            evidence: f.evidence as Prisma.InputJsonValue,
          },
        })
        created += 1
      }
    } catch (err) {
      failed += 1
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ [SURVEILLANCE-WRITER] Failed to persist fire for ${ruleKey}/${f.dedupeKey}:`,
        err,
      )
    }
  }
  return { created, updated, failed }
}

/**
 * Auto-dismiss alerts whose confidence is below the rule's `params.autoDismissBelow`
 * floor and which have been OPEN longer than the env-driven horizon.
 *
 * Caller (the nightly job) supplies `beforeAt` — alerts created on or before this date
 * with status OPEN are eligible. `confidenceScoreCutoff` is computed by the caller from
 * each rule's params.
 */
export async function autoDismissLowConfidence(args: {
  beforeAt: Date
  ruleKey: string
  confidenceScoreCutoff: number
  systemUserId?: string | null
  reason?: string
}): Promise<{ dismissed: number }> {
  const result = await prisma.houseSurveillanceAlert.updateMany({
    where: {
      ruleKey: args.ruleKey,
      status: SurveillanceAlertStatus.OPEN,
      createdAt: { lte: args.beforeAt },
      confidenceScore: { lt: args.confidenceScoreCutoff },
    },
    data: {
      status: SurveillanceAlertStatus.DISMISSED,
      dismissedAt: new Date(),
      dismissReason:
        args.reason ?? `Auto-dismissed (confidence < ${args.confidenceScoreCutoff})`,
      dismissedById: args.systemUserId ?? null,
    },
  })
  return { dismissed: result.count }
}
