/**
 * @file app/api/admin/winners/[userId]/reset/route.ts
 * @module api/admin/winners
 * @description POST — reset a client's winner control to baseline (rung NONE,
 *              clear all overrides, un-pin). Audit-logged with required reason.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { resetControl } from "@/lib/winners/control-service"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await params
  return handleAdminApi(
    req,
    { route: "POST /api/admin/winners/[userId]/reset", required: "admin.house.winner" },
    async (ctx) => {
      const body = (await req.json().catch(() => ({}))) as { reason?: string }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }

      const reason =
        typeof body.reason === "string" && body.reason.trim().length > 0
          ? body.reason.trim()
          : undefined

      const control = await resetControl(userId, { performedById, reason })
      return NextResponse.json({ success: true, control })
    },
  )
}
