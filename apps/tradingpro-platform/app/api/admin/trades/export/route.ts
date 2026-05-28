/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades/export — streams a CSV of the current trades filter view.
 *              Mirrors the filter builder of /api/admin/trades but caps rows at EXPORT_LIMIT
 *              and omits per-row ledger/orders enrichment (flat one-row-per-position view).
 * @author StockTrade
 * @created 2026-04-15
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { NextResponse } from "next/server"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"
import {
  normalizeTradesDate,
  normalizeTradesString,
  normalizeTradesStatusFilter,
  normalizeTradesSideFilter,
} from "@/lib/server/admin-trades-number-utils"
import {
  deriveTradeSide,
  deriveTradeStatus,
  computeAverageEntryPrice,
  computeAverageExitPrice,
  computeHeldMs,
  deriveEntryAt,
  deriveExitAt,
  isRealizedPnLTransaction,
} from "@/lib/server/admin-trades-derivation"

const EXPORT_LIMIT = 5000

type NumericLike = number | string | { toString(): string } | null

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

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function msToDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s"
  const secs = Math.floor(ms / 1000)
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const COLUMNS = [
  "positionId",
  "userName",
  "clientId",
  "symbol",
  "instrument",
  "segment",
  "exchange",
  "side",
  "status",
  "quantity",
  "averageEntryPrice",
  "averageExitPrice",
  "entryAt",
  "exitAt",
  "heldDuration",
  "grossPnL",
  "charges",
  "realizedPnL",
  "unrealizedPnL",
  "closureReason",
  "closureNote",
  "closedByName",
] as const

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/export",
      required: "admin.positions.read",
      fallbackMessage: "Failed to export trades",
    },
    async () => {
      const url = new URL(req.url)
      const sp = url.searchParams
      const from = normalizeTradesDate(sp.get("from"))
      const to = normalizeTradesDate(sp.get("to"))
      const symbol = normalizeTradesString(sp.get("symbol"))
      const userId = normalizeTradesString(sp.get("userId"))
      const clientId = normalizeTradesString(sp.get("clientId"))
      const segment = normalizeTradesString(sp.get("segment"))
      const productType = normalizeTradesString(sp.get("productType"))
      const statusFilter = normalizeTradesStatusFilter(sp.get("status"))
      const sideFilter = normalizeTradesSideFilter(sp.get("side"))

      const where: Prisma.PositionWhereInput = {}
      if (from || to) {
        where.createdAt = {}
        if (from) (where.createdAt as Prisma.DateTimeFilter).gte = from
        if (to) (where.createdAt as Prisma.DateTimeFilter).lte = to
      }
      if (symbol) where.symbol = { contains: symbol, mode: "insensitive" }
      if (segment) where.segment = { equals: segment, mode: "insensitive" }
      if (productType) where.productType = productType
      if (userId || clientId) {
        where.tradingAccount = {
          user: {
            ...(userId ? { id: userId } : {}),
            ...(clientId ? { clientId } : {}),
          },
        }
      }
      if (statusFilter === "open") {
        where.closedAt = null
        where.quantity = { not: 0 }
      } else if (statusFilter === "closed") {
        where.closedAt = { not: null }
        where.quantity = 0
      }

      const positions = await adminPrisma.position.findMany({
        where,
        take: EXPORT_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          symbol: true,
          quantity: true,
          averagePrice: true,
          unrealizedPnL: true,
          createdAt: true,
          closedAt: true,
          segment: true,
          exchange: true,
          productType: true,
          strikePrice: true,
          optionType: true,
          expiry: true,
          closureReason: true,
          closureNote: true,
          closedBy: { select: { id: true, name: true } },
          tradingAccount: {
            select: { user: { select: { id: true, name: true, clientId: true } } },
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
              id: true,
              orderPurpose: true,
              orderSide: true,
              orderType: true,
              status: true,
              quantity: true,
              filledQuantity: true,
              price: true,
              averagePrice: true,
              placementCharges: true,
              createdAt: true,
              executedAt: true,
            },
          },
          transactions: {
            select: { id: true, type: true, amount: true, description: true, positionId: true },
          },
        },
      })

      const rows: string[] = []
      rows.push(COLUMNS.map(csvCell).join(","))

      for (const p of positions) {
        const orders = p.orders
        const side = deriveTradeSide(orders, p.quantity)
        const statusDerived = deriveTradeStatus(p, orders)
        if (sideFilter !== "ALL" && sideFilter !== side) continue
        if (statusFilter === "partial" && statusDerived !== "PARTIAL") continue

        const entryOrders = orders.filter((o) => o.orderPurpose === "OPEN")
        const exitOrders = orders.filter((o) => o.orderPurpose === "CLOSE")

        const toDerivation = (o: (typeof orders)[number]) => ({
          id: o.id,
          orderSide: o.orderSide as string,
          orderPurpose: o.orderPurpose as string | null,
          status: o.status as string,
          quantity: o.quantity,
          filledQuantity: o.filledQuantity,
          price: (o.price as unknown as NumericLike) ?? null,
          averagePrice: (o.averagePrice as unknown as NumericLike) ?? null,
          executedAt: o.executedAt ?? null,
          createdAt: o.createdAt,
        })
        const entryOrdersDerivation = entryOrders.map(toDerivation)
        const exitOrdersDerivation = exitOrders.map(toDerivation)

        const avgEntry = computeAverageEntryPrice(entryOrdersDerivation, (p.averagePrice as unknown) ?? null)
        const avgExit = computeAverageExitPrice(exitOrdersDerivation)
        const entryAt = deriveEntryAt(entryOrdersDerivation, p.createdAt)
        const exitAt = deriveExitAt(exitOrdersDerivation, p.closedAt)
        const heldMs = computeHeldMs(entryAt, exitAt)

        let realized = 0
        for (const t of p.transactions) {
          if (isRealizedPnLTransaction({ positionId: p.id, description: t.description })) {
            const amt = toNumber(t.amount)
            realized += t.type === "CREDIT" ? amt : -amt
          }
        }
        const charges = orders.reduce((s, o) => s + toNumber(o.placementCharges), 0)

        const totalQuantity = (() => {
          const entryFilled = entryOrders
            .filter((o) => o.status === "EXECUTED")
            .reduce((s, o) => s + (o.filledQuantity ?? o.quantity), 0)
          return entryFilled > 0 ? entryFilled : Math.abs(p.quantity)
        })()

        const instrumentLabel = formatInstrumentSummary({
          symbol: p.symbol,
          exchange: p.Stock?.exchange ?? p.exchange ?? null,
          segment: p.Stock?.segment ?? p.segment ?? null,
          name: p.Stock?.name ?? null,
          strikePrice: p.Stock?.strikePrice ?? p.strikePrice ?? null,
          optionType: p.Stock?.optionType ?? p.optionType ?? null,
          expiry: p.Stock?.expiry ?? p.expiry ?? null,
          lotSize: p.Stock?.lot_size ?? null,
        })

        const row = [
          p.id,
          p.tradingAccount?.user?.name ?? "",
          p.tradingAccount?.user?.clientId ?? "",
          p.symbol,
          instrumentLabel,
          p.Stock?.segment ?? p.segment ?? "",
          p.Stock?.exchange ?? p.exchange ?? "",
          side,
          statusDerived,
          totalQuantity,
          avgEntry.toFixed(2),
          avgExit !== null ? avgExit.toFixed(2) : "",
          entryAt,
          exitAt ?? "",
          msToDuration(heldMs),
          (realized + charges).toFixed(2),
          charges.toFixed(2),
          realized.toFixed(2),
          toNumber(p.unrealizedPnL).toFixed(2),
          p.closureReason ?? "",
          p.closureNote ?? "",
          p.closedBy?.name ?? "",
        ]
        rows.push(row.map(csvCell).join(","))
      }

      const csv = rows.join("\n") + "\n"
      const filename = `trades-${new Date().toISOString().slice(0, 10)}.csv`
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    },
  )
}
