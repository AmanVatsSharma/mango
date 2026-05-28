/**
 * File:        app/api/admin/surveillance/alerts/[id]/route.ts
 * Module:      Admin · Surveillance · Alert detail + status transitions (Phase 13b)
 * Purpose:     GET full alert payload (drawer view); POST single status transitions
 *              (assign / dismiss / resolve). Single-writer rule applies — these endpoints
 *              MUST NOT mutate ClientWinnerControl, BonusGrant, or any source state.
 *              Acting on the underlying issue is done through the existing Phase 9/10/13a
 *              admin APIs.
 *
 * Exports:
 *   - GET    — full alert + rule meta.
 *   - POST   — body: { action: "assign"|"dismiss"|"resolve", reason?, note? }.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api
 *   - @/lib/surveillance/queue-service.{getAlertById, assignAlert, dismissAlert, resolveAlert}
 *
 * Side-effects:
 *   - GET: none.
 *   - POST: writes ONLY to HouseSurveillanceAlert (status, assignedTo, dismissedBy,
 *     resolutionNote). No source-state mutation.
 *
 * Key invariants:
 *   - Permission keys: GET → `admin.surveillance.read`; POST → `admin.surveillance.manage`.
 *   - `dismiss` requires `reason` (so the audit trail explains why we dropped the signal).
 *   - `resolve` requires `note` (what was found / what action was taken on the source).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  getAlertById,
  assignAlert,
  dismissAlert,
  resolveAlert,
} from "@/lib/surveillance/queue-service"

interface Ctx {
  params: { id: string } | Promise<{ id: string }>
}

async function resolveId(ctx: Ctx): Promise<string> {
  const params = await Promise.resolve(ctx.params)
  return params.id
}

export async function GET(req: Request, ctx: Ctx) {
  const id = await resolveId(ctx)
  return handleAdminApi(
    req,
    {
      route: `/api/admin/surveillance/alerts/${id}`,
      required: "admin.surveillance.read",
      fallbackMessage: "Failed to fetch alert",
    },
    async () => {
      const result = await getAlertById(id)
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Alert not found" },
          { status: 404 },
        )
      }
      return NextResponse.json({ success: true, ...result }, { status: 200 })
    },
  )
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign") }),
  z.object({ action: z.literal("dismiss"), reason: z.string().min(1).max(255) }),
  z.object({ action: z.literal("resolve"), note: z.string().min(1).max(2000) }),
])

export async function POST(req: Request, ctx: Ctx) {
  const id = await resolveId(ctx)
  return handleAdminApi(
    req,
    {
      route: `/api/admin/surveillance/alerts/${id}`,
      required: "admin.surveillance.manage",
      fallbackMessage: "Failed to update alert",
    },
    async ({ session, logger }) => {
      const adminId = session.user.id
      if (!adminId) {
        return NextResponse.json(
          { success: false, error: "Admin session missing" },
          { status: 401 },
        )
      }
      const json = await req.json().catch(() => ({}))
      const parsed = ActionSchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid action payload", issues: parsed.error.issues },
          { status: 400 },
        )
      }
      const action = parsed.data
      let updated
      switch (action.action) {
        case "assign":
          updated = await assignAlert(id, adminId)
          break
        case "dismiss":
          updated = await dismissAlert(id, adminId, action.reason)
          break
        case "resolve":
          updated = await resolveAlert(id, adminId, action.note)
          break
      }
      logger.info(
        { alertId: id, action: action.action, status: updated.status },
        "surveillance alert action ok",
      )
      return NextResponse.json({ success: true, alert: updated }, { status: 200 })
    },
  )
}
