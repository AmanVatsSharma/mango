/**
 * @file app/api/admin/bonuses/rules/route.ts
 * @module api/admin/bonuses
 * @description GET (list) + POST (create) bonus rules.
 *              GET requires admin.bonus.read; POST requires admin.bonus.manage.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import type { BonusKind } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  createRule,
  listRules,
  validateRuleInput,
} from "@/lib/bonus/rules-service"
import { BONUS_KIND_META, type BonusRuleInput } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/bonuses/rules", required: "admin.bonus.read" },
    async () => {
      const url = new URL(req.url)
      const activeOnly = url.searchParams.get("activeOnly") === "true"
      const kindParam = url.searchParams.get("kind")
      const kind =
        kindParam && BONUS_KIND_META[kindParam as BonusKind]
          ? (kindParam as BonusKind)
          : undefined
      const rows = await listRules({ activeOnly, kind, withCounts: true })
      return NextResponse.json({ success: true, rows })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/bonuses/rules", required: "admin.bonus.manage" },
    async (ctx) => {
      const body = (await req.json()) as Partial<BonusRuleInput>
      const validation = validateRuleInput(body)
      if ("error" in validation) {
        return NextResponse.json(
          { success: false, message: validation.error },
          { status: 400 },
        )
      }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      const row = await createRule(validation.input, performedById)
      return NextResponse.json({ success: true, row })
    },
  )
}
