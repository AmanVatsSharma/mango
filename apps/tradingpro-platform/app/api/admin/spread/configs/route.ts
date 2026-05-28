/**
 * File:        app/api/admin/spread/configs/route.ts
 * Module:      Admin · Spread Engine (staging)
 * Purpose:     List + create rows in the SpreadConfig table. The admin-v2
 *              UI under /admin-v2/house/quotes mounts this surface behind
 *              an explicit "not yet integrated" banner — runtime spread
 *              comes from MarketControlConfigV1, not this table.
 *
 * Exports:
 *   - GET  /api/admin/spread/configs   — list rows (optionally activeOnly)
 *   - POST /api/admin/spread/configs   — create a row
 *
 * Depends on:
 *   - @/lib/rbac/admin-api          — admin permission gate
 *   - @/lib/spread/spread-engine    — orphan resolver — exports used here are wired
 *
 * Side-effects:
 *   - DB write (POST) into SpreadConfig table
 *   - Adds a `Warning:` response header + `_orphan: true` JSON field on every
 *     response so curl / scripts / external integrators see the staging
 *     marker even without the admin-v2 banner.
 *
 * Key invariants:
 *   - Permission `admin.house.spread` is required on both verbs
 *   - Rows written here have NO runtime effect on order execution today.
 *     Runtime spread is owned by MarketControlConfig (PUT /api/admin/
 *     market-controls/config). Removing this banner-marker requires
 *     simultaneously wiring resolveSpread() into market-control-resolver.ts
 *     and updating /admin-v2/house/quotes/page.tsx to drop the banner.
 *
 * Read order:
 *   1. ORPHAN_WARNING — single source of truth for the staging notice
 *   2. GET            — list with warning headers
 *   3. POST           — create with warning headers + audit hint
 *   4. validateInput  — Zod-ish input check
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-962: surface the orphan staging marker at the API layer
 *     (Warning header + _orphan field) since the admin-v2 UI banner is
 *     invisible to non-browser callers.
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createSpreadConfig, listSpreadConfigs } from "@/lib/spread/spread-engine"
import type { SpreadConfigInput } from "@/lib/spread/types"

export const dynamic = "force-dynamic"

const ORPHAN_WARNING =
  "Spread engine is not wired into runtime order execution. Edits via this " +
  "endpoint do NOT affect actual fills. Runtime spread is configured via " +
  "MarketControlConfig (PUT /api/admin/market-controls/config). See " +
  "/admin-v2/house/quotes banner for context."

const ORPHAN_HEADERS = {
  // RFC 9111 "Warning" header is deprecated but still surfaced by curl/many
  // proxies; X-Orphan-Endpoint is the modern fallback most monitoring stacks
  // index on. Both for belt-and-suspenders coverage.
  Warning: `299 - "${ORPHAN_WARNING}"`,
  "X-Orphan-Endpoint": "true",
  "X-Orphan-Reason": "spread-engine-not-wired-to-execution",
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/spread/configs", required: "admin.house.spread" },
    async () => {
      const url = new URL(req.url)
      const activeOnly = url.searchParams.get("activeOnly") === "true"
      const rows = await listSpreadConfigs({ activeOnly })
      return NextResponse.json(
        {
          success: true,
          rows,
          _orphan: true,
          _orphanWarning: ORPHAN_WARNING,
        },
        { headers: ORPHAN_HEADERS },
      )
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/spread/configs", required: "admin.house.spread" },
    async (ctx) => {
      const body = (await req.json()) as Partial<SpreadConfigInput>

      const validation = validateInput(body)
      if ("error" in validation) {
        return NextResponse.json(
          { success: false, message: validation.error, _orphan: true, _orphanWarning: ORPHAN_WARNING },
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

      const row = await createSpreadConfig(validation.input, { performedById })

      // Server-side audit log so any production write to this staging surface
      // surfaces in monitoring dashboards. Keep at WARN level so it shows up
      // without flooding INFO traffic.
      ctx.logger?.warn?.(
        "SpreadConfig row written via staging endpoint — has no runtime execution effect",
        { performedById, rowId: row.id, route: "POST /api/admin/spread/configs" },
      )

      return NextResponse.json(
        {
          success: true,
          row,
          _orphan: true,
          _orphanWarning: ORPHAN_WARNING,
        },
        { headers: ORPHAN_HEADERS },
      )
    },
  )
}

type ValidationResult = { input: SpreadConfigInput } | { error: string }

function validateInput(body: Partial<SpreadConfigInput>): ValidationResult {
  if (typeof body.bidMarkupBps !== "number" || !Number.isFinite(body.bidMarkupBps)) {
    return { error: "bidMarkupBps must be a finite number" }
  }
  if (typeof body.askMarkupBps !== "number" || !Number.isFinite(body.askMarkupBps)) {
    return { error: "askMarkupBps must be a finite number" }
  }
  if (body.bidMarkupBps < 0 || body.askMarkupBps < 0) {
    return { error: "Markups must be non-negative" }
  }
  if (body.bidMarkupBps > 10000 || body.askMarkupBps > 10000) {
    return { error: "Markups capped at 10000 bps (100%)" }
  }
  return {
    input: {
      instrument: body.instrument ?? null,
      segment: body.segment ?? null,
      clientTier: body.clientTier ?? null,
      bidMarkupBps: body.bidMarkupBps,
      askMarkupBps: body.askMarkupBps,
      isActive: body.isActive ?? true,
      reason: body.reason ?? null,
    },
  }
}
