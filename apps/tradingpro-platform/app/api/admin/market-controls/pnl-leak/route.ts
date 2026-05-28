/**
 * @file route.ts
 * @module api/admin/market-controls/pnl-leak
 * @description House-vs-customer P&L KPI endpoint for the Market Control panel. Aggregates
 *              realised P&L transactions (description prefix `Realized P&L credit/debit:`)
 *              over a configurable window and returns the four headline numbers:
 *              houseNet / customerNet / effectiveSpreadPct / tradeCount.
 *
 *              This is the only read that proves the Market Control rules are actually working —
 *              if house P&L is negative or at zero, there is a leak.
 * @author StockTrade
 * @created 2026-04-16
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"

const ROUTE = "/api/admin/market-controls/pnl-leak"

function windowToMs(window: string): number {
  switch (window) {
    case "24h":
      return 24 * 60 * 60 * 1000
    case "7d":
      return 7 * 24 * 60 * 60 * 1000
    case "30d":
      return 30 * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.settings.manage", fallbackMessage: "Failed to load P&L leak KPIs" },
    async () => {
      const { searchParams } = new URL(req.url)
      const window = searchParams.get("window") ?? "24h"
      const since = new Date(Date.now() - windowToMs(window))

      const txns = await adminPrisma.transaction.findMany({
        where: {
          createdAt: { gte: since },
          description: { startsWith: "Realized P&L " },
        },
        select: { amount: true, type: true, description: true },
      })

      let customerNet = 0
      let tradeCount = 0
      for (const t of txns) {
        const amt = Number(t.amount)
        if (!Number.isFinite(amt)) continue
        if (t.type === "CREDIT") customerNet += amt
        else if (t.type === "DEBIT") customerNet -= amt
        tradeCount += 1
      }
      const houseNet = -customerNet

      // Effective spread — computed from executionContext snapshots on completed orders.
      const orders = await adminPrisma.order.findMany({
        where: {
          createdAt: { gte: since },
          status: "EXECUTED",
        },
        select: { executionContext: true, price: true, quantity: true },
        take: 5_000,
      })
      let notional = 0
      let spreadWeighted = 0
      for (const o of orders) {
        const ctx = (o.executionContext ?? null) as unknown as { spreadPct?: number } | null
        const spread = Number(ctx?.spreadPct ?? 0)
        const px = Number(o.price ?? 0)
        const qty = Number(o.quantity ?? 0)
        const value = px * qty
        if (value > 0 && Number.isFinite(spread)) {
          notional += value
          spreadWeighted += spread * value
        }
      }
      const effectiveSpreadPct = notional > 0 ? spreadWeighted / notional : 0

      return NextResponse.json({
        success: true,
        data: {
          window,
          since: since.toISOString(),
          houseNet,
          customerNet,
          effectiveSpreadPct,
          tradeCount,
        },
      })
    },
  )
}
