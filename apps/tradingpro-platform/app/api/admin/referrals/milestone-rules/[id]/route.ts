/**
 * @file route.ts
 * @module app/api/admin/referrals/milestone-rules/[id]
 * @description PATCH a milestone row (thresholds, bonuses, active window, sort order).
 * @author StockTrade
 * @created 2026-04-02
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { patchReferralMilestoneRule } from "@/lib/services/referral/referral-admin-service"
import { AppError } from "@/src/common/errors"

const bodySchema = z.object({
  sortOrder: z.number().int().optional(),
  minDepositTotal: z.number().nonnegative().optional(),
  bonusReferrer: z.number().min(0).optional(),
  bonusReferee: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  activeFrom: z.string().nullable().optional(),
  activeTo: z.string().nullable().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: RouteContext) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/referrals/milestone-rules/[id]",
      required: "admin.referrals.manage",
      fallbackMessage: "Failed to update milestone",
    },
    async () => {
      const { id } = await context.params
      if (!id) throw new AppError({ code: "VALIDATION_ERROR", message: "Missing milestone id", statusCode: 400 })
      const json = await req.json().catch(() => ({}))
      const parsed = bodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        )
      }
      if (Object.keys(parsed.data).length === 0) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "No fields to update", statusCode: 400 })
      }
      const p = parsed.data
      const parseOptionalDate = (v: string | null | undefined): Date | null | undefined => {
        if (v === undefined) return undefined
        if (v === null || v === "") return null
        const d = new Date(v)
        if (Number.isNaN(d.getTime())) throw new Error("Invalid date")
        return d
      }
      try {
        const data = await patchReferralMilestoneRule(id, {
          sortOrder: p.sortOrder,
          minDepositTotal: p.minDepositTotal,
          bonusReferrer: p.bonusReferrer,
          bonusReferee: p.bonusReferee,
          isActive: p.isActive,
          activeFrom: parseOptionalDate(p.activeFrom),
          activeTo: parseOptionalDate(p.activeTo),
        })
        return NextResponse.json({ success: true, data })
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Update failed"
        if (msg.includes("not found")) {
          throw new AppError({ code: "NOT_FOUND", message: msg, statusCode: 404 })
        }
        throw new AppError({ code: "VALIDATION_ERROR", message: msg, statusCode: 400 })
      }
    },
  )
}
