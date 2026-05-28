/**
 * @file app/api/admin/bonuses/grants/by-user/[userId]/route.ts
 * @module api/admin/bonuses
 * @description GET — all grants for a single client. Used by Client 360 → Bonus tab.
 *              Includes the user's TradingAccount.creditBalance for the ledger header.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { listGrantsForUser } from "@/lib/bonus/grants-service"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  const { userId } = await params
  return handleAdminApi(
    req,
    { route: "GET /api/admin/bonuses/grants/by-user/[userId]", required: "admin.bonus.read" },
    async () => {
      const [grants, account] = await Promise.all([
        listGrantsForUser(userId),
        adminPrisma.tradingAccount.findUnique({
          where: { userId },
          select: { creditBalance: true, balance: true },
        }),
      ])
      return NextResponse.json({
        success: true,
        grants,
        creditBalance: account?.creditBalance ?? 0,
        balance: account?.balance ?? 0,
      })
    },
  )
}
