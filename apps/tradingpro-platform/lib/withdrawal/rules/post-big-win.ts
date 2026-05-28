/**
 * File:        lib/withdrawal/rules/post-big-win.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Fires when the user has banked a large net realised P&L within the last
 *              `params.windowHours` (default 24h). The classic B-book risk: client wins big,
 *              immediately tries to cash out before the spread starts working against them again.
 *
 * Exports:
 *   - postBigWinRule — RuleEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — TradingAccount → Transaction sum scoped to closed positions in the window.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - Net realised P&L = Σ(CREDIT) − Σ(DEBIT) on Transactions linked to a closed Position whose
 *     `closedAt` is within the lookback window. This intentionally ignores still-open positions —
 *     we only flag *banked* wins, not paper P&L.
 *   - Defaults: 24h / ₹50,000. Tunable per-environment via `params.windowHours` and `params.minWin`.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import type { RuleEvaluator } from "../types"

const DEFAULT_WINDOW_H = 24
const DEFAULT_MIN_WIN = 50_000

export const postBigWinRule: RuleEvaluator = async ({ userId, params }) => {
  const windowHours =
    typeof params.windowHours === "number" && params.windowHours > 0
      ? params.windowHours
      : DEFAULT_WINDOW_H
  const minWin =
    typeof params.minWin === "number" && params.minWin > 0
      ? params.minWin
      : DEFAULT_MIN_WIN

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)

  const accounts = await prisma.tradingAccount.findMany({
    where: { userId },
    select: { id: true },
  })
  if (accounts.length === 0) return { fired: false }
  const accountIds = accounts.map((a) => a.id)

  // Sum CREDIT - DEBIT on transactions whose linked position closed within the window. The
  // position-link is what tells us this is *trade* P&L, not a deposit / bonus / charge.
  const closedPositions = await prisma.position.findMany({
    where: {
      tradingAccountId: { in: accountIds },
      closedAt: { gte: since },
    },
    select: { id: true },
  })
  if (closedPositions.length === 0) return { fired: false }

  const positionIds = closedPositions.map((p) => p.id)
  const sums = await prisma.transaction.groupBy({
    by: ["type"],
    where: { positionId: { in: positionIds } },
    _sum: { amount: true },
  })

  let credit = 0
  let debit = 0
  for (const row of sums) {
    const v = Number(row._sum.amount ?? 0)
    if (row.type === "CREDIT") credit += v
    else if (row.type === "DEBIT") debit += v
  }
  const netPnL = credit - debit

  if (netPnL >= minWin) {
    return {
      fired: true,
      message: `Net realised P&L of ₹${Math.round(netPnL).toLocaleString("en-IN")} in last ${windowHours}h (threshold ₹${minWin.toLocaleString("en-IN")}).`,
    }
  }
  return { fired: false }
}
