import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/activity",
      required: "admin.activity.read",
      fallbackMessage: "Failed to fetch activity",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 50, 500)

      ctx.logger.debug({ limit }, "GET /api/admin/activity - request")

      const adminService = createAdminUserService()
      const activities = await adminService.getRecentActivity(limit)

      ctx.logger.info({ count: activities.length }, "GET /api/admin/activity - success")
      return NextResponse.json({ success: true, activities }, { status: 200 })
    }
  )
}