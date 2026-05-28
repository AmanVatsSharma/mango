/**
 * @file app/api/admin/rms/leaderboard/route.ts
 * @module admin-console
 * @description RM performance leaderboard — productivity metrics per Relationship Manager
 *              over a date range, aggregated entirely from existing tables (User, KYC,
 *              ClientCrmTask, ClientCrmNote). No new schema, no migration.
 *
 *              Exports:
 *                - GET — leaderboard rows.
 *
 *              Query params:
 *                from   ISO date (default: today - 30d)
 *                to     ISO date (default: now)
 *                limit  1..200 (default 50)
 *
 *              Response:
 *                {
 *                  range: { from, to },
 *                  rows: Array<{
 *                    rm: { id, name, email, role, isActive },
 *                    managedClients, activeClients,
 *                    approvedKycs, tasksCompleted, tasksOverdueOpen, notesAdded
 *                  }>
 *                }
 *
 *              Side-effects: read-only.
 *
 *              Key invariants:
 *                - MODERATOR sees only their own row (book-scope rule reused).
 *                - All metrics scoped to the RM's *direct* managed users (managedById = rm.id);
 *                  multi-level rollups are an explicit future enhancement, not implicit.
 *                - Date range applies to event-creation timestamps only:
 *                    approvedKycs       → KYC.approvedAt (APPROVED rows only)
 *                    tasksCompleted     → ClientCrmTask.completedAt (DONE rows only)
 *                    notesAdded         → ClientCrmNote.createdAt
 *                  tasksOverdueOpen is point-in-time (active tasks with dueAt < now); not range-bound.
 *                - Aggregation strategy: 4 lightweight queries with `_count` group-by in JS.
 *                  For typical broker scale (RMs in dozens, events in thousands) this beats raw
 *                  SQL maintainability and stays well under 100ms.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextRequest, NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import {
  ClientCrmTaskStatus,
  KycStatus,
  Role,
} from "@prisma/client"

const DEFAULT_LOOKBACK_DAYS = 30
const ACTIVE_TASK: ClientCrmTaskStatus[] = [
  ClientCrmTaskStatus.OPEN,
  ClientCrmTaskStatus.IN_PROGRESS,
]

interface LeaderRow {
  rm: { id: string; name: string | null; email: string | null; role: Role; isActive: boolean }
  managedClients: number
  activeClients: number
  approvedKycs: number
  tasksCompleted: number
  tasksOverdueOpen: number
  notesAdded: number
}

export async function GET(req: NextRequest) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/rms/leaderboard",
      required: "admin.users.rm",
      fallbackMessage: "Failed to load RM leaderboard",
    },
    async (ctx) => {
      const url = new URL(req.url)
      const fromParam = url.searchParams.get("from")
      const toParam = url.searchParams.get("to")
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200)

      const to = toParam ? new Date(toParam) : new Date()
      const from = fromParam
        ? new Date(fromParam)
        : new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

      // RM rows: ADMIN + MODERATOR. MODERATOR sees only themselves.
      const rmWhere =
        ctx.role === "MODERATOR"
          ? { id: ctx.session.user.id }
          : { role: { in: [Role.ADMIN, Role.MODERATOR] } }

      const rms = await prisma.user.findMany({
        where: rmWhere,
        select: { id: true, name: true, email: true, role: true, isActive: true },
        take: limit,
      })

      const rmIds = rms.map((r) => r.id)
      if (rmIds.length === 0) {
        return NextResponse.json({
          range: { from: from.toISOString(), to: to.toISOString() },
          rows: [],
        })
      }

      // 1. Client counts (managed users grouped by RM).
      const [clientGroups, activeGroups] = await Promise.all([
        prisma.user.groupBy({
          by: ["managedById"],
          where: { role: Role.USER, managedById: { in: rmIds } },
          _count: { _all: true },
        }),
        prisma.user.groupBy({
          by: ["managedById"],
          where: { role: Role.USER, managedById: { in: rmIds }, isActive: true },
          _count: { _all: true },
        }),
      ])
      const clientByRm = mapByManagedBy(clientGroups)
      const activeByRm = mapByManagedBy(activeGroups)

      // 2. KYC + tasks + notes — fetch slim shape, group by user.managedById in JS.
      const [approvedKycRows, completedTaskRows, overdueTaskRows, noteRows] = await Promise.all([
        prisma.kYC.findMany({
          where: {
            status: KycStatus.APPROVED,
            approvedAt: { gte: from, lte: to },
            user: { managedById: { in: rmIds } },
          },
          select: { user: { select: { managedById: true } } },
        }),
        prisma.clientCrmTask.findMany({
          where: {
            status: ClientCrmTaskStatus.DONE,
            completedAt: { gte: from, lte: to },
            user: { managedById: { in: rmIds } },
          },
          select: { user: { select: { managedById: true } } },
        }),
        prisma.clientCrmTask.findMany({
          where: {
            status: { in: ACTIVE_TASK },
            dueAt: { lt: new Date(), not: null },
            user: { managedById: { in: rmIds } },
          },
          select: { user: { select: { managedById: true } } },
        }),
        prisma.clientCrmNote.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            user: { managedById: { in: rmIds } },
          },
          select: { user: { select: { managedById: true } } },
        }),
      ])

      const kycByRm = countByManagedBy(approvedKycRows)
      const completedByRm = countByManagedBy(completedTaskRows)
      const overdueByRm = countByManagedBy(overdueTaskRows)
      const notesByRm = countByManagedBy(noteRows)

      const rows: LeaderRow[] = rms.map((rm) => ({
        rm,
        managedClients: clientByRm.get(rm.id) ?? 0,
        activeClients: activeByRm.get(rm.id) ?? 0,
        approvedKycs: kycByRm.get(rm.id) ?? 0,
        tasksCompleted: completedByRm.get(rm.id) ?? 0,
        tasksOverdueOpen: overdueByRm.get(rm.id) ?? 0,
        notesAdded: notesByRm.get(rm.id) ?? 0,
      }))

      // Sort: most active RMs first.
      rows.sort(
        (a, b) =>
          b.tasksCompleted + b.approvedKycs + b.notesAdded -
          (a.tasksCompleted + a.approvedKycs + a.notesAdded),
      )

      ctx.logger.info(
        { count: rows.length, from, to, role: ctx.role },
        "GET /api/admin/rms/leaderboard - success",
      )

      return NextResponse.json({
        range: { from: from.toISOString(), to: to.toISOString() },
        rows,
      })
    },
  )
}

function mapByManagedBy(
  groups: Array<{ managedById: string | null; _count: { _all: number } }>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const g of groups) {
    if (g.managedById) out.set(g.managedById, g._count._all)
  }
  return out
}

function countByManagedBy(
  rows: Array<{ user: { managedById: string | null } }>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const id = r.user.managedById
    if (!id) continue
    out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}
