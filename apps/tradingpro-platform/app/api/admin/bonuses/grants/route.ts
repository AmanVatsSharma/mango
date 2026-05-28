/**
 * @file app/api/admin/bonuses/grants/route.ts
 * @module api/admin/bonuses
 * @description GET (list with filters) + POST (single manual issue) bonus grants.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import type { BonusGrantStatus } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { issueGrant, listGrants } from "@/lib/bonus/grants-service"
import { GRANT_STATUS_META } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

function parseInt0(input: string | null, fallback: number): number {
  if (!input) return fallback
  const n = Number.parseInt(input, 10)
  return Number.isFinite(n) ? n : fallback
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/bonuses/grants", required: "admin.bonus.read" },
    async () => {
      const url = new URL(req.url)
      const statusParam = url.searchParams.get("status")
      const status =
        statusParam && GRANT_STATUS_META[statusParam as BonusGrantStatus]
          ? (statusParam as BonusGrantStatus)
          : undefined
      const userId = url.searchParams.get("userId") || undefined
      const ruleId = url.searchParams.get("ruleId") || undefined
      const limit = parseInt0(url.searchParams.get("limit"), 50)
      const offset = parseInt0(url.searchParams.get("offset"), 0)
      const data = await listGrants({ status, userId, ruleId, limit, offset })
      return NextResponse.json({ success: true, ...data })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/bonuses/grants", required: "admin.bonus.manage" },
    async (ctx) => {
      const body = (await req.json()) as {
        userId?: string
        ruleId?: string
        amount?: number
        source?: string
      }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      if (!body.userId || !body.ruleId || typeof body.amount !== "number") {
        return NextResponse.json(
          { success: false, message: "userId, ruleId, and amount are required" },
          { status: 400 },
        )
      }
      try {
        const row = await issueGrant(
          {
            userId: body.userId,
            ruleId: body.ruleId,
            amount: body.amount,
            source: body.source,
          },
          performedById,
        )
        return NextResponse.json({ success: true, row })
      } catch (e) {
        return NextResponse.json(
          { success: false, message: e instanceof Error ? e.message : "Issue failed" },
          { status: 400 },
        )
      }
    },
  )
}
