/**
 * File:        app/api/admin/risk/liquidate-account/route.ts
 * Module:      Admin Console · Risk Management · Liquidation
 * Purpose:     Admin-triggered bulk square-off for a trading account — closes all open
 *              positions via LiquidationService and records a RiskAuditEvent row.
 *
 * Exports:
 *   - POST(req) → NextResponse  — handler for POST /api/admin/risk/liquidate-account
 *
 * Depends on:
 *   - @/lib/rbac/admin-api                    — handleAdminApi for RBAC + logging
 *   - @/lib/services/risk/LiquidationService  — executeLiquidation (transactional close)
 *   - @/src/common/errors                      — AppError for validation failures
 *
 * Side-effects:
 *   - Closes all open positions for the account (order creation, margin release, P&L credit/debit)
 *   - Writes one RiskAuditEvent row to the DB on success
 *
 * Key invariants:
 *   - Requires admin.risk.manage permission
 *   - tradingAccountId is mandatory; reason is strongly recommended
 *   - targetUserId is resolved server-side from tradingAccountId — not accepted from caller
 *   - Live prices are resolved BEFORE any DB writes to avoid connection pool drain
 *   - If any position close fails, the entire operation is aborted and an error is returned
 *
 * Read order:
 *   1. POST — request parsing, delegation to executeLiquidation, response shaping
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { executeLiquidation } from "@/lib/services/risk/LiquidationService"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/liquidate-account",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to liquidate account positions",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const tradingAccountId = String((body as Record<string, unknown>).tradingAccountId || "").trim()
      const reason = String((body as Record<string, unknown>).reason || "Admin liquidation").trim()

      if (!tradingAccountId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "tradingAccountId is required", statusCode: 400 })
      }

      const result = await executeLiquidation({
        tradingAccountId,
        reason,
        operatorUserId: ctx.session?.user?.id ?? "",
      })

      ctx.logger.info(
        {
          tradingAccountId,
          positionsClosed: result.positionsClosed,
          positionsSkipped: result.positionsSkipped,
          auditEventId: result.auditEventId,
        },
        "POST /api/admin/risk/liquidate-account",
      )

      return NextResponse.json(result, { status: 200 })
    },
  )
}
