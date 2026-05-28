/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades/rollup/by-client — per-user aggregated stats (trades count,
 *              win rate, gross/realized P&L, volume). Date range scoped, best-effort pagination.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  normalizeTradesDate,
  normalizeTradesPage,
  normalizeTradesLimit,
  normalizeTradesString,
} from "@/lib/server/admin-trades-number-utils"
import { isRealizedPnLTransaction } from "@/lib/server/admin-trades-derivation"
import type { ClientRollupRow } from "@/app/api/admin/trades/types"

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
      route: "/api/admin/trades/rollup/by-client",
      required: "admin.positions.read",
      fallbackMessage: "Failed to compute client rollup",
    },
    async () => {
      const url = new URL(req.url)
      const sp = url.searchParams
      const from = normalizeTradesDate(sp.get("from"))
      const to = normalizeTradesDate(sp.get("to"))
      const page = normalizeTradesPage(sp.get("page"))
      const limit = normalizeTradesLimit(sp.get("limit"), 100)
      const symbol = normalizeTradesString(sp.get("symbol"))

      const where: Prisma.PositionWhereInput = {}
      if (from || to) {
        where.createdAt = {}
        if (from) (where.createdAt as Prisma.DateTimeFilter).gte = from
        if (to) (where.createdAt as Prisma.DateTimeFilter).lte = to
      }
      if (symbol) {
        where.symbol = { contains: symbol, mode: "insensitive" }
      }

      const positions = await adminPrisma.position.findMany({
        where,
        select: {
          id: true,
          quantity: true,
          averagePrice: true,
          closedAt: true,
          createdAt: true,
          unrealizedPnL: true,
          tradingAccount: {
            select: { user: { select: { id: true, name: true, clientId: true } } },
          },
          orders: {
            select: {
              orderPurpose: true,
              filledQuantity: true,
              quantity: true,
              status: true,
              placementCharges: true,
              averagePrice: true,
            },
          },
          transactions: {
            select: { id: true, description: true, type: true, amount: true, positionId: true },
          },
        },
      })

      const byUser = new Map<string, ClientRollupRow>()

      for (const p of positions) {
        const user = p.tradingAccount?.user
        if (!user) continue
        const row =
          byUser.get(user.id) ??
          ({
            userId: user.id,
            name: user.name,
            clientId: user.clientId,
            tradesCount: 0,
            wins: 0,
            losses: 0,
            winRatePct: 0,
            grossPnL: 0,
            charges: 0,
            realizedPnL: 0,
            volumeNotional: 0,
            openCount: 0,
            openUnrealizedPnL: 0,
            avgHeldMs: 0,
          } satisfies ClientRollupRow)

        row.tradesCount += 1

        const entryQty = p.orders
          .filter((o) => o.orderPurpose === "OPEN" && o.status === "EXECUTED")
          .reduce((s, o) => s + (o.filledQuantity ?? o.quantity), 0)
        const avgEntry = toNumber(p.averagePrice)
        const totalQ = entryQty > 0 ? entryQty : Math.abs(p.quantity)
        row.volumeNotional += avgEntry * totalQ

        let realized = 0
        for (const t of p.transactions) {
          if (isRealizedPnLTransaction({ positionId: p.id, description: t.description })) {
            const amt = toNumber(t.amount)
            realized += t.type === "CREDIT" ? amt : -amt
          }
        }
        row.realizedPnL += realized
        const charges = p.orders.reduce((s, o) => s + toNumber(o.placementCharges), 0)
        row.charges += charges
        row.grossPnL += realized + charges

        if (realized > 0) row.wins += 1
        else if (realized < 0) row.losses += 1

        if (p.quantity !== 0) {
          row.openCount += 1
          row.openUnrealizedPnL += toNumber(p.unrealizedPnL)
        }

        const entryMs = new Date(p.createdAt).getTime()
        const exitMs = p.closedAt ? new Date(p.closedAt).getTime() : Date.now()
        const heldMs = Math.max(0, exitMs - entryMs)
        // running average
        row.avgHeldMs = row.avgHeldMs + (heldMs - row.avgHeldMs) / row.tradesCount

        byUser.set(user.id, row)
      }

      const all = Array.from(byUser.values()).map((r) => ({
        ...r,
        winRatePct: r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses)) * 100 : 0,
      }))
      all.sort((a, b) => b.realizedPnL - a.realizedPnL)

      const total = all.length
      const start = (page - 1) * limit
      const sliced = all.slice(start, start + limit)
      return NextResponse.json(
        { rows: sliced, total, page, pages: Math.max(1, Math.ceil(total / limit)) },
        { status: 200 },
      )
    },
  )
}
