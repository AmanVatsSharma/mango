/**
 * File:        lib/withdrawal/rules/first-withdrawal.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Fires when this is the user's first-ever approved withdrawal — the highest-fraud
 *              window in the lifecycle (mule accounts, bonus farmers).
 *
 * Exports:
 *   - firstWithdrawalRule — RuleEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — DB read
 *
 * Side-effects: read-only (count of prior approved withdrawals).
 *
 * Key invariants:
 *   - Counts COMPLETED + APPROVED states as "approved" (PENDING is in-flight, not approved).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { WithdrawalStatus } from "@prisma/client"
import type { RuleEvaluator } from "../types"

/**
 * NOTE: the `WithdrawalStatus` enum only has PENDING/PROCESSING/COMPLETED/FAILED/CANCELLED — the
 * happy-path "approved-and-paid" state is COMPLETED. PROCESSING is mid-flight (already approved,
 * waiting on the bank rail) so it counts toward "user has trusted history."
 */
export const firstWithdrawalRule: RuleEvaluator = async ({ userId, withdrawalId }) => {
  const priorTrusted = await prisma.withdrawal.count({
    where: {
      userId,
      id: { not: withdrawalId },
      status: { in: [WithdrawalStatus.COMPLETED, WithdrawalStatus.PROCESSING] },
    },
  })
  if (priorTrusted === 0) {
    return { fired: true, message: "First-ever withdrawal — manual review required." }
  }
  return { fired: false }
}
