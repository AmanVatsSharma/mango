/**
 * @file app/api/admin/house/pnl/route.ts
 * @module api/admin/house
 * @description GET broker realised P&L time-series. ?period=day|week|month (default: day).
 *              Powers the P&L history chart on /admin-v2/house.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { aggregateHousePnlSeries } from "@/lib/house/pnl-aggregator"
import type { HousePnlPeriod } from "@/lib/house/types"

export const dynamic = "force-dynamic"

const VALID: ReadonlySet<HousePnlPeriod> = new Set<HousePnlPeriod>(["day", "week", "month"])

function parsePeriod(input: string | null): HousePnlPeriod {
  if (input && VALID.has(input as HousePnlPeriod)) return input as HousePnlPeriod
  return "day"
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "GET /api/admin/house/pnl",
      required: "admin.house.read",
    },
    async () => {
      const url = new URL(req.url)
      const period = parsePeriod(url.searchParams.get("period"))
      const series = await aggregateHousePnlSeries(period)
      return NextResponse.json({ success: true, series })
    },
  )
}
