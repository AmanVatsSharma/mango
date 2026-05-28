/**
 * File:        app/api/admin-v2/rollout-status/route.ts
 * Module:      admin-v2
 * Purpose:     Expose the current v2 traffic rollout config to the super-admin home dashboard.
 *              Read-only; returns allowlistCount, trafficPct, and effectiveMode so the UI
 *              can show the cutover readiness tile with real data.
 *
 * Exports:
 *   - GET  — returns RolloutStatus JSON gated by admin.system.read
 *
 * Depends on:
 *   - @/lib/admin-v2/auth-gate — getRolloutStatus()
 *   - @/lib/rbac/admin-api    — handleAdminApi (auth + RBAC guard)
 *
 * Side-effects:
 *   - None (pure env-var read; no DB access)
 *
 * Key invariants:
 *   - Gated by admin.system.read so only super-admins see the rollout config
 *   - env-var reads are module-cached; this route is O(1) even at high call rate
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getRolloutStatus } from "@/lib/admin-v2/auth-gate"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin-v2/rollout-status",
      required: "admin.system.read",
      fallbackMessage: "Failed to read rollout status",
    },
    async () => {
      const status = getRolloutStatus()
      return NextResponse.json({ success: true, data: status })
    },
  )
}
