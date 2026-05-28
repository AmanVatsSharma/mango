/**
 * @file route.ts
 * @module app/api/admin/referrals/rule-sets/[id]
 * @description PATCH referral rule set metadata (name, isActive).
 * @author StockTrade
 * @created 2026-04-02
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { patchReferralRuleSet } from "@/lib/services/referral/referral-admin-service"
import { AppError } from "@/src/common/errors"

const bodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: RouteContext) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/referrals/rule-sets/[id]",
      required: "admin.referrals.manage",
      fallbackMessage: "Failed to update rule set",
    },
    async () => {
      const { id } = await context.params
      if (!id) throw new AppError({ code: "VALIDATION_ERROR", message: "Missing rule set id", statusCode: 400 })
      const json = await req.json().catch(() => ({}))
      const parsed = bodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        )
      }
      if (Object.keys(parsed.data).length === 0) {
        throw new AppError("VALIDATION", "No fields to update", 400)
      }
      try {
        const data = await patchReferralRuleSet(id, parsed.data)
        return NextResponse.json({ success: true, data })
      } catch {
        throw new AppError({ code: "NOT_FOUND", message: "Rule set not found", statusCode: 404 })
      }
    },
  )
}
