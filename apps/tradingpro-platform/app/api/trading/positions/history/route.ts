/**
 * File:        app/api/trading/positions/history/route.ts
 * Module:      api/trading/positions/history
 * Purpose:     Returns today's closed positions for the authenticated user,
 *              enriched with derived exit price, duration held, realized P&L,
 *              and running-balance-after — matching the admin Trades Command Centre view.
 *
 * Exports:
 *   - GET(req) → { history: PositionHistoryRow[] }
 *   - PositionHistoryRow — per-closed-position shape consumed by the terminal History tab
 *
 * Depends on:
 *   - @/lib/server/admin-trades-derivation — pure derivation fns (exit price, held ms, side)
 *   - @/lib/server/admin-transactions-balance-after — PostgreSQL window-sum for balanceAfter
 *   - @/lib/server/admin-trades-number-utils — istDayRange (IST day boundaries)
 *   - @/lib/server/trading-access — requireAuthenticatedUserId, resolveTradingErrorResponse
 *
 * Side-effects:
 *   - DB read: positions + orders + transactions for the authenticated user's trading account
 *
 * Key invariants:
 *   - Only today's closed positions (IST day range, quantity = 0, closedAt within range)
 *   - averageExitPrice is VWAP of close-purpose executed orders; null when no close orders filled
 *   - balanceAfter = running ledger balance after the last realized-P&L transaction on this position
 *   - All derivation logic is shared with the admin blotter — no duplication
 *
 * Read order:
 *   1. PositionHistoryRow — response shape
 *   2. HISTORY_POSITION_INCLUDE — Prisma include for orders + transactions
 *   3. GET — handler
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-23
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import {
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"
import { istDayRange } from "@/lib/server/admin-trades-number-utils"
import { fetchBalanceAfterByTransactionIds } from "@/lib/server/admin-transactions-balance-after"
import {
  deriveEntryAt,
  deriveExitAt,
  computeHeldMs,
  computeAverageEntryPrice,
  computeAverageExitPrice,
  deriveTradeSide,
  isRealizedPnLTransaction,
  type DerivationOrderLike,
} from "@/lib/server/admin-trades-derivation"
import type { Prisma } from "@prisma/client"

export interface PositionHistoryRow {
  positionId: string
  symbol: string
  productType: string | null
  side: "LONG" | "SHORT"
  totalQuantity: number
  averageEntryPrice: number
  averageExitPrice: number | null
  entryAt: string
  exitAt: string | null
  heldMs: number
  realizedPnL: number
  balanceAfter: number | null
}

const HISTORY_POSITION_INCLUDE = {
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
      createdAt: true,
      executedAt: true,
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
} satisfies Prisma.PositionInclude

function toNum(value: unknown, fallback = 0): number {
  const n = parseFiniteTradingNumber(value)
  return n !== null ? n : fallback
}

export async function GET() {
  try {
    const authenticatedUserId = await requireAuthenticatedUserId()

    const tradingAccount = await prisma.tradingAccount.findUnique({
      where: { userId: authenticatedUserId },
      select: { id: true },
    })
    if (!tradingAccount) {
      return NextResponse.json({ history: [] })
    }

    const { startUtc, endUtc } = istDayRange()
    const rows = await prisma.position.findMany({
      where: {
        tradingAccountId: tradingAccount.id,
        quantity: 0,
        closedAt: { gte: startUtc, lt: endUtc },
      },
      include: HISTORY_POSITION_INCLUDE,
      orderBy: { closedAt: "desc" },
    })

    // Collect all transaction IDs for a single batch balance-after lookup.
    const allTxIds: string[] = []
    for (const r of rows) {
      for (const t of r.transactions) allTxIds.push(t.id)
    }
    const balanceAfterById =
      allTxIds.length > 0
        ? await fetchBalanceAfterByTransactionIds(allTxIds)
        : new Map<string, number>()

    const history: PositionHistoryRow[] = rows.map((r) => {
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

      const entryAt = deriveEntryAt(ordersLike, r.createdAt)
      const exitAt = deriveExitAt(ordersLike, r.closedAt)
      const heldMs = computeHeldMs(entryAt, exitAt)
      const averageEntryPrice = computeAverageEntryPrice(ordersLike, r.averagePrice)
      const averageExitPrice = computeAverageExitPrice(ordersLike)
      const side = deriveTradeSide(ordersLike, r.quantity)

      // Sum realized-P&L transactions (same as admin blotter).
      let realizedPnL = 0
      let lastPnlTxId: string | null = null
      for (const t of r.transactions) {
        if (isRealizedPnLTransaction({ positionId: r.id, description: t.description })) {
          const amt = toNum(t.amount)
          realizedPnL += t.type === "CREDIT" ? amt : -amt
          lastPnlTxId = t.id
        }
      }

      const balanceAfter =
        lastPnlTxId !== null && balanceAfterById.has(lastPnlTxId)
          ? balanceAfterById.get(lastPnlTxId)!
          : null

      return {
        positionId: r.id,
        symbol: r.symbol,
        productType: r.productType ?? null,
        side,
        totalQuantity: Math.abs(toNum(r.quantity)),
        averageEntryPrice,
        averageExitPrice,
        entryAt,
        exitAt,
        heldMs,
        realizedPnL,
        balanceAfter,
      }
    })

    return NextResponse.json({ history })
  } catch (error) {
    const { message, status } = resolveTradingErrorResponse(error, "Failed to fetch position history", 500)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
