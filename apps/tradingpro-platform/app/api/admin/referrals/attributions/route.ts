/**
 * @file route.ts
 * @module app/api/admin/referrals/attributions
 * @description Paginated referral attributions (who referred whom).
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listAttributions } from "@/lib/services/referral/referral-admin-service"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/referrals/attributions", required: "admin.referrals.read", fallbackMessage: "Failed to list attributions" },
    async () => {
      const sp = new URL(req.url).searchParams
      const page = Math.max(1, Number(sp.get("page") || 1) || 1)
      const limit = Math.min(100, Math.max(1, Number(sp.get("limit") || 20) || 20))
      const referrerUserId = sp.get("referrerUserId") || undefined
      const refereeUserId = sp.get("refereeUserId") || undefined
      const search = sp.get("search") || undefined
      const data = await listAttributions({ page, limit, referrerUserId, refereeUserId, search })
      return NextResponse.json({ success: true, data })
    },
  )
}
