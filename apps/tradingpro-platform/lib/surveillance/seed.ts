/**
 * File:        lib/surveillance/seed.ts
 * Module:      Surveillance · Default Rules Seeder
 * Purpose:     Idempotent upsert of the default Phase 13b rule set into SurveillanceRule.
 *              Operator tuning is *sacred* — once a rule exists, this seeder NEVER
 *              overwrites `severity`, `baseConfidence`, `params`, or `isActive`.
 *
 * Exports:
 *   - seedSurveillanceRules(opts?) — upsert; returns { created, updated, skipped }.
 *
 * Depends on:
 *   - @/lib/prisma — writes SurveillanceRule.
 *
 * Side-effects:
 *   - DB writes: create-on-missing OR update-name-and-description-only on existing.
 *
 * Key invariants:
 *   - `forceReset: true` updates `name` and `description` only — to refresh display strings
 *     after a copy-pass. It MUST NOT reset operator-tuned fields.
 *
 * Read order:
 *   1. seedSurveillanceRules — see existence branch logic.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { DEFAULT_RULES } from "./rules/registry"

export async function seedSurveillanceRules(opts?: { forceReset?: boolean }): Promise<{
  created: number
  updated: number
  skipped: number
}> {
  let created = 0
  let updated = 0
  let skipped = 0

  for (const r of DEFAULT_RULES) {
    const existing = await prisma.surveillanceRule.findUnique({
      where: { ruleKey: r.ruleKey },
      select: { id: true },
    })
    if (!existing) {
      await prisma.surveillanceRule.create({
        data: {
          ruleKey: r.ruleKey,
          name: r.name,
          description: r.description,
          severity: r.severity,
          baseConfidence: r.baseConfidence,
          params: r.params as Prisma.InputJsonValue,
          isActive: true,
        },
      })
      created += 1
      continue
    }

    if (opts?.forceReset) {
      await prisma.surveillanceRule.update({
        where: { id: existing.id },
        data: { name: r.name, description: r.description },
      })
      updated += 1
    } else {
      skipped += 1
    }
  }

  return { created, updated, skipped }
}
