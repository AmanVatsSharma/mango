/**
 * @file route.ts
 * @module admin-console
 * @description API route for platform statistics
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/stats",
      required: "admin.stats.read",
      fallbackMessage: "Failed to fetch statistics",
    },
    async (ctx) => {
      ctx.logger.debug({}, "GET /api/admin/stats - start")
      const adminService = createAdminUserService()
      const stats = await adminService.getPlatformStats()
      ctx.logger.info({}, "GET /api/admin/stats - success")
      return NextResponse.json({ success: true, stats }, { status: 200 })
    }
  )
}