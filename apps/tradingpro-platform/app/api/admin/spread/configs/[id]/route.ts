/**
 * File:        app/api/admin/spread/configs/[id]/route.ts
 * Module:      Admin · Spread Engine (staging)
 * Purpose:     PATCH (update) + DELETE individual SpreadConfig rows. Sister
 *              of /api/admin/spread/configs — same staging caveat: no runtime
 *              effect on order execution today; runtime spread is owned by
 *              MarketControlConfigV1.
 *
 * Exports:
 *   - PATCH  /api/admin/spread/configs/[id]   — update a row
 *   - DELETE /api/admin/spread/configs/[id]   — delete a row
 *
 * Depends on:
 *   - @/lib/rbac/admin-api          — admin permission gate (admin.house.spread)
 *   - @/lib/spread/spread-engine    — orphan resolver — exports used here are wired
 *
 * Side-effects:
 *   - DB write/delete on SpreadConfig table
 *   - Adds Warning header + _orphan JSON marker so non-browser callers see
 *     the staging notice that the admin-v2 UI banner shows visually.
 *
 * Key invariants:
 *   - Mirrors the orphan markers used by the parent route — keep both files'
 *     ORPHAN_WARNING / ORPHAN_HEADERS in sync. (When the engine is wired into
 *     market-control-resolver, remove markers from BOTH files in one change.)
 *
 * Read order:
 *   1. ORPHAN_WARNING — staging notice (kept in sync with sibling route)
 *   2. PATCH — update flow
 *   3. DELETE — delete flow
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-962: surface orphan staging marker at API layer.
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { deleteSpreadConfig, updateSpreadConfig } from "@/lib/spread/spread-engine"
import type { SpreadConfigInput } from "@/lib/spread/types"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ id: string }>
}

const ORPHAN_WARNING =
  "Spread engine is not wired into runtime order execution. Edits via this " +
  "endpoint do NOT affect actual fills. Runtime spread is configured via " +
  "MarketControlConfig (PUT /api/admin/market-controls/config). See " +
  "/admin-v2/house/quotes banner for context."

const ORPHAN_HEADERS = {
  Warning: `299 - "${ORPHAN_WARNING}"`,
  "X-Orphan-Endpoint": "true",
  "X-Orphan-Reason": "spread-engine-not-wired-to-execution",
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "PATCH /api/admin/spread/configs/[id]", required: "admin.house.spread" },
    async (ctx) => {
      const body = (await req.json()) as Partial<SpreadConfigInput>
      if (
        typeof body.bidMarkupBps !== "number" ||
        typeof body.askMarkupBps !== "number" ||
        body.bidMarkupBps < 0 ||
        body.askMarkupBps < 0 ||
        body.bidMarkupBps > 10000 ||
        body.askMarkupBps > 10000
      ) {
        return NextResponse.json(
          { success: false, message: "Bid/ask markup must be 0..10000 bps", _orphan: true, _orphanWarning: ORPHAN_WARNING },
          { status: 400, headers: ORPHAN_HEADERS },
        )
      }
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id", _orphan: true, _orphanWarning: ORPHAN_WARNING },
          { status: 401, headers: ORPHAN_HEADERS },
        )
      }
      const row = await updateSpreadConfig(
        id,
        {
          instrument: body.instrument ?? null,
          segment: body.segment ?? null,
          clientTier: body.clientTier ?? null,
          bidMarkupBps: body.bidMarkupBps,
          askMarkupBps: body.askMarkupBps,
          isActive: body.isActive ?? true,
          reason: body.reason ?? null,
        },
        { performedById },
      )

      ctx.logger?.warn?.(
        "SpreadConfig row updated via staging endpoint — has no runtime execution effect",
        { performedById, rowId: id, route: "PATCH /api/admin/spread/configs/[id]" },
      )

      return NextResponse.json(
        { success: true, row, _orphan: true, _orphanWarning: ORPHAN_WARNING },
        { headers: ORPHAN_HEADERS },
      )
    },
  )
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = await params
  return handleAdminApi(
    req,
    { route: "DELETE /api/admin/spread/configs/[id]", required: "admin.house.spread" },
    async (ctx) => {
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id", _orphan: true, _orphanWarning: ORPHAN_WARNING },
          { status: 401, headers: ORPHAN_HEADERS },
        )
      }
      await deleteSpreadConfig(id, { performedById })

      ctx.logger?.warn?.(
        "SpreadConfig row deleted via staging endpoint — has no runtime execution effect",
        { performedById, rowId: id, route: "DELETE /api/admin/spread/configs/[id]" },
      )

      return NextResponse.json(
        { success: true, _orphan: true, _orphanWarning: ORPHAN_WARNING },
        { headers: ORPHAN_HEADERS },
      )
    },
  )
}
