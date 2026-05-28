/**
 * @file route.ts
 * @module admin-console
 * @description API route for fetching user activity logs
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/activity`,
      required: "admin.activity.read",
      fallbackMessage: "Failed to fetch user activity",
    },
    async (ctx) => {
      const userId = params.userId
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 100, 500)

      ctx.logger.debug({ userId, limit }, "GET /api/admin/users/[userId]/activity - request")

      const adminService = createAdminUserService()
      const activities = await adminService.getUserActivity(userId, limit)

      ctx.logger.info({ userId, count: activities.length }, "GET /api/admin/users/[userId]/activity - success")
      return NextResponse.json({ success: true, activities }, { status: 200 })
    }
  )
}
