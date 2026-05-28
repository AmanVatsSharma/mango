/**
 * @file route.ts
 * @module admin-console
 * @description Update a client CRM task (status, due date, snooze, outcome).
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
  ClientCrmTaskStatus,
} from "@prisma/client"

const KINDS = new Set(Object.values(ClientCrmTaskKind))
const PRIOS = new Set(Object.values(ClientCrmTaskPriority))
const STATI = new Set(Object.values(ClientCrmTaskStatus))
const DISPO = new Set(Object.values(ClientCrmTaskDisposition))

export async function PATCH(
  req: Request,
  { params }: { params: { userId: string; taskId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/crm/tasks/${params.taskId}`,
      required: "admin.users.crm",
      fallbackMessage: "Failed to update CRM task",
    },
    async (ctx) => {
      const { userId, taskId } = params

      await assertAdminCanManageClientCrm({
        actorRole: ctx.role,
        actorUserId: ctx.session.user.id,
        targetUserId: userId,
      })

      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const svc = createClientCrmService()

      if (typeof body.snoozeHours === "number" && body.snoozeHours > 0) {
        const task = await svc.patchTask({
          taskId,
          userId,
          actorUserId: ctx.session.user.id,
          snoozeHours: body.snoozeHours,
        })
        return NextResponse.json({ success: true, task })
      }

      const update: {
        taskId: string
        userId: string
        actorUserId: string
        title?: string
        description?: string | null
        kind?: ClientCrmTaskKind
        status?: ClientCrmTaskStatus
        priority?: ClientCrmTaskPriority
        dueAt?: Date | null
        disposition?: ClientCrmTaskDisposition | null
        outcomeNote?: string | null
      } = {
        taskId,
        userId,
        actorUserId: ctx.session.user.id,
      }

      if (body.title !== undefined) {
        if (typeof body.title !== "string") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid title", statusCode: 400 })
        }
        update.title = body.title
      }
      if (body.description !== undefined) {
        update.description = body.description === null ? null : String(body.description)
      }
      if (body.kind !== undefined) {
        if (typeof body.kind !== "string" || !KINDS.has(body.kind as ClientCrmTaskKind)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid kind", statusCode: 400 })
        }
        update.kind = body.kind as ClientCrmTaskKind
      }
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !STATI.has(body.status as ClientCrmTaskStatus)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid status", statusCode: 400 })
        }
        update.status = body.status as ClientCrmTaskStatus
      }
      if (body.priority !== undefined) {
        if (typeof body.priority !== "string" || !PRIOS.has(body.priority as ClientCrmTaskPriority)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid priority", statusCode: 400 })
        }
        update.priority = body.priority as ClientCrmTaskPriority
      }
      if (body.dueAt !== undefined) {
        if (body.dueAt === null) {
          update.dueAt = null
        } else if (typeof body.dueAt === "string") {
          const d = new Date(body.dueAt)
          if (Number.isNaN(d.getTime())) {
            throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid dueAt", statusCode: 400 })
          }
          update.dueAt = d
        } else {
          throw new AppError({ code: "VALIDATION_ERROR", message: "dueAt must be ISO string or null", statusCode: 400 })
        }
      }
      if (body.disposition !== undefined) {
        if (body.disposition === null) {
          update.disposition = null
        } else if (typeof body.disposition === "string" && DISPO.has(body.disposition as ClientCrmTaskDisposition)) {
          update.disposition = body.disposition as ClientCrmTaskDisposition
        } else {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid disposition", statusCode: 400 })
        }
      }
      if (body.outcomeNote !== undefined) {
        update.outcomeNote = body.outcomeNote === null ? null : String(body.outcomeNote)
      }

      const task = await svc.patchTask(update)
      ctx.logger.info({ userId, taskId }, "PATCH crm task - success")
      return NextResponse.json({ success: true, task })
    },
  )
}
