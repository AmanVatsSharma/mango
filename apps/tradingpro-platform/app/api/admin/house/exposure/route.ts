/**
 * @file app/api/admin/house/exposure/route.ts
 * @module api/admin/house
 * @description GET the live broker counterparty exposure snapshot.
 *              Redis-cached 1s — safe to poll from many admin sessions.
 *              Used by `/admin-v2/house` for the live KPI strip + heatmap + concentration meters.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getCachedHouseExposure } from "@/lib/house/exposure-aggregator"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "GET /api/admin/house/exposure",
      required: "admin.house.read",
    },
    async () => {
      const snapshot = await getCachedHouseExposure()
      return NextResponse.json({ success: true, snapshot })
    },
  )
}
