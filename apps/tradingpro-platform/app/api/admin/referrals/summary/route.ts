/**
 * @file route.ts
 * @module app/api/admin/referrals/summary
 * @description GET referral admin KPIs: attribution count, reward counts by status, program flags.
 * @author StockTrade
 * @created 2026-04-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getReferralAdminSummary } from "@/lib/services/referral/referral-admin-service"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/summary", required: "admin.referrals.read", fallbackMessage: "Failed to load summary" },
    async () => {
      const data = await getReferralAdminSummary()
      return NextResponse.json({ success: true, data })
    },
  )
}
