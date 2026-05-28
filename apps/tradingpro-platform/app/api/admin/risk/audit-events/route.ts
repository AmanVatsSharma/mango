/**
 * File:        app/api/admin/risk/audit-events/route.ts
 * Module:      Admin Console · Risk Management · Audit Events
 * Purpose:     Returns the last 100 risk audit events (paginated) for the audit history tab.
 *
 * Exports:
 *   - GET(req) → NextResponse  — returns { events: RiskAuditEventRow[], total: number }
 *
 * Depends on:
 *   - @/lib/rbac/admin-api  — auth guard requiring admin.risk.read
 *   - @/lib/prisma          — Prisma client for RiskAuditEvent queries
 *
 * Side-effects:
 *   - DB read: prisma.riskAuditEvent.findMany with target/operator user joins
 *
 * Key invariants:
 *   - Results are sorted by createdAt DESC (newest first)
 *   - Default limit is 100; page/limit query params supported
 *   - operatorUser and targetUser names are resolved via Prisma includes
 *
 * Read order:
 *   1. RiskAuditEventRow — response shape
 *   2. GET handler — entry point, query parsing, and response
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

export type RiskAuditEventRow = {
  id: string
  eventType: string
  targetUserId: string
  targetUserName: string | null
  operatorUserId: string
  operatorUserName: string | null
  reason: string
  createdAt: string
}

function clampLimit(raw: string | null): number {
  const n = parseInt(raw ?? "", 10)
  if (isNaN(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? "", 10)
  return isNaN(n) || n < 0 ? 0 : n
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/audit-events",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch audit events",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const limit = clampLimit(searchParams.get("limit"))
      const page = parsePage(searchParams.get("page"))

      ctx.logger.debug({ limit, page }, "GET /api/admin/risk/audit-events")

      const [events, total] = await Promise.all([
        prisma.riskAuditEvent.findMany({
          orderBy: { createdAt: "desc" },
          skip: page * limit,
          take: limit,
          include: {
            targetUser: { select: { name: true } },
            operatorUser: { select: { name: true } },
          },
        }),
        prisma.riskAuditEvent.count(),
      ])

      const rows: RiskAuditEventRow[] = events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        targetUserId: e.targetUserId,
        targetUserName: e.targetUser.name ?? null,
        operatorUserId: e.operatorUserId,
        operatorUserName: e.operatorUser.name ?? null,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      }))

      ctx.logger.debug({ count: rows.length, total }, "GET /api/admin/risk/audit-events - success")

      return NextResponse.json({ events: rows, total }, { status: 200 })
    }
  )
}
