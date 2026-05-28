/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades/rollup/by-symbol — per-instrument aggregated stats
 *              grouped on (symbol, segment, optionType, strikePrice, expiry) so each
 *              F&O contract rolls up distinctly. Date range scoped, best-effort pagination.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"
import {
  normalizeTradesDate,
  normalizeTradesPage,
  normalizeTradesLimit,
  normalizeTradesString,
} from "@/lib/server/admin-trades-number-utils"
import { isRealizedPnLTransaction } from "@/lib/server/admin-trades-derivation"
import type { SymbolRollupRow } from "@/app/api/admin/trades/types"

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

interface SymbolAccumulator extends SymbolRollupRow {
  _userIds: Set<string>
}

function buildGroupKey(
  symbol: string,
  segment: string | null,
  optionType: string | null,
  strikePrice: number | null,
  expiry: string | null,
): string {
  return [symbol, segment ?? "", optionType ?? "", strikePrice ?? "", expiry ?? ""].join("|")
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/rollup/by-symbol",
      required: "admin.positions.read",
      fallbackMessage: "Failed to compute symbol rollup",
    },
    async () => {
      const url = new URL(req.url)
      const sp = url.searchParams
      const from = normalizeTradesDate(sp.get("from"))
      const to = normalizeTradesDate(sp.get("to"))
      const page = normalizeTradesPage(sp.get("page"))
      const limit = normalizeTradesLimit(sp.get("limit"), 100)
      const symbol = normalizeTradesString(sp.get("symbol"))
      const segment = normalizeTradesString(sp.get("segment"))

      const where: Prisma.PositionWhereInput = {}
      if (from || to) {
        where.createdAt = {}
        if (from) (where.createdAt as Prisma.DateTimeFilter).gte = from
        if (to) (where.createdAt as Prisma.DateTimeFilter).lte = to
      }
      if (symbol) {
        where.symbol = { contains: symbol, mode: "insensitive" }
      }
      if (segment) {
        where.segment = { equals: segment, mode: "insensitive" }
      }

      const positions = await adminPrisma.position.findMany({
        where,
        select: {
          id: true,
          symbol: true,
          quantity: true,
          averagePrice: true,
          closedAt: true,
          createdAt: true,
          unrealizedPnL: true,
          segment: true,
          exchange: true,
          optionType: true,
          strikePrice: true,
          expiry: true,
          tradingAccount: {
            select: { userId: true },
          },
          Stock: {
            select: {
              segment: true,
              exchange: true,
              name: true,
              strikePrice: true,
              optionType: true,
              expiry: true,
              lot_size: true,
            },
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

      const bySymbol = new Map<string, SymbolAccumulator>()

      for (const p of positions) {
        const resolvedSegment = p.Stock?.segment ?? p.segment ?? null
        const resolvedOptionType = (p.Stock?.optionType ?? p.optionType ?? null) as
          | "CE"
          | "PE"
          | null
        const resolvedStrike =
          p.Stock?.strikePrice != null
            ? toNumber(p.Stock.strikePrice)
            : p.strikePrice != null
              ? toNumber(p.strikePrice)
              : null
        const resolvedExpiry = p.Stock?.expiry
          ? new Date(p.Stock.expiry).toISOString()
          : p.expiry
            ? new Date(p.expiry).toISOString()
            : null

        const key = buildGroupKey(
          p.symbol,
          resolvedSegment,
          resolvedOptionType,
          resolvedStrike,
          resolvedExpiry,
        )

        let row = bySymbol.get(key)
        if (!row) {
          const instrumentLabel = formatInstrumentSummary({
            symbol: p.symbol,
            exchange: p.Stock?.exchange ?? p.exchange ?? null,
            segment: resolvedSegment,
            name: p.Stock?.name ?? null,
            strikePrice: resolvedStrike,
            optionType: resolvedOptionType,
            expiry: p.Stock?.expiry ?? p.expiry ?? null,
            lotSize: p.Stock?.lot_size ?? null,
          })
          row = {
            symbol: p.symbol,
            instrumentLabel,
            segment: resolvedSegment,
            optionType: resolvedOptionType,
            strikePrice: resolvedStrike,
            expiry: resolvedExpiry,
            tradesCount: 0,
            uniqueClients: 0,
            wins: 0,
            losses: 0,
            winRatePct: 0,
            grossPnL: 0,
            realizedPnL: 0,
            volumeNotional: 0,
            openCount: 0,
            openUnrealizedPnL: 0,
            _userIds: new Set<string>(),
          }
          bySymbol.set(key, row)
        }

        row.tradesCount += 1

        const uid = p.tradingAccount?.userId
        if (uid) row._userIds.add(uid)

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
        row.grossPnL += realized + charges

        if (realized > 0) row.wins += 1
        else if (realized < 0) row.losses += 1

        if (p.quantity !== 0) {
          row.openCount += 1
          row.openUnrealizedPnL += toNumber(p.unrealizedPnL)
        }
      }

      const all: SymbolRollupRow[] = Array.from(bySymbol.values()).map((r) => {
        const { _userIds, ...rest } = r
        return {
          ...rest,
          uniqueClients: _userIds.size,
          winRatePct: r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses)) * 100 : 0,
        }
      })
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
