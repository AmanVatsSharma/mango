/**
 * File:        app/api/admin/risk/recompute-margin/route.ts
 * Module:      Admin Console · Risk Management · open-position margin recompute (Trading-voj)
 * Purpose:     Admin endpoint to recompute reserved margin for OPEN positions under the
 *              CURRENT RiskConfig. Handles the asymmetric-margin problem when admin changes
 *              leverage: existing open positions hold the old reserved margin, new orders
 *              would require the new amount, and there's no automatic reconciliation.
 *
 * Exports:
 *   - POST(req) → NextResponse  — { userId?, dryRun? } payload
 *
 * Depends on:
 *   - @/lib/rbac/admin-api                              — handleAdminApi RBAC wrapper
 *   - @/lib/services/risk/recompute-open-position-margin — pure recompute logic
 *
 * Side-effects:
 *   - When `dryRun: false`: per-account transactional update of TradingAccount.usedMargin
 *     and availableMargin
 *   - Pino-logs the action with admin user id + computed delta (audit trail)
 *
 * Key invariants:
 *   - Requires admin.risk.manage permission
 *   - DEFAULT IS dryRun=true — admin must opt in to apply
 *   - userId optional: when omitted, fans out across every account with open positions
 *   - Returns the per-user breakdown so the admin UI can render a preview before applying
 *
 * Read order:
 *   1. POST — body parse + delegation
 *   2. shape of the response (results[] + summary)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  recomputeOpenPositionMarginForUser,
  recomputeOpenPositionMarginForAll,
  type RecomputeOpenPositionMarginResult,
} from "@/lib/services/risk/recompute-open-position-margin"

const ROUTE = "/api/admin/risk/recompute-margin"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: ROUTE,
      required: "admin.risk.manage",
      fallbackMessage: "Failed to recompute open-position margin",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (body && typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }
      const userId = typeof body?.userId === "string" && body.userId.trim().length > 0 ? body.userId.trim() : undefined
      // DEFAULT dry-run. Admin must explicitly pass `dryRun: false` to actually apply.
      const dryRun = body?.dryRun !== false

      ctx.logger.info({ userId: userId ?? "ALL", dryRun }, "POST /api/admin/risk/recompute-margin - start")

      let results: RecomputeOpenPositionMarginResult[]
      if (userId) {
        results = [await recomputeOpenPositionMarginForUser({ userId, dryRun })]
      } else {
        results = await recomputeOpenPositionMarginForAll({ dryRun })
      }

      const summary = {
        accountsTouched: results.length,
        totalDeltaInr: results.reduce((acc, r) => acc + r.delta, 0),
        appliedCount: results.filter((r) => r.applied).length,
        dryRun,
      }

      ctx.logger.info(summary, "POST /api/admin/risk/recompute-margin - success")

      return NextResponse.json({ success: true, summary, results }, { status: 200 })
    },
  )
}
