/**
 * @file app/api/admin/affiliates/[affiliateId]/recompute-tier/route.ts
 * @module api/admin/affiliates
 * @description POST — recompute and persist the affiliate's tier from current metrics.
 *              Returns the from→to transition (changed:false if no movement).
 *
 *              Requires admin.affiliate.manage. Idempotent — safe to spam.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { applyTierRecompute } from "@/lib/affiliate/tier-rules"

export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: { affiliateId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `POST /api/admin/affiliates/${params.affiliateId}/recompute-tier`,
      required: "admin.affiliate.manage",
    },
    async () => {
      try {
        const result = await applyTierRecompute(params.affiliateId)
        return NextResponse.json({ success: true, ...result })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "recompute failed" },
          { status: 400 },
        )
      }
    },
  )
}
