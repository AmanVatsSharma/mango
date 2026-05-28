/**
 * @file route.ts
 * @module app/api/admin/referrals/rewards
 * @description Paginated referral reward ledger for ops review.
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listRewards } from "@/lib/services/referral/referral-admin-service"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/rewards", required: "admin.referrals.read", fallbackMessage: "Failed to list rewards" },
    async () => {
      const sp = new URL(req.url).searchParams
      const page = Math.max(1, Number(sp.get("page") || 1) || 1)
      const limit = Math.min(100, Math.max(1, Number(sp.get("limit") || 20) || 20))
      const status = sp.get("status") || undefined
      const search = sp.get("search") || undefined
      const data = await listRewards({ page, limit, status, search })
      return NextResponse.json({ success: true, data })
    },
  )
}
