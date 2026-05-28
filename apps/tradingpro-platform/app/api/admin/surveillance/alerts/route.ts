/**
 * File:        app/api/admin/surveillance/alerts/route.ts
 * Module:      Admin · Surveillance · Alerts list (Phase 13b)
 * Purpose:     GET — paginated surveillance alert queue + KPIs for the v2 workbench
 *              at /admin-v2/surveillance.
 *
 * Exports:
 *   - GET — query: status, severity, ruleKey, q, page, pageSize.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api    — RBAC + audit + logger.
 *   - @/lib/surveillance/queue-service.listQueue.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - Permission key: `admin.surveillance.read` — ADMIN + SUPER_ADMIN.
 *   - Surveillance is house-wide; no RM scoping (alerts are about internal-fraud detection,
 *     they are not bookable per-RM today).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listQueue } from "@/lib/surveillance/queue-service"
import {
  SurveillanceSeverity,
  SurveillanceAlertStatus,
  type QueueFilter,
} from "@/lib/surveillance/types"

const STATUS_VALUES = new Set<string>([
  ...Object.values(SurveillanceAlertStatus),
  "ANY",
])
const SEVERITY_VALUES = new Set<string>([
  ...Object.values(SurveillanceSeverity),
  "ANY",
])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/surveillance/alerts",
      required: "admin.surveillance.read",
      fallbackMessage: "Failed to fetch surveillance alerts",
    },
    async ({ logger }) => {
      const url = new URL(req.url)
      const rawStatus = url.searchParams.get("status") ?? "OPEN"
      const rawSeverity = url.searchParams.get("severity") ?? "ANY"
      const rawRule = url.searchParams.get("ruleKey") ?? "ANY"
      const q = url.searchParams.get("q")?.trim() || undefined
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
      const pageSize =
        Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25

      const filter: QueueFilter = {
        status: STATUS_VALUES.has(rawStatus)
          ? (rawStatus as QueueFilter["status"])
          : "OPEN",
        severity: SEVERITY_VALUES.has(rawSeverity)
          ? (rawSeverity as QueueFilter["severity"])
          : "ANY",
        ruleKey: (rawRule || "ANY") as QueueFilter["ruleKey"],
        q,
        page,
        pageSize,
      }

      const result = await listQueue(filter)
      logger.debug(
        { filter: { ...filter, q: q ? "<set>" : undefined }, total: result.total },
        "GET /api/admin/surveillance/alerts ok",
      )
      return NextResponse.json({ success: true, ...result }, { status: 200 })
    },
  )
}
