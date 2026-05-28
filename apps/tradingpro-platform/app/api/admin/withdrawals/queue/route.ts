/**
 * File:        app/api/admin/withdrawals/queue/route.ts
 * Module:      Admin · Funds · Withdrawals · Queue (Phase 13a)
 * Purpose:     GET endpoint that returns the risk-aware paginated withdrawal queue + KPI
 *              counts for the v2 admin workbench at /admin-v2/funds/withdrawals.
 *
 * Exports:
 *   - GET — query params: filter, search, page, pageSize.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api    — handleAdminApi wrapper (RBAC + audit + logger).
 *   - @/lib/withdrawal/queue-service — listQueue projection.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - RM scoping rule mirrors `/api/admin/withdrawals` GET — moderators see their assigned book,
 *     admins see their managed users, super-admin sees all. The risk-aware queue MUST NOT
 *     surface withdrawals outside the admin's scope.
 *   - Permission key: `admin.withdrawals.review` (read-only) — granted to ADMIN + SUPER_ADMIN.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listQueue } from "@/lib/withdrawal/queue-service"
import type { QueueFilter } from "@/lib/withdrawal/types"

const ALLOWED_FILTERS: QueueFilter[] = [
  "ALL",
  "PENDING_HIGH_RISK",
  "PENDING_LOW_RISK",
  "HELD",
  "PROCESSING",
  "COMPLETED",
]

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals/queue",
      required: "admin.withdrawals.review",
      fallbackMessage: "Failed to fetch withdrawal queue",
    },
    async ({ session, role, logger }) => {
      const url = new URL(req.url)
      const rawFilter = url.searchParams.get("filter") ?? "ALL"
      const filter: QueueFilter = (ALLOWED_FILTERS as string[]).includes(rawFilter)
        ? (rawFilter as QueueFilter)
        : "ALL"
      const search = url.searchParams.get("search")?.trim() || null
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
      const pageSize =
        Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50

      const managedByIdFilter =
        role === "SUPER_ADMIN"
          ? null
          : role === "ADMIN"
            ? session.user.id ?? null
            : ((session.user as { managedById?: string | null }).managedById ?? null)

      const result = await listQueue({
        filter,
        search,
        managedByIdFilter,
        page,
        pageSize,
      })
      logger.debug(
        { filter, page, total: result.total, kpis: result.kpis },
        "GET /api/admin/withdrawals/queue ok",
      )
      return NextResponse.json({ success: true, ...result }, { status: 200 })
    },
  )
}
