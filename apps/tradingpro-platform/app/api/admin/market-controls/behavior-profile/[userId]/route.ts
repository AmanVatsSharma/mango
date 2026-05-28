/**
 * @file route.ts
 * @module api/admin/market-controls/behavior-profile
 * @description GET per-user behavior profile — scalper / martingale / news-window / stale-quote
 *              scores + last N penalised fills for the User Management drawer.
 * @author StockTrade
 * @created 2026-04-16
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getBehaviorProfile } from "@/lib/market-control/behavior-profiler"
import { getUserActiveSegmentIds } from "@/lib/market-control/user-segment-lookup"
import { UserMarketControlOverrideRepository } from "@/lib/repositories/UserMarketControlOverrideRepository"

const ROUTE = "/api/admin/market-controls/behavior-profile/[userId]"

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.users.read", fallbackMessage: "Failed to load behavior profile" },
    async () => {
      const [profile, segmentIds, userOverride] = await Promise.all([
        getBehaviorProfile(params.userId),
        getUserActiveSegmentIds(params.userId),
        UserMarketControlOverrideRepository.findByUserId(params.userId),
      ])
      return NextResponse.json({
        success: true,
        data: {
          profile,
          segmentIds,
          userOverride,
        },
      })
    },
  )
}
