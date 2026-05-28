/**
 * @file route.ts
 * @module admin-console
 * @description List and create client CRM tasks (callbacks, follow-ups).
 * @author StockTrade
 * @created 2026-04-07
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { assertAdminCanManageClientCrm } from "@/lib/server/admin-client-crm-scope"
import { createClientCrmService } from "@/lib/services/admin/client-crm.service"
import { AppError } from "@/src/common/errors"
import {
  ClientCrmTaskDisposition,
  ClientCrmTaskKind,
  ClientCrmTaskPriority,
} from "@prisma/client"

const KINDS = new Set(Object.values(ClientCrmTaskKind))
const PRIOS = new Set(Object.values(ClientCrmTaskPriority))
const DISPO = new Set(Object.values(ClientCrmTaskDisposition))

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/crm/tasks`,
      required: "admin.users.crm",
      fallbackMessage: "Failed to list CRM tasks",
    },
    async (ctx) => {
      const userId = params.userId
      const { searchParams } = new URL(req.url)
      const upcoming = searchParams.get("upcoming") === "1" || searchParams.get("upcoming") === "true"
      const bucket = searchParams.get("status") || "active"
      const statusFilter = bucket === "done" ? "done" : bucket === "all" ? "all" : "active"

      await assertAdminCanManageClientCrm({
        actorRole: ctx.role,
        actorUserId: ctx.session.user.id,
        targetUserId: userId,
      })

      const svc = createClientCrmService()
      const tasks = await svc.listTasks({ userId, statusFilter, upcoming })
      return NextResponse.json({ success: true, tasks })
    },
  )
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/crm/tasks`,
      required: "admin.users.crm",
      fallbackMessage: "Failed to create CRM task",
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

      const title = body.title
      if (typeof title !== "string") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "title is required", statusCode: 400 })
      }

      const kind = body.kind
      if (typeof kind !== "string" || !KINDS.has(kind as ClientCrmTaskKind)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid kind", statusCode: 400 })
      }

      let priority: ClientCrmTaskPriority | undefined
      if (body.priority !== undefined) {
        if (typeof body.priority !== "string" || !PRIOS.has(body.priority as ClientCrmTaskPriority)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid priority", statusCode: 400 })
        }
        priority = body.priority as ClientCrmTaskPriority
      }

      let disposition: ClientCrmTaskDisposition | null | undefined
      if (body.disposition !== undefined && body.disposition !== null) {
        if (typeof body.disposition !== "string" || !DISPO.has(body.disposition as ClientCrmTaskDisposition)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid disposition", statusCode: 400 })
        }
        disposition = body.disposition as ClientCrmTaskDisposition
      }

      let dueAt: Date | null | undefined
      if (body.dueAt !== undefined && body.dueAt !== null) {
        if (typeof body.dueAt !== "string") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "dueAt must be ISO string", statusCode: 400 })
        }
        const d = new Date(body.dueAt)
        if (Number.isNaN(d.getTime())) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid dueAt", statusCode: 400 })
        }
        dueAt = d
      }

      const description =
        typeof body.description === "string" ? body.description : body.description === null ? null : undefined

      const svc = createClientCrmService()
      const task = await svc.createTask({
        userId,
        createdById: ctx.session.user.id,
        title,
        description: description ?? undefined,
        kind: kind as ClientCrmTaskKind,
        priority,
        dueAt,
        disposition: disposition ?? null,
      })

      ctx.logger.info({ userId, taskId: task.id }, "POST crm task - success")
      return NextResponse.json({ success: true, task }, { status: 201 })
    },
  )
}
