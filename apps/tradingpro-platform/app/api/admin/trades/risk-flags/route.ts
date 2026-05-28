/**
 * @file route.ts
 * @module admin-console/trades
 * @description GET /api/admin/trades/risk-flags — compact actionable alerts list.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { computeAdminTradesRiskFlags } from "@/lib/server/admin-trades-risk-flags"
import type { RiskFlagsResponse } from "@/app/api/admin/trades/types"

// Simple in-memory cache (30s). Acts as a coalescing layer — the blotter
// polls every 15s but real alerts rarely change more than twice a minute.
let cachedAt = 0
let cachedFlags: RiskFlagsResponse | null = null
const CACHE_TTL_MS = 30_000

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/risk-flags",
      required: "admin.positions.read",
      fallbackMessage: "Failed to compute risk flags",
    },
    async () => {
      const now = Date.now()
      if (cachedFlags && now - cachedAt < CACHE_TTL_MS) {
        return NextResponse.json(cachedFlags, { status: 200 })
      }
      const flags = await computeAdminTradesRiskFlags()
      const response: RiskFlagsResponse = { flags }
      cachedFlags = response
      cachedAt = now
      return NextResponse.json(response, { status: 200 })
    },
  )
}
