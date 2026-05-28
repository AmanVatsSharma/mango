/**
 * @file route.ts
 * @module admin-console
 * @description Admin API returning the current risk control status for the dashboard: master toggle, circuit breaker, thresholds, enforcement policy, and today's auto-close stats from the worker heartbeat.
 * @author BharatERP
 * @created 2026-05-13
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getRiskEnforcementSettings } from "@/lib/services/risk/risk-enforcement-settings"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { getLatestActiveGlobalSettings } from "@/lib/server/workers/system-settings"
import { POSITIONS_PNL_WORKER_HEARTBEAT_KEY } from "@/lib/services/position/PositionPnLWorker"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/status",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk status",
    },
    async (ctx) => {
      // Fetch all data in parallel
      const [riskSettings, thresholds, heartbeatRows] = await Promise.all([
        getRiskEnforcementSettings({ maxAgeMs: 0 }),
        getRiskThresholds({ maxAgeMs: 0 }),
        getLatestActiveGlobalSettings([POSITIONS_PNL_WORKER_HEARTBEAT_KEY]),
      ])

      // Parse today's auto-close stats from the worker heartbeat
      let slAutoClosedToday = 0
      let targetAutoClosedToday = 0
      let riskAutoClosedToday = 0
      let riskAlertsToday = 0
      let lastEventTime: string | null = null

      const heartbeatRaw = heartbeatRows.get(POSITIONS_PNL_WORKER_HEARTBEAT_KEY)?.value
      if (heartbeatRaw) {
        try {
          const hb = JSON.parse(heartbeatRaw)
          slAutoClosedToday = hb.stopLossAutoClosed ?? 0
          targetAutoClosedToday = hb.targetAutoClosed ?? 0
          riskAutoClosedToday = hb.riskAutoClosed ?? 0
          riskAlertsToday = hb.riskAlertsCreated ?? 0
          if (hb.lastRunAtIso) lastEventTime = hb.lastRunAtIso
        } catch {
          // heartbeat parse failed — stats stay at 0
        }
      }

      const isCircuitBreakerActive =
        riskSettings.circuitBreakerPausedUntil != null && Date.now() < riskSettings.circuitBreakerPausedUntil

      ctx.logger.info(
        { riskEnabled: riskSettings.riskAutoCloseEnabled, circuitBreakerActive: isCircuitBreakerActive },
        "GET /api/admin/risk/status",
      )

      return NextResponse.json(
        {
          success: true,
          status: {
            riskEnabled: riskSettings.riskAutoCloseEnabled,
            circuitBreakerActive: isCircuitBreakerActive,
            circuitBreakerUntil: riskSettings.circuitBreakerPausedUntil,
          },
          thresholds: {
            warning: thresholds.warningThreshold,
            autoClose: thresholds.autoCloseThreshold,
            source: thresholds.source,
          },
          enforcement: {
            fullLiquidationOnAutoClose: riskSettings.fullLiquidationOnAutoClose,
            squareOffOnWarningBand: riskSettings.squareOffOnWarningBand,
            source: riskSettings.source,
          },
          stats: {
            slAutoClosedToday,
            targetAutoClosedToday,
            riskAutoClosedToday,
            riskAlertsToday,
          },
          lastEventTime,
        },
        { status: 200 },
      )
    },
  )
}