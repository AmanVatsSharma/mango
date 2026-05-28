/**
 * @file app/api/admin/comms/campaigns/[campaignId]/transition/route.ts
 * @module api/admin/comms
 * @description State machine transitions for a campaign:
 *              ACTIVATE | PAUSE | RESUME | CANCEL | COMPLETE.
 *              Service enforces the allowed-from-state matrix; bad transitions return 422.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  transitionCampaign,
  type CampaignTransition,
} from "@/lib/comms/campaign-service"

export const dynamic = "force-dynamic"

interface RouteCtx {
  params: Promise<{ campaignId: string }>
}

const ALLOWED = new Set<CampaignTransition>([
  "ACTIVATE",
  "PAUSE",
  "RESUME",
  "CANCEL",
  "COMPLETE",
])

interface Body {
  action?: CampaignTransition
}

export async function POST(req: Request, ctx: RouteCtx) {
  const { campaignId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `POST /api/admin/comms/campaigns/${campaignId}/transition`,
      required: "admin.comms.bulk",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as Body | null
      const action = body?.action
      if (!action || !ALLOWED.has(action)) {
        return NextResponse.json(
          { success: false, message: "invalid action" },
          { status: 400 },
        )
      }
      try {
        const row = await transitionCampaign(campaignId, action)
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "transition failed",
          },
          { status: 422 },
        )
      }
    },
  )
}
