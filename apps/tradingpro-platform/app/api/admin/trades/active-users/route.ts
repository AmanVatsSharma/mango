/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades/active-users — left-panel list of users with open positions
 *              or recent trade activity, with compact mini-stats per user.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  normalizeTradesLimit,
  normalizeTradesString,
  istDayRange,
} from "@/lib/server/admin-trades-number-utils"
import type { ActiveUsersResponse, ActiveUserRow } from "@/app/api/admin/trades/types"

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

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/active-users",
      required: "admin.positions.read",
      fallbackMessage: "Failed to fetch active users",
    },
    async () => {
      const url = new URL(req.url)
      const search = normalizeTradesString(url.searchParams.get("search"))
      const limit = normalizeTradesLimit(url.searchParams.get("limit"), 300)
      const sortBy = normalizeTradesString(url.searchParams.get("sortBy")) ?? "todayPnL"

      const { startUtc: istStart, endUtc: istEnd } = istDayRange()

      // Candidate users: those with at least one open position OR recent trade activity.
      const userWhere: Prisma.UserWhereInput = {
        role: "USER",
        isActive: true,
        tradingAccount: {
          positions: {
            some: {
              OR: [
                { quantity: { not: 0 } },
                { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                { closedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
              ],
            },
          },
        },
      }
      if (search) {
        userWhere.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { clientId: { contains: search, mode: "insensitive" } },
          { id: search },
        ]
      }

      const candidates = await prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          clientId: true,
          tradingAccount: {
            select: {
              id: true,
              availableMargin: true,
              usedMargin: true,
              positions: {
                where: { quantity: { not: 0 }, closedAt: null },
                select: { quantity: true, unrealizedPnL: true, createdAt: true, closedAt: true },
              },
            },
          },
        },
        take: limit * 2, // over-fetch a bit so sort stability works before slicing
      })

      // Build per-user realized P&L today from transactions
      const userIds = candidates.map((u) => u.id)
      const todayTx = await adminPrisma.transaction.findMany({
        where: {
          createdAt: { gte: istStart, lt: istEnd },
          positionId: { not: null },
          tradingAccount: { userId: { in: userIds } },
          OR: [
            { description: { startsWith: "Realized P&L" } },
            { description: { startsWith: "Position closed" } },
            { description: { startsWith: "Position partially closed" } },
          ],
        },
        select: {
          type: true,
          amount: true,
          tradingAccount: { select: { userId: true } },
          positionId: true,
          createdAt: true,
        },
      })

      const todayPnLByUser = new Map<string, number>()
      const todayTradesByUser = new Map<string, Set<string>>()
      const lastActivityByUser = new Map<string, number>()
      for (const t of todayTx) {
        const uid = t.tradingAccount?.userId
        if (!uid) continue
        const amt = toNumber(t.amount)
        const signed = t.type === "CREDIT" ? amt : -amt
        todayPnLByUser.set(uid, (todayPnLByUser.get(uid) ?? 0) + signed)
        if (t.positionId) {
          const set = todayTradesByUser.get(uid) ?? new Set<string>()
          set.add(t.positionId)
          todayTradesByUser.set(uid, set)
        }
        const at = t.createdAt.getTime()
        lastActivityByUser.set(uid, Math.max(lastActivityByUser.get(uid) ?? 0, at))
      }

      const rows: ActiveUserRow[] = candidates.map((u) => {
        const openPositions = u.tradingAccount?.positions ?? []
        const openCount = openPositions.length
        const openUnrealizedPnL = openPositions.reduce(
          (s, p) => s + toNumber(p.unrealizedPnL),
          0,
        )
        const used = toNumber(u.tradingAccount?.usedMargin)
        const avail = toNumber(u.tradingAccount?.availableMargin)
        const total = used + avail
        const marginUsedPct = total > 0 ? (used / total) * 100 : null
        const lastActivityMs = lastActivityByUser.get(u.id) ?? null
        return {
          userId: u.id,
          name: u.name,
          clientId: u.clientId,
          openPositionsCount: openCount,
          openUnrealizedPnL,
          todayNetPnL: todayPnLByUser.get(u.id) ?? 0,
          todayTradesCount: todayTradesByUser.get(u.id)?.size ?? 0,
          lastActivityAt: lastActivityMs ? new Date(lastActivityMs).toISOString() : null,
          marginUsedPct,
        }
      })

      rows.sort((a, b) => {
        switch (sortBy) {
          case "openCount":
            return b.openPositionsCount - a.openPositionsCount
          case "unrealizedPnL":
            return b.openUnrealizedPnL - a.openUnrealizedPnL
          case "lastActivity":
            return (
              (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) -
              (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0)
            )
          case "todayPnL":
          default:
            return b.todayNetPnL - a.todayNetPnL
        }
      })

      const sliced = rows.slice(0, limit)
      const response: ActiveUsersResponse = { users: sliced, total: rows.length }
      return NextResponse.json(response, { status: 200 })
    },
  )
}
