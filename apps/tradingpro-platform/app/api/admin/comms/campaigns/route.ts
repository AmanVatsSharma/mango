/**
 * @file app/api/admin/comms/campaigns/route.ts
 * @module api/admin/comms
 * @description GET (list w/ enrollment + message counts) + POST (create) for CommsCampaign.
 *              GET requires admin.comms.read; POST requires admin.comms.bulk (campaign-level
 *              authorship is the highest blast radius lever in the comms module).
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type {
  CommsCampaignKind,
  CommsCampaignStatus,
  CommsChannel,
} from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  createCampaign,
  listCampaigns,
  parseSteps,
} from "@/lib/comms/campaign-service"

export const dynamic = "force-dynamic"

const CHANNELS = new Set<CommsChannel>([
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "VOICE",
  "PUSH",
])
const STATUSES = new Set<CommsCampaignStatus>([
  "DRAFT",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
])
const KINDS = new Set<CommsCampaignKind>(["ONE_SHOT", "DRIP", "TRIGGERED"])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/comms/campaigns", required: "admin.comms.read" },
    async () => {
      const url = new URL(req.url)
      const channel = url.searchParams.get("channel") as CommsChannel | null
      const status = url.searchParams.get("status") as CommsCampaignStatus | null
      const q = url.searchParams.get("q") ?? undefined
      const rows = await listCampaigns({
        channel: channel && CHANNELS.has(channel) ? channel : undefined,
        status: status && STATUSES.has(status) ? status : undefined,
        q,
      })
      return NextResponse.json({ success: true, rows })
    },
  )
}

interface CreateBody {
  name?: string
  kind?: CommsCampaignKind
  channel?: CommsChannel
  steps?: unknown
  audience?: Record<string, unknown>
  scheduledAt?: string | null
  defaultTemplateId?: string | null
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/comms/campaigns", required: "admin.comms.bulk" },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as CreateBody | null
      if (!body || !body.name || !body.channel || !body.kind) {
        return NextResponse.json(
          {
            success: false,
            message: "name, channel and kind are required",
          },
          { status: 400 },
        )
      }
      if (!CHANNELS.has(body.channel) || !KINDS.has(body.kind)) {
        return NextResponse.json(
          { success: false, message: "invalid channel or kind" },
          { status: 400 },
        )
      }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "no admin session" },
          { status: 401 },
        )
      }
      try {
        const steps = parseSteps(body.steps)
        const row = await createCampaign(
          {
            name: body.name,
            kind: body.kind,
            channel: body.channel,
            steps,
            audience: body.audience,
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
            defaultTemplateId: body.defaultTemplateId ?? null,
          },
          performedById,
        )
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "failed to create",
          },
          { status: 422 },
        )
      }
    },
  )
}
