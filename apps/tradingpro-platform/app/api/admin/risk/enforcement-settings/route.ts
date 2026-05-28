/**
 * @file route.ts
 * @module admin-console
 * @description Admin API for risk enforcement policy (master risk toggle, full liquidation, warning-band square-off, circuit breaker).
 * @author BharatERP
 * @created 2026-04-01
 * @updated 2026-05-13
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { getRiskEnforcementSettings, upsertRiskEnforcementSettings } from "@/lib/services/risk/risk-enforcement-settings"

function parseBodyBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (value === "true" || value === 1) return true
  if (value === "false" || value === 0) return false
  return null
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/enforcement-settings",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk enforcement settings",
    },
    async (ctx) => {
      const settings = await getRiskEnforcementSettings({ maxAgeMs: 0 })
      ctx.logger.info({ source: settings.source }, "GET /api/admin/risk/enforcement-settings")
      return NextResponse.json({ success: true, settings }, { status: 200 })
    },
  )
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/enforcement-settings",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to update risk enforcement settings",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object") {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const rawBody = body as Record<string, unknown>
      const enabled = parseBodyBoolean(rawBody.riskAutoCloseEnabled)
      const circuitBreakerRaw = rawBody.circuitBreakerPausedUntil
      const full = parseBodyBoolean(rawBody.fullLiquidationOnAutoClose)
      const warn = parseBodyBoolean(rawBody.squareOffOnWarningBand)

      if (enabled === null && circuitBreakerRaw === undefined && full === null && warn === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "At least one setting must be provided: riskAutoCloseEnabled (bool), circuitBreakerPausedUntil (number|null), fullLiquidationOnAutoClose (bool), squareOffOnWarningBand (bool)",
          statusCode: 400,
        })
      }

      const update: Parameters<typeof upsertRiskEnforcementSettings>[0] = {}
      if (enabled !== null) update.riskAutoCloseEnabled = enabled
      if (circuitBreakerRaw !== undefined) {
        if (circuitBreakerRaw === null || circuitBreakerRaw === "null") {
          update.circuitBreakerPausedUntil = null
        } else {
          const parsed = Number(circuitBreakerRaw)
          update.circuitBreakerPausedUntil = Number.isFinite(parsed) && parsed > 0 ? parsed : null
        }
      }
      if (full !== null) update.fullLiquidationOnAutoClose = full
      if (warn !== null) update.squareOffOnWarningBand = warn

      const settings = await upsertRiskEnforcementSettings(update)
      ctx.logger.info(
        {
          riskAutoCloseEnabled: settings.riskAutoCloseEnabled,
          circuitBreakerPausedUntil: settings.circuitBreakerPausedUntil,
          fullLiquidationOnAutoClose: settings.fullLiquidationOnAutoClose,
          squareOffOnWarningBand: settings.squareOffOnWarningBand,
        },
        "PUT /api/admin/risk/enforcement-settings",
      )
      return NextResponse.json({ success: true, settings }, { status: 200 })
    },
  )
}
