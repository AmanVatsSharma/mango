/**
 * File:        app/api/trading/transactions/route.ts
 * Module:      api/trading/transactions
 * Purpose:     Returns recent transactions for the authenticated user's trading account.
 *              Used by the Account tab mini-statement card. Feature-flagged by
 *              console_statements_enabled (global + per-user override).
 *
 * Exports:
 *   - GET → { transactions: TransactionRow[] }
 *   - TransactionRow — per-transaction shape for the statement card
 *
 * Depends on:
 *   - @/lib/server/trading-access — requireAuthenticatedUserId, resolveTradingErrorResponse
 *   - @/lib/server/console-statements — getEffectiveStatementsEnabledForUser
 *   - @/lib/prisma — Prisma client
 *
 * Side-effects:
 *   - DB read: up to 100 most recent transactions for the user's trading account
 *
 * Key invariants:
 *   - Returns 403 when statements are disabled (mirrors the export route gate)
 *   - Amount is serialised as a plain number (Decimal → Number)
 *
 * Read order:
 *   1. TransactionRow — response shape
 *   2. GET — handler
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09 (fix: wrap catch in NextResponse.json + force-dynamic)
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"
import { getEffectiveStatementsEnabledForUser } from "@/lib/server/console-statements"

export interface TransactionRow {
  id: string
  amount: number
  type: string
  description: string | null
  createdAt: string
}

export async function GET() {
  try {
    const authenticatedUserId = await requireAuthenticatedUserId()

    const resolution = await getEffectiveStatementsEnabledForUser(authenticatedUserId)
    if (!resolution.enabled) {
      return NextResponse.json(
        { success: false, error: "Statements are disabled for this account" },
        { status: 403 },
      )
    }

    const tradingAccount = await prisma.tradingAccount.findUnique({
      where: { userId: authenticatedUserId },
      select: { id: true },
    })

    if (!tradingAccount) {
      return NextResponse.json({ transactions: [] })
    }

    const rows = await prisma.transaction.findMany({
      where: { tradingAccountId: tradingAccount.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        createdAt: true,
      },
    })

    const transactions: TransactionRow[] = rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      type: r.type,
      description: r.description ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ transactions })
  } catch (err) {
    const { message, status } = resolveTradingErrorResponse(err)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
