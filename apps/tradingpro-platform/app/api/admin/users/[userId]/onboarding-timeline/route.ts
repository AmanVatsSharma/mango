/**
 * @file route.ts
 * @module admin-console
 * @description Read-only onboarding timeline (auth events + KYC review logs) for admin CRM.
 * @author StockTrade
 * @created 2026-04-06
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"

export async function GET(
  req: Request,
  { params }: { params: { userId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/onboarding-timeline`,
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch onboarding timeline",
    },
    async (ctx) => {
      const userId = params.userId
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 80, 200)

      ctx.logger.debug({ userId, limit }, "GET /api/admin/users/[userId]/onboarding-timeline - request")

      const adminService = createAdminUserService()
      const events = await adminService.getUserOnboardingTimeline(userId, limit)

      ctx.logger.info({ userId, count: events.length }, "GET onboarding-timeline - success")
      return NextResponse.json({ success: true, events }, { status: 200 })
    },
  )
}
