/**
 * @file route.ts
 * @module app/api/admin/referrals/program
 * @description GET/PATCH referral program singleton settings and active rule set snapshot.
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getReferralProgramForAdmin, patchReferralProgram } from "@/lib/services/referral/referral-admin-service"
import { logReferralAdminAction } from "@/lib/services/referral/referral-admin-audit"
import { prisma } from "@/lib/prisma"

const patchBody = z.object({
  isActive: z.boolean().optional(),
  activeRuleSetId: z.string().uuid().nullable().optional(),
  requireKycApprovedForPayout: z.boolean().optional(),
  showRulesToUsers: z.boolean().optional(),
  showBonusAmountsToUsers: z.boolean().optional(),
  publicRulesNotice: z.string().max(16000).nullable().optional(),
})

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/program", required: "admin.referrals.read", fallbackMessage: "Failed to load program" },
    async () => {
      const data = await getReferralProgramForAdmin()
      return NextResponse.json({ success: true, data })
    },
  )
}

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/program", required: "admin.referrals.manage", fallbackMessage: "Failed to update program" },
    async (ctx) => {
      const json = await req.json().catch(() => ({}))
      const parsed = patchBody.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
      }
      const before = await prisma.referralProgramSettings.findUnique({ where: { id: 1 } })
      const updated = await patchReferralProgram(parsed.data)
      const adminId = (ctx.session?.user as { id?: string })?.id
      await logReferralAdminAction({
        action: "REFERRAL_PROGRAM_UPDATED",
        adminUserId: adminId,
        requestId: req.headers.get("x-request-id"),
        message: "Referral program settings updated",
        details: {
          before: before
            ? {
                isActive: before.isActive,
                activeRuleSetId: before.activeRuleSetId,
                requireKycApprovedForPayout: before.requireKycApprovedForPayout,
                showRulesToUsers: before.showRulesToUsers,
                showBonusAmountsToUsers: before.showBonusAmountsToUsers,
                publicRulesNoticePresent: Boolean(before.publicRulesNotice),
              }
            : null,
          after: {
            isActive: updated.isActive,
            activeRuleSetId: updated.activeRuleSetId,
            requireKycApprovedForPayout: updated.requireKycApprovedForPayout,
            showRulesToUsers: updated.showRulesToUsers,
            showBonusAmountsToUsers: updated.showBonusAmountsToUsers,
            publicRulesNoticePresent: Boolean(updated.publicRulesNotice),
          },
        },
      })
      return NextResponse.json({ success: true, data: updated })
    },
  )
}
