/**
 * @file route.ts
 * @module admin-console
 * @description API endpoint to get list of users for admin notification targeting
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 *
 * Notes:
 * - Each user includes isTradingDashboardOnline when trading SSE session is active.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"
import { enrichUsersWithTradingPresence } from "@/lib/server/admin-trading-presence"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users/list",
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch users",
    },
    async ({ logger }) => {
      const { searchParams } = new URL(req.url)
      const search = searchParams.get("search") || ""
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 50, 200)

      logger.debug({ search, limit }, "GET /api/admin/users/list - request")

      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { clientId: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
          role: "USER", // Only regular users, not admins
        },
        select: {
          id: true,
          name: true,
          email: true,
          clientId: true,
          phone: true,
          image: true,
        },
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      })

      const enriched = await enrichUsersWithTradingPresence(users)

      logger.info({ count: enriched.length }, "GET /api/admin/users/list - success")
      return NextResponse.json({ users: enriched }, { status: 200 })
    }
  )
}
