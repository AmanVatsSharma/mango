/**
 * File:        app/api/admin/risk/liquidate-account/preview/route.ts
 * Module:      Admin Console · Risk Management · Liquidation
 * Purpose:     Dry-run preview of bulk account liquidation — projects P&L outcomes
 *              and margin freed without writing to DB. Uses live-price ladder for
 *              accurate per-position estimates.
 *
 * Exports:
 *   - POST(req) → NextResponse  — handler for POST /api/admin/risk/liquidate-account/preview
 *
 * Depends on:
 *   - @/lib/rbac/admin-api           — handleAdminApi for RBAC + logging
 *   - @/lib/services/risk/LiquidationService — previewLiquidation dry-run
 *   - @/src/common/errors             — AppError for validation failures
 *
 * Side-effects:
 *   - Redis GETs only (via resolveLivePrice inside previewLiquidation); no DB writes.
 *
 * Key invariants:
 *   - Requires admin.risk.manage permission
 *   - tradingAccountId and reason are mandatory body fields
 *   - Returns preview even if some positions have no live price (they are flagged as skipped)
 *
 * Read order:
 *   1. POST — request parsing and delegation to previewLiquidation
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { previewLiquidation } from "@/lib/services/risk/LiquidationService"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/liquidate-account/preview",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to preview liquidation",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const tradingAccountId = String((body as Record<string, unknown>).tradingAccountId || "").trim()
      const reason = String((body as Record<string, unknown>).reason || "Admin preview").trim()

      if (!tradingAccountId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "tradingAccountId is required", statusCode: 400 })
      }

      const preview = await previewLiquidation({
        tradingAccountId,
        reason,
        operatorUserId: ctx.session?.user?.id ?? "",
      })

      ctx.logger.info(
        { tradingAccountId, positionsToClose: preview.positionsToClose, positionsSkipped: preview.positionsSkipped },
        "POST /api/admin/risk/liquidate-account/preview",
      )

      return NextResponse.json({ success: true, preview }, { status: 200 })
    },
  )
}
