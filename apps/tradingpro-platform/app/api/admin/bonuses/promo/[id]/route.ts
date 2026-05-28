/**
 * @file app/api/admin/bonuses/promo/[id]/route.ts
 * @module api/admin/bonuses
 * @description PATCH (update) + DELETE promo codes.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  deletePromoCode,
  PromoValidationError,
  updatePromoCode,
} from "@/lib/bonus/promo-service"
import type { PromoCodeInput } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "PATCH /api/admin/bonuses/promo/[id]", required: "admin.bonus.manage" },
    async () => {
      const body = (await req.json()) as Partial<PromoCodeInput>
      if (!body.code || !body.ruleId) {
        return NextResponse.json(
          { success: false, message: "code and ruleId are required" },
          { status: 400 },
        )
      }
      try {
        const row = await updatePromoCode(id, {
          code: body.code,
          ruleId: body.ruleId,
          maxUses: body.maxUses ?? null,
          expiresAt: body.expiresAt ?? null,
          isActive: body.isActive ?? true,
          notes: body.notes ?? null,
        })
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

export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "DELETE /api/admin/bonuses/promo/[id]", required: "admin.bonus.manage" },
    async () => {
      await deletePromoCode(id)
      return NextResponse.json({ success: true })
    },
  )
}
