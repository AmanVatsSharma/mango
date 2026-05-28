/**
 * @file route.ts
 * @module api/admin/market-controls/history
 * @description GET audit timeline of Market Control edits. Backed by SystemSettings rows with
 *              key prefix `market_control_audit:`. Read-only admin endpoint.
 * @author StockTrade
 * @created 2026-04-16
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listMarketControlAudit } from "@/lib/market-control/market-control-audit"

const ROUTE = "/api/admin/market-controls/history"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.settings.manage", fallbackMessage: "Failed to load audit history" },
    async () => {
      const { searchParams } = new URL(req.url)
      const limit = Number(searchParams.get("limit") ?? "50")
      const entries = await listMarketControlAudit(Number.isFinite(limit) ? limit : 50)
      return NextResponse.json({ success: true, data: entries })
    },
  )
}
