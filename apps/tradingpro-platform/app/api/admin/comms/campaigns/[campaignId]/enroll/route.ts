/**
 * @file app/api/admin/comms/campaigns/[campaignId]/enroll/route.ts
 * @module api/admin/comms
 * @description Enroll a list of userIds into a campaign. Idempotent at the DB level via
 *              @@unique([userId, campaignId]) — duplicates are silently skipped.
 *
 *              Capped at 1000 userIds per call to keep payloads sane; bulk audience
 *              targeting will land in Phase 12.5 with a server-side audience-resolver.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { enrollUsers } from "@/lib/comms/campaign-service"

export const dynamic = "force-dynamic"

interface RouteCtx {
  params: Promise<{ campaignId: string }>
}

interface Body {
  userIds?: string[]
}

const MAX_USERS_PER_CALL = 1000

export async function POST(req: Request, ctx: RouteCtx) {
  const { campaignId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `POST /api/admin/comms/campaigns/${campaignId}/enroll`,
      required: "admin.comms.bulk",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as Body | null
      const userIds = Array.isArray(body?.userIds) ? body!.userIds : []
      if (userIds.length === 0) {
        return NextResponse.json(
          { success: false, message: "userIds is required" },
          { status: 400 },
        )
      }
      if (userIds.length > MAX_USERS_PER_CALL) {
        return NextResponse.json(
          {
            success: false,
            message: `userIds capped at ${MAX_USERS_PER_CALL} per call`,
          },
          { status: 400 },
        )
      }
      try {
        const result = await enrollUsers(campaignId, userIds)
        return NextResponse.json({ success: true, ...result })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "enroll failed",
          },
          { status: 422 },
        )
      }
    },
  )
}
