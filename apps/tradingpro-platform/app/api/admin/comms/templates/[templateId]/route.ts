/**
 * @file app/api/admin/comms/templates/[templateId]/route.ts
 * @module api/admin/comms
 * @description GET (detail) + PATCH (update) + DELETE (archive) on a single CommsTemplate.
 *              Channel is immutable. Body / variables / dltTemplateId / status all
 *              validated by the service layer.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { CommsTemplateStatus } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  archiveTemplate,
  getTemplate,
  updateTemplate,
} from "@/lib/comms/template-service"

export const dynamic = "force-dynamic"

interface RouteCtx {
  params: Promise<{ templateId: string }>
}

const STATUSES = new Set<CommsTemplateStatus>(["DRAFT", "ACTIVE", "ARCHIVED"])

export async function GET(req: Request, ctx: RouteCtx) {
  const { templateId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `GET /api/admin/comms/templates/${templateId}`,
      required: "admin.comms.read",
    },
    async () => {
      const row = await getTemplate(templateId)
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
  body?: string
  variables?: string[]
  meta?: Record<string, unknown>
  dltTemplateId?: string | null
  status?: CommsTemplateStatus
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { templateId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `PATCH /api/admin/comms/templates/${templateId}`,
      required: "admin.comms.send",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as PatchBody | null
      if (!body) {
        return NextResponse.json(
          { success: false, message: "body required" },
          { status: 400 },
        )
      }
      if (body.status && !STATUSES.has(body.status)) {
        return NextResponse.json(
          { success: false, message: "invalid status" },
          { status: 400 },
        )
      }
      try {
        const row = await updateTemplate(templateId, body)
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

export async function DELETE(req: Request, ctx: RouteCtx) {
  const { templateId } = await ctx.params
  return handleAdminApi(
    req,
    {
      route: `DELETE /api/admin/comms/templates/${templateId}`,
      required: "admin.comms.send",
    },
    async () => {
      const row = await archiveTemplate(templateId)
      return NextResponse.json({ success: true, row })
    },
  )
}
