/**
 * File:        lib/withdrawal/rules/dormant-reactivation.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Fires when a user who has been dormant for `params.dormantDays` (default 90)
 *              suddenly attempts a withdrawal. Common account-takeover signal — attacker logs
 *              into a forgotten account and tries to drain.
 *
 * Exports:
 *   - dormantReactivationRule — RuleEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — reads `UserSessionRecord.lastSeenAt` for the most recent live session.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - "Dormant" = max(UserSessionRecord.lastSeenAt) is older than threshold. The User table has
 *     no lastLoginAt column — UserSessionRecord is the single source of truth for activity.
 *   - Brand-new users with no session record yet do NOT fire here (FIRST_WITHDRAWAL covers that
 *     case — we don't want to double-charge the same risk through two rules).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import type { RuleEvaluator } from "../types"

const DEFAULT_DORMANT_DAYS = 90

export const dormantReactivationRule: RuleEvaluator = async ({ userId, params }) => {
  const days =
    typeof params.dormantDays === "number" && params.dormantDays > 0
      ? params.dormantDays
      : DEFAULT_DORMANT_DAYS

  const lastSession = await prisma.userSessionRecord.findFirst({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true },
  })
  if (!lastSession) return { fired: false }

  const ageMs = Date.now() - lastSession.lastSeenAt.getTime()
  const thresholdMs = days * 24 * 60 * 60 * 1000
  if (ageMs > thresholdMs) {
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
    return {
      fired: true,
      message: `User dormant for ${ageDays}d (threshold ${days}d) — possible account-takeover attempt.`,
    }
  }
  return { fired: false }
}
