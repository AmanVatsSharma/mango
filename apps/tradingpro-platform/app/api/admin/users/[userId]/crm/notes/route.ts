/**
 * @file route.ts
 * @module admin-console
 * @description List and create client CRM notes (team or manager-only visibility).
 * @author StockTrade
 * @created 2026-04-07
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { assertAdminCanManageClientCrm } from "@/lib/server/admin-client-crm-scope"
import { normalizeAdminListLimitParam } from "@/lib/server/admin-list-query-number-utils"
import { createClientCrmService } from "@/lib/services/admin/client-crm.service"
import { AppError } from "@/src/common/errors"
import { ClientCrmNoteVisibility } from "@prisma/client"

const NOTE_VIS_SET = new Set<string>(Object.values(ClientCrmNoteVisibility))

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/crm/notes`,
      required: "admin.users.crm",
      fallbackMessage: "Failed to list CRM notes",
    },
    async (ctx) => {
      const userId = params.userId
      const { searchParams } = new URL(req.url)
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 50, 100)

      await assertAdminCanManageClientCrm({
        actorRole: ctx.role,
        actorUserId: ctx.session.user.id,
        targetUserId: userId,
      })

      const svc = createClientCrmService()
      const notes = await svc.listNotes({
        userId,
        viewerRole: ctx.role,
        viewerUserId: ctx.session.user.id,
        limit,
      })

      return NextResponse.json({ success: true, notes })
    },
  )
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/crm/notes`,
      required: "admin.users.crm",
      fallbackMessage: "Failed to create CRM note",
    },
    async (ctx) => {
      const userId = params.userId
      await assertAdminCanManageClientCrm({
        actorRole: ctx.role,
        actorUserId: ctx.session.user.id,
        targetUserId: userId,
      })

      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const rawBody = body.body
      if (typeof rawBody !== "string") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "body is required", statusCode: 400 })
      }

      let visibility: ClientCrmNoteVisibility = ClientCrmNoteVisibility.TEAM
      if (body.visibility !== undefined) {
        if (typeof body.visibility !== "string" || !NOTE_VIS_SET.has(body.visibility)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid visibility", statusCode: 400 })
        }
        visibility = body.visibility as ClientCrmNoteVisibility
      }

      const svc = createClientCrmService()
      const note = await svc.createNote({
        userId,
        createdById: ctx.session.user.id,
        body: rawBody,
        isPinned: body.isPinned === true,
        visibility,
      })

      ctx.logger.info({ userId, noteId: note.id }, "POST crm note - success")
      return NextResponse.json({ success: true, note }, { status: 201 })
    },
  )
}
