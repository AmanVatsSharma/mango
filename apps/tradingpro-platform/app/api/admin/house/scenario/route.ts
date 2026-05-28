/**
 * @file app/api/admin/house/scenario/route.ts
 * @module api/admin/house
 * @description GET pre-computed scenario VaR ladders for the live book.
 *              Powers the "if NIFTY moves ±2%" panel on /admin-v2/house.
 *              Uses the same cached exposure snapshot as /exposure for consistency.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getCachedHouseExposure } from "@/lib/house/exposure-aggregator"
import { buildScenarioLadders } from "@/lib/house/scenario-var"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "GET /api/admin/house/scenario",
      required: "admin.house.read",
    },
    async () => {
      const snapshot = await getCachedHouseExposure()
      const ladders = buildScenarioLadders(snapshot)
      return NextResponse.json({ success: true, asOf: snapshot.asOf, ladders })
    },
  )
}
