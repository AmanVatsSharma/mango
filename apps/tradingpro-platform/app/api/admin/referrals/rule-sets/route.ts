/**
 * @file route.ts
 * @module app/api/admin/referrals/rule-sets
 * @description POST — create a referral rule set with milestone rows.
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createRuleSetWithRules } from "@/lib/services/referral/referral-admin-service"
import { logReferralAdminAction } from "@/lib/services/referral/referral-admin-audit"

const ruleRow = z.object({
  sortOrder: z.number().int(),
  minDepositTotal: z.number().nonnegative(),
  bonusReferrer: z.number().min(0),
  bonusReferee: z.number().min(0),
  isActive: z.boolean().optional(),
})

const bodySchema = z.object({
  name: z.string().min(1).max(128),
  rules: z.array(ruleRow).min(1),
})

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/rule-sets", required: "admin.referrals.manage", fallbackMessage: "Failed to create rule set" },
    async (ctx) => {
      const adminId = (ctx.session?.user as { id?: string })?.id
      const json = await req.json().catch(() => ({}))
      const parsed = bodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
      }
      const created = await createRuleSetWithRules({
        ...parsed.data,
        createdById: adminId ?? null,
      })
      await logReferralAdminAction({
        action: "REFERRAL_RULE_SET_CREATED",
        adminUserId: adminId,
        requestId: req.headers.get("x-request-id"),
        message: `Referral rule set created: ${created.name}`,
        details: { ruleSetId: created.id, name: created.name, ruleCount: created.rules?.length ?? 0 },
      })
      return NextResponse.json({ success: true, data: created })
    },
  )
}
