/**
 * @file route.ts
 * @module admin-console
 * @description Batch trading-dashboard presence lookup for admin UI snapshot (SSE reconnect / visible rows).
 * @author StockTrade
 * @created 2026-04-03
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getTradingDashboardPresenceMap } from "@/lib/services/realtime/trading-dashboard-presence"

const MAX_IDS = 500

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/presence/batch",
      required: ["admin.users.read", "admin.users.kyc"],
      mode: "any",
      fallbackMessage: "Failed to fetch presence",
    },
    async () => {
      const { searchParams } = new URL(req.url)
      const raw = searchParams.get("ids") || ""
      const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_IDS)

      const map = await getTradingDashboardPresenceMap(ids)
      return NextResponse.json({ map }, { status: 200 })
    },
  )
}
