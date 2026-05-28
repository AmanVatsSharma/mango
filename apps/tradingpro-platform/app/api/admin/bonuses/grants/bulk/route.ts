/**
 * @file app/api/admin/bonuses/grants/bulk/route.ts
 * @module api/admin/bonuses
 * @description POST — campaign-style bulk grant issuance. Cap 500 user ids per request.
 *              Best-effort: per-row try/catch returns aggregate {attempted, granted, failed[]}.
 *              Permission: admin.bonus.bulk.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { bulkIssue } from "@/lib/bonus/grants-service"
import type { BulkIssueInput } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/bonuses/grants/bulk", required: "admin.bonus.bulk" },
    async (ctx) => {
      const body = (await req.json()) as Partial<BulkIssueInput>
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      if (!body.ruleId || typeof body.amount !== "number" || body.amount <= 0) {
        return NextResponse.json(
          { success: false, message: "ruleId and a positive amount are required" },
          { status: 400 },
        )
      }
      if (!body.userIds || !Array.isArray(body.userIds) || body.userIds.length === 0) {
        return NextResponse.json(
          { success: false, message: "userIds[] is required (non-empty)" },
          { status: 400 },
        )
      }
      const result = await bulkIssue(
        {
          ruleId: body.ruleId,
          amount: body.amount,
          userIds: body.userIds,
          source: body.source,
        },
        performedById,
      )
      return NextResponse.json(result)
    },
  )
}
