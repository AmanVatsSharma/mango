/**
 * @file app/api/admin/comms/campaigns/[campaignId]/route.ts
 * @module api/admin/comms
 * @description GET (detail) + PATCH (update) on a single CommsCampaign.
 *              RUNNING campaigns must be paused before editing — enforced by service.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  getCampaign,
  parseSteps,
  updateCampaign,
} from "@/lib/comms/campaign-service"

export const dynamic = "force-dynamic"

interface RouteCtx {
  params: Promise<{ campaignId: string }>
}

export async function GET(req: Request, ctx: RouteCtx) {
  const { campaignId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `GET /api/admin/comms/campaigns/${campaignId}`,
      required: "admin.comms.read",
    },
    async () => {
      const row = await getCampaign(campaignId)
      if (!row) {
        return NextResponse.json(
          { success: false, message: "not found" },
          { status: 404 },
        )
      }
      return NextResponse.json({ success: true, row })
    },
  )
}

interface PatchBody {
  name?: string
  steps?: unknown
  audience?: Record<string, unknown>
  scheduledAt?: string | null
  defaultTemplateId?: string | null
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { campaignId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `PATCH /api/admin/comms/campaigns/${campaignId}`,
      required: "admin.comms.bulk",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as PatchBody | null
      if (!body) {
        return NextResponse.json(
          { success: false, message: "body required" },
          { status: 400 },
        )
      }
      try {
        const steps = body.steps !== undefined ? parseSteps(body.steps) : undefined
        const row = await updateCampaign(campaignId, {
          name: body.name,
          steps,
          audience: body.audience,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : body.scheduledAt === null ? null : undefined,
          defaultTemplateId: body.defaultTemplateId !== undefined ? body.defaultTemplateId : undefined,
        })
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "failed to update",
          },
          { status: 422 },
        )
      }
    },
  )
}
