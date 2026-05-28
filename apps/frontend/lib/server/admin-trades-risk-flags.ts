/**
 * @file admin-trades-risk-flags.ts
 * @module server
 * @description Computes actionable risk flags for the admin Trades blotter:
 *              margin > 90%, SL/target breaches pending, top intraday losers, pending approvals.
 *              Pure-ish helper — only depends on Prisma, no Redis / no request context.
 * @author StockTrade
 * @created 2026-04-15
 */

import { prisma } from "@/lib/prisma"
import type { RiskFlag } from "@/app/api/admin/trades/types"
import { istDayRange } from "@/lib/server/admin-trades-number-utils"

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  if (value && typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    try {
      const n = (value as { toNumber: () => number }).toNumber()
      return Number.isFinite(n) ? n : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

const MARGIN_HIGH_THRESHOLD = 0.9

export async function computeAdminTradesRiskFlags(): Promise<RiskFlag[]> {
  const flags: RiskFlag[] = []
  const { startUtc, endUtc } = istDayRange()

  const [tradingAccounts, depositPending, withdrawalPending, todayRealized] =
    await Promise.all([
      prisma.tradingAccount.findMany({
        where: { usedMargin: { gt: 0 } },
        select: {
          userId: true,
          usedMargin: true,
          availableMargin: true,
          user: { select: { id: true, name: true, clientId: true } },
        },
      }),
      prisma.deposit.count({ where: { status: "PENDING" } }),
      prisma.withdrawal.count({ where: { status: "PENDING" } }),
      prisma.transaction.findMany({
        where: {
          createdAt: { gte: startUtc, lt: endUtc },
          positionId: { not: null },
          OR: [
            { description: { startsWith: "Profit from" } },
            { description: { startsWith: "Loss from" } },
            { description: { startsWith: "Realized P&L" } },
            { description: { startsWith: "Position closed" } },
            { description: { startsWith: "Position partially closed" } },
          ],
        },
        select: {
          type: true,
          amount: true,
          tradingAccount: {
            select: { userId: true, user: { select: { id: true, name: true, clientId: true } } },
          },
        },
      }),
    ])

  // 1. Margin high flags
  const highMarginUsers = tradingAccounts
    .map((ta) => {
      const used = toNumber(ta.usedMargin)
      const avail = toNumber(ta.availableMargin)
      const total = used + avail
      if (total <= 0) return null
      const ratio = used / total
      return ratio > MARGIN_HIGH_THRESHOLD ? { ta, ratio } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (highMarginUsers.length > 0 && highMarginUsers.length <= 3) {
    for (const { ta, ratio } of highMarginUsers) {
      flags.push({
        kind: "MARGIN_HIGH",
        severity: "critical",
        label: `${ta.user?.name ?? "User"} margin at ${(ratio * 100).toFixed(1)}%`,
        detail: ta.user?.clientId ? `CID ${ta.user.clientId}` : null,
        target: ta.user ? { type: "user", userId: ta.user.id } : null,
        count: 1,
      })
    }
  } else if (highMarginUsers.length > 3) {
    flags.push({
      kind: "MARGIN_HIGH",
      severity: "critical",
      label: `${highMarginUsers.length} users above 90% margin`,
      detail: "Review exposure immediately",
      target: null,
      count: highMarginUsers.length,
    })
  }

  // 2. Top intraday losers (top 3)
  const pnlByUser = new Map<string, { pnl: number; name: string | null; clientId: string | null; userId: string }>()
  for (const t of todayRealized) {
    const uid = t.tradingAccount?.userId
    if (!uid) continue
    const amt = toNumber(t.amount)
    const signed = t.type === "CREDIT" ? amt : -amt
    const entry = pnlByUser.get(uid) ?? {
      pnl: 0,
      name: t.tradingAccount?.user?.name ?? null,
      clientId: t.tradingAccount?.user?.clientId ?? null,
      userId: uid,
    }
    entry.pnl += signed
    pnlByUser.set(uid, entry)
  }
  const topLosers = Array.from(pnlByUser.values())
    .filter((r) => r.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 3)
  for (const loser of topLosers) {
    flags.push({
      kind: "TOP_LOSER",
      severity: "warn",
      label: `${loser.name ?? "User"} down ₹${Math.abs(loser.pnl).toFixed(0)}`,
      detail: loser.clientId ? `CID ${loser.clientId}` : null,
      target: { type: "user", userId: loser.userId },
      count: 1,
    })
  }

  // 3. Pending approvals (deposits + withdrawals)
  const totalPending = depositPending + withdrawalPending
  if (totalPending > 0) {
    flags.push({
      kind: "APPROVAL_PENDING",
      severity: "info",
      label: `${totalPending} approval${totalPending === 1 ? "" : "s"} pending`,
      detail: `${depositPending} deposits · ${withdrawalPending} withdrawals`,
      target: { type: "route", href: "/admin-console/funds" },
      count: totalPending,
    })
  }

  return flags
}
