/**
 * @file route.ts
 * @module admin-console
 * @description API route for server-side risk monitoring and automatic position closure
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { runRiskBackstop } from "@/lib/services/risk/risk-backstop-runner"
import { getRiskThresholds, upsertRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/monitor",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to run risk monitoring",
    },
    async (ctx) => {
      const body = await req.json().catch(() => ({} as any))
      const forceRun = body?.forceRun === true || body?.forceRun === "true"

      // Optional: if thresholds provided, persist into SystemSettings (canonical source).
      if (body?.warningThreshold !== undefined || body?.autoCloseThreshold !== undefined) {
        const warningThreshold = body?.warningThreshold ?? 0.75
        const autoCloseThreshold = body?.autoCloseThreshold ?? 0.8
        await upsertRiskThresholds({ warningThreshold, autoCloseThreshold })
        ctx.logger.info({ warningThreshold, autoCloseThreshold }, "POST /api/admin/risk/monitor - thresholds upserted")
      }

      const configuredThresholds = await getRiskThresholds({ maxAgeMs: 0 })
      const result = await runRiskBackstop({ forceRun })

      ctx.logger.info(
        {
          skipped: result.skipped,
          skippedReason: result.skippedReason,
          pnlWorkerHealth: result.pnlWorkerHealth,
          thresholdsSource: configuredThresholds.source,
        },
        "POST /api/admin/risk/monitor - success",
      )

      return NextResponse.json({ success: true, thresholds: configuredThresholds, result }, { status: 200 })
    }
  )
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/monitor",
      required: "admin.risk.read",
      fallbackMessage: "Failed to get risk monitoring info",
    },
    async (ctx) => {
      const thresholds = await getRiskThresholds({ maxAgeMs: 0 })
      ctx.logger.info({ source: thresholds.source }, "GET /api/admin/risk/monitor - success")
      return NextResponse.json(
        {
          success: true,
          message: "Risk backstop endpoint is active (positions worker is canonical enforcer).",
          thresholds,
          usage: {
            POST: "Run risk backstop (runs only if positions worker is stale unless forceRun=true)",
            body: {
              forceRun: "Optional: boolean; run even when positions worker is healthy",
              warningThreshold:
                "Optional: persist warning threshold (0-1 or 0-100) into SystemSettings before running",
              autoCloseThreshold:
                "Optional: persist auto-close threshold (0-1 or 0-100) into SystemSettings before running",
            },
          },
        },
        { status: 200 }
      )
    }
  )
}
