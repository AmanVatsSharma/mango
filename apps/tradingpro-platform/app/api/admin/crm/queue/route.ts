/**
 * @file app/api/admin/crm/queue/route.ts
 * @module admin-console
 * @description CRM Callback Radar — list endpoint. Returns the actual due-task rows behind
 *              the existing /api/admin/crm/callback-radar counts, so the v2 Sales workbench
 *              and the radar tile on the role-aware home can show *which* clients to call
 *              right now (not just how many).
 *
 *              Exports:
 *                - GET — bucket-filtered active tasks (book-scoped for MODERATOR).
 *
 *              Query params:
 *                bucket   "overdue" | "due_in_hour" | "due_today"  (default "overdue")
 *                limit    1..100                                   (default 50)
 *
 *              Response:
 *                {
 *                  bucket,
 *                  observedAt,
 *                  tasks: Array<{
 *                    id, title, kind, priority, dueAt, status, snoozeCount,
 *                    user: { id, name, email, phone, clientId, isActive }
 *                  }>
 *                }
 *
 *              Side-effects: read-only.
 *
 *              Key invariants:
 *                - MODERATOR sees only their book (clientUserScopeWhere equivalent).
 *                - Time buckets MUST match the existing getCallbackRadar service so counts
 *                  and lists never disagree:
 *                    overdue       — ACTIVE tasks with dueAt < now (and not null).
 *                    due_in_hour   — ACTIVE tasks with dueAt in [now, now+1h].
 *                    due_today     — ACTIVE tasks with dueAt in [IST day start, IST day end].
 *                - Permission key matches existing CRM endpoints: admin.users.crm.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextRequest, NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { ClientCrmTaskStatus, Role } from "@prisma/client"

type Bucket = "overdue" | "due_in_hour" | "due_today"
const VALID_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>([
  "overdue",
  "due_in_hour",
  "due_today",
])
const ACTIVE: ClientCrmTaskStatus[] = [ClientCrmTaskStatus.OPEN, ClientCrmTaskStatus.IN_PROGRESS]

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
  const startUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`)
  const endUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T23:59:59.999+05:30`)
  return { startUtc, endUtc }
}

export async function GET(req: NextRequest) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/crm/queue",
      required: "admin.users.crm",
      fallbackMessage: "Failed to load CRM queue",
    },
    async (ctx) => {
      const url = new URL(req.url)
      const rawBucket = (url.searchParams.get("bucket") ?? "overdue") as Bucket
      const bucket: Bucket = VALID_BUCKETS.has(rawBucket) ? rawBucket : "overdue"
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100)

      const now = new Date()
      const oneHour = new Date(now.getTime() + 60 * 60 * 1000)
      const { startUtc, endUtc } = istDayBoundsUtc(now)

      const dueWhere =
        bucket === "overdue"
          ? { dueAt: { lt: now, not: null } }
          : bucket === "due_in_hour"
            ? { dueAt: { gte: now, lte: oneHour } }
            : { dueAt: { gte: startUtc, lte: endUtc } }

      const userScopeWhere =
        ctx.role === "MODERATOR"
          ? { role: Role.USER, managedById: ctx.session.user.id }
          : { role: Role.USER }

      const tasks = await prisma.clientCrmTask.findMany({
        where: {
          status: { in: ACTIVE },
          user: userScopeWhere,
          ...dueWhere,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              clientId: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ dueAt: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        take: limit,
      })

      ctx.logger.info(
        { bucket, count: tasks.length, role: ctx.role },
        "GET /api/admin/crm/queue - success",
      )

      return NextResponse.json({
        bucket,
        observedAt: now.toISOString(),
        tasks,
      })
    },
  )
}
