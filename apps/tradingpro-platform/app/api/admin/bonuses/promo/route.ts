/**
 * @file app/api/admin/bonuses/promo/route.ts
 * @module api/admin/bonuses
 * @description GET (list) + POST (create) promo codes.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  createPromoCode,
  listPromoCodes,
  PromoValidationError,
} from "@/lib/bonus/promo-service"
import type { PromoCodeInput } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/bonuses/promo", required: "admin.bonus.read" },
    async () => {
      const url = new URL(req.url)
      const activeOnly = url.searchParams.get("activeOnly") === "true"
      const rows = await listPromoCodes({ activeOnly })
      return NextResponse.json({ success: true, rows })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/bonuses/promo", required: "admin.bonus.manage" },
    async (ctx) => {
      const body = (await req.json()) as Partial<PromoCodeInput>
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      if (!body.code || !body.ruleId) {
        return NextResponse.json(
          { success: false, message: "code and ruleId are required" },
          { status: 400 },
        )
      }
      try {
        const row = await createPromoCode(
          {
            code: body.code,
            ruleId: body.ruleId,
            maxUses: body.maxUses ?? null,
            expiresAt: body.expiresAt ?? null,
            isActive: body.isActive ?? true,
            notes: body.notes ?? null,
          },
          performedById,
        )
        return NextResponse.json({ success: true, row })
      } catch (e) {
        if (e instanceof PromoValidationError) {
          return NextResponse.json({ success: false, message: e.message }, { status: 400 })
        }
        throw e
      }
    },
  )
}
