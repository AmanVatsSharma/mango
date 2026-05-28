/**
 * @file route.ts
 * @module admin-console
 * @description Admin API route to read/update canonical risk thresholds stored in SystemSettings.
 * @author StockTrade
 * @created 2026-02-13
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { getRiskThresholds, upsertRiskThresholds } from "@/lib/services/risk/risk-thresholds"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/thresholds",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk thresholds",
    },
    async (ctx) => {
      const thresholds = await getRiskThresholds({ maxAgeMs: 0 })
      ctx.logger.info({ source: thresholds.source }, "GET /api/admin/risk/thresholds - success")
      return NextResponse.json({ success: true, thresholds }, { status: 200 })
    },
  )
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/thresholds",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to update risk thresholds",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const warningThreshold = (body as any).warningThreshold
      const autoCloseThreshold = (body as any).autoCloseThreshold
      if (warningThreshold === undefined || autoCloseThreshold === undefined) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "warningThreshold and autoCloseThreshold are required",
          statusCode: 400,
        })
      }

      const thresholds = await upsertRiskThresholds({ warningThreshold, autoCloseThreshold })
      ctx.logger.info(
        { warningThreshold: thresholds.warningThreshold, autoCloseThreshold: thresholds.autoCloseThreshold },
        "PUT /api/admin/risk/thresholds - success",
      )
      return NextResponse.json({ success: true, thresholds }, { status: 200 })
    },
  )
}

