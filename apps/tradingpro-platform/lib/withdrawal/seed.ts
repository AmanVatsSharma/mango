/**
 * File:        lib/withdrawal/seed.ts
 * Module:      Withdrawal · Risk Engine · Seed
 * Purpose:     Idempotently upsert the default `WithdrawalRiskRule` rows. Safe to run repeatedly:
 *              keys are stable, the upsert preserves any admin-edited `points` / `params` /
 *              `isActive` values unless the caller passes `forceReset=true`.
 *
 * Exports:
 *   - seedDefaultWithdrawalRiskRules(opts?) → Promise<{ created, updated, skipped }>
 *
 * Depends on:
 *   - @/lib/prisma — DB writes.
 *   - ./rules/registry → DEFAULT_RULES.
 *
 * Side-effects: Upserts up to 5 rows into `withdrawal_risk_rules`.
 *
 * Key invariants:
 *   - Default mode: missing keys are CREATED with seed defaults; existing keys are SKIPPED.
 *   - `forceReset=true`: existing keys have name/description rewritten but points/params/isActive
 *     are preserved (admin tuning is sacred).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { baseLogger as logger } from "@/lib/observability/logger"
import type { Prisma } from "@prisma/client"
import { DEFAULT_RULES } from "./rules/registry"

export interface SeedOptions {
  forceReset?: boolean
}

export interface SeedResult {
  created: number
  updated: number
  skipped: number
}

export async function seedDefaultWithdrawalRiskRules(
  opts: SeedOptions = {},
): Promise<SeedResult> {
  const result: SeedResult = { created: 0, updated: 0, skipped: 0 }
  for (const seed of DEFAULT_RULES) {
    const existing = await prisma.withdrawalRiskRule.findUnique({
      where: { ruleKey: seed.ruleKey },
      select: { id: true },
    })
    if (!existing) {
      await prisma.withdrawalRiskRule.create({
        data: {
          ruleKey: seed.ruleKey,
          name: seed.name,
          description: seed.description,
          points: seed.points,
          params: seed.params as unknown as Prisma.InputJsonValue,
          isActive: true,
        },
      })
      result.created += 1
    } else if (opts.forceReset) {
      await prisma.withdrawalRiskRule.update({
        where: { ruleKey: seed.ruleKey },
        data: {
          name: seed.name,
          description: seed.description,
          // Intentionally NOT overwriting points / params / isActive — admin tuning is preserved.
        },
      })
      result.updated += 1
    } else {
      result.skipped += 1
    }
  }
  logger.info(result, "withdrawal-risk: seed complete")
  return result
}
