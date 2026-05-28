/**
 * @file client-crm.service.ts
 * @module services/admin
 * @description Persisted client CRM: notes (team/manager visibility) and tasks (callbacks, follow-ups) for admin telecaller workflows.
 * @author StockTrade
 * @created 2026-04-07
 */

import { prisma } from "@/lib/prisma"
import type { RoleKey } from "@/lib/rbac/permissions"
import { actorCanSeeManagerCrmNotes } from "@/lib/server/admin-client-crm-scope"
import { AppError } from "@/src/common/errors"
import type { Prisma } from "@prisma/client"
import {
  ClientCrmNoteVisibility,
  ClientCrmTaskDisposition,
  ClientCrmTaskKind,
  ClientCrmTaskPriority,
  ClientCrmTaskStatus,
  Role,
} from "@prisma/client"

const ACTIVE_TASK: ClientCrmTaskStatus[] = [ClientCrmTaskStatus.OPEN, ClientCrmTaskStatus.IN_PROGRESS]

const actorMiniSelect = {
  id: true,
  name: true,
  email: true,
} as const

function istDayBoundsUtc(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value
      return acc
    }, {})
  const y = parts.year
  const m = parts.month
  const d = parts.day
  const startUtc = new Date(`${y}-${m}-${d}T00:00:00+05:30`)
  const endUtc = new Date(`${y}-${m}-${d}T23:59:59.999+05:30`)
  return { startUtc, endUtc }
}

function clientUserScopeWhere(actorRole: RoleKey, actorUserId: string) {
  if (actorRole === "MODERATOR") {
    return { role: Role.USER, managedById: actorUserId }
  }
  return { role: Role.USER }
}

export class ClientCrmService {
  async listNotes(input: {
    userId: string
    viewerRole: RoleKey
    viewerUserId: string
    limit: number
  }) {
    const { userId, viewerRole, viewerUserId, limit } = input
    const canMgr = actorCanSeeManagerCrmNotes(viewerRole)

    const notes = await prisma.clientCrmNote.findMany({
      where: {
        userId,
        OR: [
          { visibility: ClientCrmNoteVisibility.TEAM },
          ...(canMgr
            ? [{ visibility: ClientCrmNoteVisibility.MANAGER_ONLY }]
            : [{ visibility: ClientCrmNoteVisibility.MANAGER_ONLY, createdById: viewerUserId }]),
        ],
      },
      include: { createdBy: { select: actorMiniSelect } },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    })

    return notes
  }

  async createNote(input: {
    userId: string
    createdById: string
    body: string
    isPinned?: boolean
    visibility?: ClientCrmNoteVisibility
  }) {
    const body = input.body.trim()
    if (!body) {
      throw new AppError({ code: "VALIDATION_ERROR", message: "Note body is required", statusCode: 400 })
    }
    return prisma.clientCrmNote.create({
      data: {
        userId: input.userId,
        createdById: input.createdById,
        body,
        isPinned: input.isPinned === true,
        visibility: input.visibility ?? ClientCrmNoteVisibility.TEAM,
      },
      include: { createdBy: { select: actorMiniSelect } },
    })
  }

  async listTasks(input: {
    userId: string
    statusFilter?: "active" | "done" | "all"
    upcoming?: boolean
  }) {
    const { userId, statusFilter = "active", upcoming } = input

    let statusWhere: { status?: { in: ClientCrmTaskStatus[] } } = {}
    if (statusFilter === "active") {
      statusWhere = { status: { in: ACTIVE_TASK } }
    } else if (statusFilter === "done") {
      statusWhere = { status: { in: [ClientCrmTaskStatus.DONE, ClientCrmTaskStatus.CANCELLED] } }
    }

    const orderBy = upcoming
      ? [{ dueAt: "asc" as const }, { createdAt: "desc" as const }]
      : [{ updatedAt: "desc" as const }]

    return prisma.clientCrmTask.findMany({
      where: { userId, ...statusWhere },
      include: {
        createdBy: { select: actorMiniSelect },
        completedBy: { select: actorMiniSelect },
      },
      orderBy,
    })
  }

  async createTask(input: {
    userId: string
    createdById: string
    title: string
    description?: string | null
    kind: ClientCrmTaskKind
    priority?: ClientCrmTaskPriority
    dueAt?: Date | null
    disposition?: ClientCrmTaskDisposition | null
  }) {
    const title = input.title.trim()
    if (!title) {
      throw new AppError({ code: "VALIDATION_ERROR", message: "Task title is required", statusCode: 400 })
    }
    return prisma.clientCrmTask.create({
      data: {
        userId: input.userId,
        createdById: input.createdById,
        title,
        description: input.description?.trim() || null,
        kind: input.kind,
        priority: input.priority ?? ClientCrmTaskPriority.NORMAL,
        dueAt: input.dueAt ?? null,
        disposition: input.disposition ?? null,
      },
      include: {
        createdBy: { select: actorMiniSelect },
        completedBy: { select: actorMiniSelect },
      },
    })
  }

  async patchTask(input: {
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
    snoozeHours?: number
  }) {
    const existing = await prisma.clientCrmTask.findFirst({
      where: { id: input.taskId, userId: input.userId },
    })
    if (!existing) {
      throw new AppError({ code: "NOT_FOUND", message: "Task not found", statusCode: 404 })
    }

    const data: Record<string, unknown> = {}

    if (input.title !== undefined) {
      const t = input.title.trim()
      if (!t) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Title cannot be empty", statusCode: 400 })
      }
      data.title = t
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null
    if (input.kind !== undefined) data.kind = input.kind
    if (input.priority !== undefined) data.priority = input.priority
    if (input.disposition !== undefined) data.disposition = input.disposition
    if (input.outcomeNote !== undefined) data.outcomeNote = input.outcomeNote?.trim() || null

    if (input.snoozeHours !== undefined && input.snoozeHours > 0) {
      const base = existing.dueAt && existing.dueAt > new Date() ? existing.dueAt : new Date()
      data.dueAt = new Date(base.getTime() + input.snoozeHours * 60 * 60 * 1000)
      data.snoozeCount = { increment: 1 }
      if (existing.status === ClientCrmTaskStatus.OPEN) {
        data.status = ClientCrmTaskStatus.IN_PROGRESS
      }
    } else if (input.dueAt !== undefined) {
      data.dueAt = input.dueAt
    }

    if (input.status !== undefined) {
      data.status = input.status
      if (input.status === ClientCrmTaskStatus.DONE || input.status === ClientCrmTaskStatus.CANCELLED) {
        data.completedAt = new Date()
        data.completedById = input.actorUserId
      } else if (input.status === ClientCrmTaskStatus.OPEN || input.status === ClientCrmTaskStatus.IN_PROGRESS) {
        data.completedAt = null
        data.completedById = null
      }
    }

    return prisma.clientCrmTask.update({
      where: { id: input.taskId },
      data: data as Prisma.ClientCrmTaskUpdateInput,
      include: {
        createdBy: { select: actorMiniSelect },
        completedBy: { select: actorMiniSelect },
      },
    })
  }

  async getCallbackRadar(actorRole: RoleKey, actorUserId: string) {
    const userWhere = clientUserScopeWhere(actorRole, actorUserId)
    const now = new Date()
    const hour = new Date(now.getTime() + 60 * 60 * 1000)
    const { startUtc, endUtc } = istDayBoundsUtc(now)

    const baseWhere = {
      status: { in: ACTIVE_TASK },
      user: userWhere,
    }

    const [overdue, dueInHour, dueToday] = await Promise.all([
      prisma.clientCrmTask.count({
        where: { ...baseWhere, dueAt: { lt: now, not: null } },
      }),
      prisma.clientCrmTask.count({
        where: { ...baseWhere, dueAt: { gte: now, lte: hour } },
      }),
      prisma.clientCrmTask.count({
        where: { ...baseWhere, dueAt: { gte: startUtc, lte: endUtc } },
      }),
    ])

    return { overdue, dueInHour, dueToday, observedAt: now.toISOString() }
  }

  async getTaskHintsForUserIds(userIds: string[]): Promise<
    Record<
      string,
      {
        nextDueAt: string | null
        overdueCount: number
        openCount: number
      }
    >
  > {
    if (userIds.length === 0) return {}

    const tasks = await prisma.clientCrmTask.findMany({
      where: {
        userId: { in: userIds },
        status: { in: ACTIVE_TASK },
      },
      select: { userId: true, dueAt: true },
    })

    const now = new Date()
    const init = () => ({
      nextDueAt: null as string | null,
      overdueCount: 0,
      openCount: 0,
      _nextMs: Infinity as number,
    })
    const map = new Map<string, ReturnType<typeof init>>()

    for (const uid of userIds) {
      map.set(uid, init())
    }

    for (const t of tasks) {
      const m = map.get(t.userId)!
      m.openCount += 1
      if (t.dueAt && t.dueAt < now) m.overdueCount += 1
      if (t.dueAt) {
        const ms = t.dueAt.getTime()
        if (ms < m._nextMs) {
          m._nextMs = ms
          m.nextDueAt = t.dueAt.toISOString()
        }
      }
    }

    const out: Record<string, { nextDueAt: string | null; overdueCount: number; openCount: number }> = {}
    for (const [uid, m] of Array.from(map.entries())) {
      out[uid] = {
        nextDueAt: m.nextDueAt,
        overdueCount: m.overdueCount,
        openCount: m.openCount,
      }
    }
    return out
  }
}

export function createClientCrmService(): ClientCrmService {
  return new ClientCrmService()
}
