/**
 * @file app/api/admin/bonuses/rules/[id]/route.ts
 * @module api/admin/bonuses
 * @description PATCH (update) + DELETE for bonus rules. DELETE refuses if grants reference
 *              the rule — admin must set isActive=false instead to preserve audit trail.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { deleteRule, updateRule, validateRuleInput } from "@/lib/bonus/rules-service"
import type { BonusRuleInput } from "@/lib/bonus/types"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "PATCH /api/admin/bonuses/rules/[id]", required: "admin.bonus.manage" },
    async () => {
      const body = (await req.json()) as Partial<BonusRuleInput>
      const validation = validateRuleInput(body)
      if ("error" in validation) {
        return NextResponse.json(
          { success: false, message: validation.error },
          { status: 400 },
        )
      }
      const row = await updateRule(id, validation.input)
      return NextResponse.json({ success: true, row })
    },
  )
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "DELETE /api/admin/bonuses/rules/[id]", required: "admin.bonus.manage" },
    async () => {
      try {
        await deleteRule(id)
        return NextResponse.json({ success: true })
      } catch (e) {
        return NextResponse.json(
          { success: false, message: e instanceof Error ? e.message : "Delete failed" },
          { status: 400 },
        )
      }
    },
  )
}
