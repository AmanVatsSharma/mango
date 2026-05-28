/**
 * @file route.ts
 * @module admin-console
 * @description API route for trading chart data
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { normalizeAdminListDaysParam } from "@/lib/server/admin-list-query-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/charts/trading",
      required: "admin.charts.read",
      fallbackMessage: "Failed to fetch trading chart data",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const days = normalizeAdminListDaysParam(searchParams.get("days"), 7, 365)

      ctx.logger.debug({ days }, "GET /api/admin/charts/trading - request")

      const adminService = createAdminUserService()
      const chartData = await adminService.getTradingChartData(days)

      ctx.logger.info({ points: chartData.length }, "GET /api/admin/charts/trading - success")
      return NextResponse.json({ success: true, chartData }, { status: 200 })
    }
  )
}
