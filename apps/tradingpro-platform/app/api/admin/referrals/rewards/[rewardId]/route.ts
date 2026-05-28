/**
 * @file route.ts
 * @module app/api/admin/referrals/rewards/[rewardId]
 * @description PATCH — cancel a PENDING/ELIGIBLE referral reward (audit logged).
 * @author StockTrade
 * @created 2026-04-02
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { cancelReferralReward } from "@/lib/services/referral/referral-admin-service"
import { AppError } from "@/src/common/errors"

const bodySchema = z.object({
  reason: z.string().min(1).max(512),
})

type RouteContext = { params: Promise<{ rewardId: string }> }

export async function PATCH(req: Request, context: RouteContext) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/referrals/rewards/[rewardId]",
      required: "admin.referrals.manage",
      fallbackMessage: "Failed to cancel reward",
    },
    async (handlerCtx) => {
      const { rewardId } = await context.params
      if (!rewardId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Missing reward id", statusCode: 400 })
      }
      const json = await req.json().catch(() => ({}))
      const parsed = bodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        )
      }
      const adminId = (handlerCtx.session?.user as { id?: string })?.id ?? null
      const requestId = req.headers.get("x-request-id")
      try {
        const data = await cancelReferralReward({
          rewardId,
          reason: parsed.data.reason,
          adminUserId: adminId,
          requestId,
        })
        return NextResponse.json({ success: true, data })
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Cancel failed"
        if (msg.includes("not found")) {
          throw new AppError({ code: "NOT_FOUND", message: msg, statusCode: 404 })
        }
        throw new AppError({ code: "VALIDATION_ERROR", message: msg, statusCode: 400 })
      }
    },
  )
}
