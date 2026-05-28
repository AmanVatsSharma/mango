/**
 * @file route.ts
 * @module admin-console
 * @description API route for system alerts
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/alerts",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch alerts",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 10, 100)

      ctx.logger.debug({ limit }, "GET /api/admin/alerts - request")

      const adminService = createAdminUserService()
      const alerts = await adminService.getSystemAlerts(limit)

      ctx.logger.info({ count: alerts.length }, "GET /api/admin/alerts - success")
      return NextResponse.json({ success: true, alerts }, { status: 200 })
    }
  )
}
