/**
 * @file app/api/admin/bonuses/grants/[id]/clawback/route.ts
 * @module api/admin/bonuses
 * @description POST — admin reverses a bonus grant. Required reason; permission admin.bonus.manage.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { clawbackGrant } from "@/lib/bonus/grants-service"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "POST /api/admin/bonuses/grants/[id]/clawback", required: "admin.bonus.manage" },
    async (ctx) => {
      const body = (await req.json().catch(() => ({}))) as { reason?: string }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      if (!body.reason || body.reason.trim().length === 0) {
        return NextResponse.json(
          { success: false, message: "reason is required for clawback" },
          { status: 400 },
        )
      }
      try {
        const row = await clawbackGrant(id, body.reason.trim(), performedById)
        return NextResponse.json({ success: true, row })
      } catch (e) {
        return NextResponse.json(
          { success: false, message: e instanceof Error ? e.message : "Clawback failed" },
          { status: 400 },
        )
      }
    },
  )
}
