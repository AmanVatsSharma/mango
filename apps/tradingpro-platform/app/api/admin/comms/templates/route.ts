/**
 * @file app/api/admin/comms/templates/route.ts
 * @module api/admin/comms
 * @description GET (list) + POST (create) for CommsTemplate.
 *              GET requires admin.comms.read; POST requires admin.comms.send (anyone who
 *              can send can also create the templates they'll use; bulk-only does not
 *              imply template authorship).
 *
 *              Variable validation runs at SAVE — body's {{vars}} must match `variables[]`.
 *              SMS templates with status=ACTIVE require a dltTemplateId.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type {
  CommsChannel,
  CommsTemplateStatus,
} from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  createTemplate,
  listTemplates,
} from "@/lib/comms/template-service"

export const dynamic = "force-dynamic"

const CHANNELS = new Set<CommsChannel>([
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "VOICE",
  "PUSH",
])
const STATUSES = new Set<CommsTemplateStatus>(["DRAFT", "ACTIVE", "ARCHIVED"])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/comms/templates", required: "admin.comms.read" },
    async () => {
      const url = new URL(req.url)
      const channel = url.searchParams.get("channel") as CommsChannel | null
      const status = url.searchParams.get("status") as CommsTemplateStatus | null
      const q = url.searchParams.get("q") ?? undefined
      const rows = await listTemplates({
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
  channel?: CommsChannel
  body?: string
  variables?: string[]
  meta?: Record<string, unknown>
  dltTemplateId?: string | null
  status?: CommsTemplateStatus
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/comms/templates", required: "admin.comms.send" },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as CreateBody | null
      if (!body || !body.name || !body.channel || !body.body) {
        return NextResponse.json(
          { success: false, message: "name, channel and body are required" },
          { status: 400 },
        )
      }
      if (!CHANNELS.has(body.channel)) {
        return NextResponse.json(
          { success: false, message: "invalid channel" },
          { status: 400 },
        )
      }
      if (body.status && !STATUSES.has(body.status)) {
        return NextResponse.json(
          { success: false, message: "invalid status" },
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
        const row = await createTemplate(
          {
            name: body.name,
            channel: body.channel,
            body: body.body,
            variables: body.variables ?? [],
            meta: body.meta,
            dltTemplateId: body.dltTemplateId ?? null,
            status: body.status,
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
