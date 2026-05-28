/**
 * @file route.ts
 * @module admin-console
 * @description API route for top traders data
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 *
 * Notes:
 * - Traders include isTradingDashboardOnline for admin live presence.
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"
import { enrichUsersWithTradingPresence } from "@/lib/server/admin-trading-presence"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/top-traders",
      required: "admin.top-traders.read",
      fallbackMessage: "Failed to fetch top traders",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 10, 100)

      ctx.logger.debug({ limit }, "GET /api/admin/top-traders - request")

      const adminService = createAdminUserService()
      const traders = await adminService.getTopTraders(limit)
      const enriched = await enrichUsersWithTradingPresence(traders)

      ctx.logger.info({ count: enriched.length }, "GET /api/admin/top-traders - success")
      return NextResponse.json({ success: true, traders: enriched }, { status: 200 })
    }
  )
}
