/**
 * File:        lib/withdrawal/rules/large-vs-deposit.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Fires when the requested withdrawal is a large fraction of the user's lifetime
 *              completed deposit total — classic withdraw-and-disappear pattern after a winning
 *              streak. Threshold is admin-tunable via `params.pctOfLifetimeDeposit`.
 *
 * Exports:
 *   - largeVsDepositRule — RuleEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — sums lifetime completed deposits for the user.
 *
 * Side-effects: read-only (sums Deposit.amount where status=COMPLETED).
 *
 * Key invariants:
 *   - Lifetime deposit = sum of `Deposit.amount` where status=COMPLETED. Pending/failed are not counted.
 *   - Default threshold is 80% — high enough to never trip a normal partial withdrawal, low enough
 *     to catch "win once, withdraw everything" cash-out patterns.
 *   - When the user has zero lifetime deposit (e.g., winnings from a no-deposit bonus), the rule
 *     auto-fires — that case is by definition 100% of zero.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { DepositStatus } from "@prisma/client"
import type { RuleEvaluator } from "../types"

const DEFAULT_PCT = 80

export const largeVsDepositRule: RuleEvaluator = async ({ userId, amount, params }) => {
  const pct =
    typeof params.pctOfLifetimeDeposit === "number" && params.pctOfLifetimeDeposit > 0
      ? params.pctOfLifetimeDeposit
      : DEFAULT_PCT

  const sum = await prisma.deposit.aggregate({
    where: { userId, status: DepositStatus.COMPLETED },
    _sum: { amount: true },
  })
  const lifetime = Number(sum._sum.amount ?? 0)

  if (lifetime <= 0) {
    return {
      fired: true,
      message: "No completed deposits on record — withdrawal funded entirely by trading P&L.",
    }
  }

  const ratio = (amount / lifetime) * 100
  if (ratio >= pct) {
    return {
      fired: true,
      message: `Withdrawal is ${ratio.toFixed(1)}% of lifetime deposits (threshold ${pct}%).`,
    }
  }
  return { fired: false }
}
