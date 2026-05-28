/**
 * File:        lib/services/risk/risk-thresholds-resolver.ts
 * Module:      Risk Management · Thresholds
 * Purpose:     Resolves effective risk thresholds for a user — per-user RiskLimit
 *              overrides take priority; NULL fields fall back to global RiskConfig.
 *
 * Exports:
 *   - UserRiskThresholds                                               — resolved threshold shape
 *   - resolveThresholdsForUser(userId) → Promise<UserRiskThresholds>  — main resolver
 *
 * Depends on:
 *   - @/lib/prisma                             — DB access for RiskLimit rows
 *   - @/lib/services/risk/risk-thresholds      — getRiskThresholds for global warning/auto-close values
 *
 * Side-effects:
 *   - DB read (prisma.riskLimit.findUnique + getRiskThresholds internal reads)
 *
 * Key invariants:
 *   - NULL columns in RiskLimit → use global value (never throws on NULL)
 *   - Percentages are in [0, 100]; values outside that range are clamped
 *   - maxDailyLossInr is returned as number | null (null means "no override set")
 *   - Global fallback mapping: riskLevelHighPct ← warningThreshold * 100,
 *     autoCloseLevelPct ← autoCloseThreshold * 100, low/medium ← env or hardcoded defaults
 *   - maxDailyLossInr has no global default (returns null when per-user override is absent)
 *
 * Read order:
 *   1. UserRiskThresholds — output shape
 *   2. DEFAULT_GLOBAL_THRESHOLDS — global fallback constants
 *   3. resolveThresholdsForUser — resolution logic
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { prisma } from "@/lib/prisma"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "risk-thresholds-resolver" })

export type UserRiskThresholds = {
  riskLevelLowPct: number
  riskLevelMediumPct: number
  riskLevelHighPct: number
  autoCloseLevelPct: number
  /** null means no INR daily-loss limit has been set for this user */
  maxDailyLossInr: number | null
  source: "per-user" | "global" | "mixed"
}

/**
 * Hardcoded fallback defaults for fields not covered by the global SystemSettings.
 * riskLevelLow and riskLevelMedium are purely advisory tiers below the warning level.
 */
const DEFAULT_LOW_PCT = Number(process.env.RISK_LEVEL_LOW_PCT ?? 30)
const DEFAULT_MEDIUM_PCT = Number(process.env.RISK_LEVEL_MEDIUM_PCT ?? 60)

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v))
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function resolveThresholdsForUser(userId: string): Promise<UserRiskThresholds> {
  const [riskLimit, global] = await Promise.all([
    prisma.riskLimit.findUnique({ where: { userId } }),
    getRiskThresholds(),
  ])

  log.debug({ userId, hasRiskLimit: !!riskLimit }, "resolveThresholdsForUser - resolved")

  const globalHighPct = clampPct(global.warningThreshold * 100)
  const globalAutoClosePct = clampPct(global.autoCloseThreshold * 100)

  const perUserLow = toNumber(riskLimit?.riskLevelLowPct)
  const perUserMedium = toNumber(riskLimit?.riskLevelMediumPct)
  const perUserHigh = toNumber(riskLimit?.riskLevelHighPct)
  const perUserAutoClose = toNumber(riskLimit?.autoCloseLevelPct)
  const perUserMaxLoss = toNumber(riskLimit?.maxDailyLossInr)

  const resolvedLow = perUserLow !== null ? clampPct(perUserLow) : DEFAULT_LOW_PCT
  const resolvedMedium = perUserMedium !== null ? clampPct(perUserMedium) : DEFAULT_MEDIUM_PCT
  const resolvedHigh = perUserHigh !== null ? clampPct(perUserHigh) : globalHighPct
  const resolvedAutoClose = perUserAutoClose !== null ? clampPct(perUserAutoClose) : globalAutoClosePct
  const resolvedMaxLoss = perUserMaxLoss !== null ? perUserMaxLoss : null

  const overrideCount = [perUserLow, perUserMedium, perUserHigh, perUserAutoClose, perUserMaxLoss]
    .filter((v) => v !== null).length
  const source: UserRiskThresholds["source"] =
    overrideCount === 5 ? "per-user" : overrideCount === 0 ? "global" : "mixed"

  return {
    riskLevelLowPct: resolvedLow,
    riskLevelMediumPct: resolvedMedium,
    riskLevelHighPct: resolvedHigh,
    autoCloseLevelPct: resolvedAutoClose,
    maxDailyLossInr: resolvedMaxLoss,
    source,
  }
}
