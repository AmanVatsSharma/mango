/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades — trade blotter list endpoint (one row per position, open/closed/partial).
 *              Open rows in the page slice receive a live-price overlay (`ltp` + recomputed
 *              `unrealizedPnL`) via the same Redis market-quote → worker-snapshot → Stock.ltp
 *              ladder used by /api/admin/positions, so the trades center reflects live ticks
 *              between worker-driven DB writes.
 * @author StockTrade
 * @created 2026-04-15
 * @updated 2026-05-09 — Trading-3u3: live-price overlay on open rows (was using stale Stock.ltp/Position.unrealizedPnL columns).
 */

import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"
import { fetchBalanceAfterByTransactionIds } from "@/lib/server/admin-transactions-balance-after"
import { isRedisEnabled } from "@/lib/redis/redis-client"
import { resolveLivePrice } from "@/lib/market-data/live-quote-ladder"
import { resolvePositionRowInstrumentToken } from "@/lib/server/position-instrument-resolution"
import { getMarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import {
  normalizeTradesPage,
  normalizeTradesLimit,
  normalizeTradesSortOrder,
  normalizeTradesDate,
  normalizeTradesPnL,
  normalizeTradesString,
  normalizeTradesStatusFilter,
  normalizeTradesSideFilter,
  istDayRange,
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
  type DerivationOrderLike,
} from "@/lib/server/admin-trades-derivation"
import type {
  TradeRow,
  TradeOrderLite,
  TradeLedgerLite,
  TradeStats,
  TradesListResponse,
  ClosureReason,
} from "@/app/api/admin/trades/types"

const TRADE_POSITION_INCLUDE = {
  tradingAccount: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, clientId: true } },
    },
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
      ltp: true,
      // instrumentId/token feed the live-price ladder (Redis market-quote → worker snapshot).
      instrumentId: true,
      token: true,
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
      blockedMargin: true,
      placementCharges: true,
      createdAt: true,
      executedAt: true,
      failureReason: true,
      closeMetadata: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  transactions: {
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
      orderId: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  closedBy: {
    select: { id: true, name: true },
  },
} satisfies Prisma.PositionInclude

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

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = toNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function coerceClosureReason(raw: string | null): ClosureReason {
  if (!raw) return "UNKNOWN"
  const allowed: ClosureReason[] = [
    "USER_CLOSED",
    "ADMIN_CLOSED",
    "AUTO_LIQUIDATED",
    "EXPIRY_SQUAREOFF",
    "SYSTEM_CLOSED",
    "MANUAL_OTHER",
    "UNKNOWN",
  ]
  return (allowed as string[]).includes(raw) ? (raw as ClosureReason) : "UNKNOWN"
}

/**
 * Row charges = sum of placementCharges across this position's orders.
 * Used for the "Charges" field in the row summary + stats.
 */
function sumOrderCharges(orders: DerivationOrderLike[] | Array<{ placementCharges: unknown }>): number {
  let total = 0
  for (const o of orders) {
    const c = toNumber((o as { placementCharges?: unknown }).placementCharges)
    total += c
  }
  return total
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades",
      required: "admin.positions.read",
      fallbackMessage: "Failed to fetch trades",
    },
    async () => {
      const url = new URL(req.url)
      const sp = url.searchParams

      const page = normalizeTradesPage(sp.get("page"))
      const limit = normalizeTradesLimit(sp.get("limit"))
      const status = normalizeTradesStatusFilter(sp.get("status"))
      const side = normalizeTradesSideFilter(sp.get("side"))
      const userSearch = normalizeTradesString(sp.get("user"))
      const userId = normalizeTradesString(sp.get("userId"))
      const clientId = normalizeTradesString(sp.get("clientId"))
      const symbol = normalizeTradesString(sp.get("symbol"))
      const productType = normalizeTradesString(sp.get("productType"))
      const segment = normalizeTradesString(sp.get("segment"))
      const from = normalizeTradesDate(sp.get("from"))
      const to = normalizeTradesDate(sp.get("to"))
      const minPnl = normalizeTradesPnL(sp.get("minPnl"))
      const maxPnl = normalizeTradesPnL(sp.get("maxPnl"))
      const sortByRaw = normalizeTradesString(sp.get("sortBy")) ?? "createdAt"
      const order = normalizeTradesSortOrder(sp.get("order"))
      const includeStats = sp.get("includeStats") !== "false"

      const where: Prisma.PositionWhereInput = {}

      // Status scope
      if (status === "open") {
        where.closedAt = null
        where.quantity = { not: 0 }
      } else if (status === "closed") {
        where.closedAt = { not: null }
        where.quantity = 0
      } else if (status === "partial") {
        // PARTIAL is derived (open position with at least one executed CLOSE order).
        // We can't filter that in SQL cleanly — we over-fetch then filter post-derivation.
        where.closedAt = null
        where.quantity = { not: 0 }
      }

      if (userId) {
        where.tradingAccount = { userId }
      } else if (clientId) {
        where.tradingAccount = { user: { clientId } }
      } else if (userSearch) {
        where.tradingAccount = {
          user: {
            OR: [
              { name: { contains: userSearch, mode: "insensitive" } },
              { clientId: { contains: userSearch, mode: "insensitive" } },
              { id: userSearch },
            ],
          },
        }
      }

      if (symbol) {
        where.symbol = { contains: symbol, mode: "insensitive" }
      }
      if (productType) {
        where.productType = productType
      }
      if (segment) {
        where.segment = segment
      }

      // Date range — applied against createdAt by default, or closedAt for closed status
      if (from || to) {
        const targetField = status === "closed" ? "closedAt" : "createdAt"
        const range: Prisma.DateTimeFilter = {}
        if (from) range.gte = from
        if (to) range.lte = to
        ;(where as Record<string, unknown>)[targetField] = range
      }

      // Sort: createdAt / closedAt are cheap SQL sorts; realizedPnL/symbol are in-memory after derivation.
      const orderBy: Prisma.PositionOrderByWithRelationInput[] =
        sortByRaw === "closedAt"
          ? [{ closedAt: order }]
          : sortByRaw === "symbol"
            ? [{ symbol: order }]
            : [{ createdAt: order }]

      const rawTotal = await adminPrisma.position.count({ where })
      const rows = await adminPrisma.position.findMany({
        where,
        include: TRADE_POSITION_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      })

      // Build balance-after map for all transactions we'll return.
      const txIds: string[] = []
      for (const r of rows) {
        for (const t of r.transactions) txIds.push(t.id)
      }
      const balanceAfterById =
        txIds.length > 0 ? await fetchBalanceAfterByTransactionIds(txIds) : new Map<string, number>()

      // Live-price overlay for open rows in the page slice.
      // Same ladder as /api/admin/positions: Redis market-quote → worker pnl snapshot → Stock.ltp.
      // Recomputes unrealizedPnL from (currentPrice - averageEntry) * quantity on tier-1, so the
      // trades blotter reflects the live mark between worker-driven Position.unrealizedPnL writes.
      const liveOverlayByPositionId = new Map<
        string,
        { ltp: number | null; unrealizedPnL: number | null }
      >()
      if (isRedisEnabled() && rows.length > 0) {
        try {
          const policies = await getMarketDisplayPositionPricingPolicies()
          const maxAgeMs = policies.redisMarketQuoteMaxAgeMs
          const openRows = rows.filter((r) => r.quantity !== 0 && r.closedAt === null)
          await Promise.all(
            openRows.map(async (r) => {
              const positionRow = r as unknown as {
                token?: unknown
                instrumentId?: string | null
                segment?: string | null
                exchange?: string | null
              }
              const stockRow = r.Stock
                ? {
                    token: r.Stock.token,
                    instrumentId: r.Stock.instrumentId ?? null,
                    segment: r.Stock.segment ?? null,
                    exchange: r.Stock.exchange ?? null,
                  }
                : null
              const instrumentToken = resolvePositionRowInstrumentToken(
                {
                  token: positionRow?.token,
                  instrumentId:
                    typeof positionRow?.instrumentId === "string" ? positionRow.instrumentId : null,
                  segment: typeof positionRow?.segment === "string" ? positionRow.segment : null,
                  exchange: typeof positionRow?.exchange === "string" ? positionRow.exchange : null,
                },
                stockRow,
              )
              const stockLtpRaw = toNullableNumber(r.Stock?.ltp)
              const livePrice = await resolveLivePrice({
                instrumentToken,
                positionId: r.id,
                fallbackLtp: stockLtpRaw,
                maxAgeMs,
              })

              const averageEntry = toNumber(r.averagePrice)
              if (livePrice.source === "market-quote" && livePrice.price > 0) {
                const unrealizedPnL = Number(
                  ((livePrice.price - averageEntry) * r.quantity).toFixed(2),
                )
                liveOverlayByPositionId.set(r.id, {
                  ltp: livePrice.price,
                  unrealizedPnL,
                })
                return
              }
              if (livePrice.source === "position-pnl" && livePrice.workerPnL) {
                liveOverlayByPositionId.set(r.id, {
                  ltp: livePrice.price > 0 ? livePrice.price : stockLtpRaw,
                  unrealizedPnL: livePrice.workerPnL.unrealizedPnL,
                })
                return
              }
              // stock-ltp / unpriced: keep existing behavior (DB ltp + DB unrealizedPnL)
            }),
          )
        } catch {
          // Best-effort overlay only — fall through to DB columns on Redis failure.
        }
      }

      // Derive each TradeRow
      let derived: TradeRow[] = rows.map((r) => {
        const ordersLike: DerivationOrderLike[] = r.orders.map((o) => ({
          id: o.id,
          orderPurpose: o.orderPurpose ?? null,
          orderSide: o.orderSide as "BUY" | "SELL",
          status: o.status,
          quantity: o.quantity,
          filledQuantity: o.filledQuantity,
          price: (o.price as unknown) ?? null,
          averagePrice: (o.averagePrice as unknown) ?? null,
          createdAt: o.createdAt,
          executedAt: o.executedAt,
        }))
        const tradeSide = deriveTradeSide(ordersLike, r.quantity)
        const tradeStatus = deriveTradeStatus(
          { quantity: r.quantity, averagePrice: r.averagePrice, closedAt: r.closedAt, createdAt: r.createdAt },
          ordersLike,
        )
        const entryAt = deriveEntryAt(ordersLike, r.createdAt)
        const exitAt = deriveExitAt(ordersLike, r.closedAt)
        const heldMs = computeHeldMs(entryAt, exitAt)
        const averageEntryPrice = computeAverageEntryPrice(ordersLike, r.averagePrice)
        const averageExitPrice = computeAverageExitPrice(ordersLike)

        // Realized P&L = sum of realized-P&L transactions linked to this position.
        let realizedPnL = 0
        for (const t of r.transactions) {
          if (isRealizedPnLTransaction({ positionId: r.id, description: t.description })) {
            const amt = toNumber(t.amount)
            realizedPnL += t.type === "CREDIT" ? amt : -amt
          }
        }
        const charges = sumOrderCharges(r.orders)
        const grossPnL = realizedPnL + charges

        const openOrders: TradeOrderLite[] = r.orders
          .filter((o) => o.orderPurpose === "OPEN")
          .map((o) => ({
            id: o.id,
            orderPurpose: (o.orderPurpose as "OPEN" | "CLOSE" | null) ?? null,
            orderSide: o.orderSide as "BUY" | "SELL",
            orderType: String(o.orderType),
            status: String(o.status),
            quantity: o.quantity,
            filledQuantity: o.filledQuantity ?? 0,
            price: toNullableNumber(o.price),
            averagePrice: toNullableNumber(o.averagePrice),
            blockedMargin: toNullableNumber(o.blockedMargin),
            placementCharges: toNullableNumber(o.placementCharges),
            createdAt: o.createdAt.toISOString(),
            executedAt: o.executedAt ? o.executedAt.toISOString() : null,
            failureReason: o.failureReason ?? null,
            closeMetadata: (o.closeMetadata as Record<string, unknown> | null) ?? null,
          }))
        const closeOrders: TradeOrderLite[] = r.orders
          .filter((o) => o.orderPurpose === "CLOSE")
          .map((o) => ({
            id: o.id,
            orderPurpose: (o.orderPurpose as "OPEN" | "CLOSE" | null) ?? null,
            orderSide: o.orderSide as "BUY" | "SELL",
            orderType: String(o.orderType),
            status: String(o.status),
            quantity: o.quantity,
            filledQuantity: o.filledQuantity ?? 0,
            price: toNullableNumber(o.price),
            averagePrice: toNullableNumber(o.averagePrice),
            blockedMargin: toNullableNumber(o.blockedMargin),
            placementCharges: toNullableNumber(o.placementCharges),
            createdAt: o.createdAt.toISOString(),
            executedAt: o.executedAt ? o.executedAt.toISOString() : null,
            failureReason: o.failureReason ?? null,
            closeMetadata: (o.closeMetadata as Record<string, unknown> | null) ?? null,
          }))

        const ledger: TradeLedgerLite[] = r.transactions.map((t) => ({
          id: t.id,
          type: t.type as "CREDIT" | "DEBIT",
          amount: toNumber(t.amount),
          description: t.description ?? "",
          createdAt: t.createdAt.toISOString(),
          orderId: t.orderId ?? null,
          balanceAfter: balanceAfterById.has(t.id) ? balanceAfterById.get(t.id)! : null,
        }))

        const instrumentLabel = formatInstrumentSummary({
          symbol: r.symbol,
          exchange: r.Stock?.exchange ?? r.exchange ?? null,
          segment: r.Stock?.segment ?? r.segment ?? null,
          name: r.Stock?.name ?? null,
          strikePrice: r.Stock?.strikePrice ?? r.strikePrice ?? null,
          optionType: r.Stock?.optionType ?? r.optionType ?? null,
          expiry: r.Stock?.expiry ?? r.expiry ?? null,
          lotSize: r.Stock?.lot_size ?? null,
        })

        const openQty = r.quantity
        const entryTotalQty = r.orders
          .filter((o) => o.orderPurpose === "OPEN" && o.status === "EXECUTED")
          .reduce((s, o) => s + (o.filledQuantity ?? o.quantity), 0)
        const totalQuantity = entryTotalQty > 0 ? entryTotalQty : Math.abs(openQty)

        return {
          positionId: r.id,
          userId: r.tradingAccount?.user?.id ?? null,
          userName: r.tradingAccount?.user?.name ?? null,
          clientId: r.tradingAccount?.user?.clientId ?? null,
          symbol: r.symbol,
          instrumentLabel,
          segment: r.Stock?.segment ?? r.segment ?? null,
          exchange: r.Stock?.exchange ?? r.exchange ?? null,
          productType: r.productType ?? null,
          optionType: (r.Stock?.optionType as "CE" | "PE" | null) ?? (r.optionType as "CE" | "PE" | null) ?? null,
          strikePrice: toNullableNumber(r.Stock?.strikePrice ?? r.strikePrice),
          expiry: r.Stock?.expiry
            ? new Date(r.Stock.expiry).toISOString()
            : r.expiry
              ? new Date(r.expiry).toISOString()
              : null,
          side: tradeSide,
          status: tradeStatus,
          openQuantity: openQty,
          totalQuantity,
          lotSize: Math.max(1, Math.trunc(toNumber(r.Stock?.lot_size, 1))),
          averageEntryPrice,
          averageExitPrice,
          ltp: liveOverlayByPositionId.get(r.id)?.ltp ?? toNullableNumber(r.Stock?.ltp),
          entryAt,
          exitAt,
          heldMs,
          grossPnL,
          charges,
          realizedPnL,
          unrealizedPnL:
            liveOverlayByPositionId.get(r.id)?.unrealizedPnL ?? toNumber(r.unrealizedPnL),
          closureReason: coerceClosureReason(
            (r as unknown as { closureReason: string | null }).closureReason,
          ),
          closureNote: (r as unknown as { closureNote: string | null }).closureNote ?? null,
          closedByUserId: (r as unknown as { closedByUserId: string | null }).closedByUserId ?? null,
          closedByName:
            (r as unknown as { closedBy: { name: string | null } | null }).closedBy?.name ?? null,
          ordersCount: r.orders.length,
          openOrders,
          closeOrders,
          ledger,
        } satisfies TradeRow
      })

      // Post-derivation filters
      if (side !== "ALL") {
        derived = derived.filter((d) => d.side === side)
      }
      if (status === "partial") {
        derived = derived.filter((d) => d.status === "PARTIAL")
      }
      if (minPnl !== null) {
        derived = derived.filter((d) => d.realizedPnL >= minPnl)
      }
      if (maxPnl !== null) {
        derived = derived.filter((d) => d.realizedPnL <= maxPnl)
      }
      if (sortByRaw === "realizedPnL") {
        derived.sort((a, b) => (order === "asc" ? a.realizedPnL - b.realizedPnL : b.realizedPnL - a.realizedPnL))
      }

      // Stats — global today-scoped metrics for the hero cards
      let stats: TradeStats | null = null
      if (includeStats) {
        const { startUtc: istStart, endUtc: istEnd } = istDayRange()

        const [openCountAgg, openPnLAgg, todayRealizedRows, todayOrdersAgg] = await Promise.all([
          adminPrisma.position.count({ where: { quantity: { not: 0 }, closedAt: null } }),
          adminPrisma.position.aggregate({
            _sum: { unrealizedPnL: true },
            where: { quantity: { not: 0 }, closedAt: null },
          }),
          adminPrisma.transaction.findMany({
            where: {
              createdAt: { gte: istStart, lt: istEnd },
              positionId: { not: null },
              OR: [
                { description: { startsWith: "Profit from" } },
                { description: { startsWith: "Loss from" } },
                { description: { startsWith: "Realized P&L" } },
                { description: { startsWith: "Position closed" } },
                { description: { startsWith: "Position partially closed" } },
              ],
            },
            select: { type: true, amount: true, positionId: true },
          }),
          // Day-scoped totals for Volume and Charges (not page-scoped)
          adminPrisma.order.aggregate({
            _sum: { placementCharges: true },
            where: {
              createdAt: { gte: istStart, lt: istEnd },
              status: "EXECUTED",
              orderPurpose: "OPEN",
            },
          }),
        ])

        let todayNetPnL = 0
        const winsSet = new Set<string>()
        const lossesSet = new Set<string>()
        const posPnlMap = new Map<string, number>()
        for (const t of todayRealizedRows) {
          const amt = toNumber(t.amount)
          const signed = t.type === "CREDIT" ? amt : -amt
          todayNetPnL += signed
          if (t.positionId) {
            posPnlMap.set(t.positionId, (posPnlMap.get(t.positionId) ?? 0) + signed)
          }
        }
        Array.from(posPnlMap.entries()).forEach(([pid, pnl]) => {
          if (pnl > 0) winsSet.add(pid)
          else if (pnl < 0) lossesSet.add(pid)
        })
        const winsToday = winsSet.size
        const lossesToday = lossesSet.size
        const closedToday = posPnlMap.size
        const winRatePct = closedToday > 0 ? (winsToday / closedToday) * 100 : 0

        // Volume = sum of today's executed OPEN orders (averagePrice × filledQty)
        // Charges = sum of placementCharges on today's OPEN orders — day-scoped, not page-scoped
        const todayChargesTotal = toNumber(todayOrdersAgg._sum.placementCharges)

        const filteredTotalRealizedPnL = derived.reduce((s, d) => s + d.realizedPnL, 0)
        const filteredWins = derived.filter((d) => d.realizedPnL > 0).length
        const filteredLosses = derived.filter((d) => d.realizedPnL < 0).length

        // Volume notional from today's realized positions (day-scoped via posPnlMap keys)
        // We use the page's derived rows for filtered context but fall back to the day-global set
        const totalVolumeNotional = derived.reduce(
          (s, d) => s + d.averageEntryPrice * d.totalQuantity,
          0,
        )

        stats = {
          todayNetPnL,
          todayCharges: todayChargesTotal,
          closedToday,
          winsToday,
          lossesToday,
          winRatePct,
          openPositionsCount: openCountAgg,
          openUnrealizedPnL: toNumber(openPnLAgg._sum.unrealizedPnL),
          totalVolumeNotional,
          filteredTotalRealizedPnL,
          filteredWins,
          filteredLosses,
        }
      }

      const total = rawTotal
      const pages = Math.max(1, Math.ceil(total / limit))

      const response: TradesListResponse = {
        trades: derived,
        total,
        page,
        pages,
        stats,
      }
      return NextResponse.json(response, { status: 200 })
    },
  )
}
