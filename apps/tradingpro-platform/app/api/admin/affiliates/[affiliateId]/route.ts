/**
 * @file app/api/admin/affiliates/[affiliateId]/route.ts
 * @module api/admin/affiliates
 * @description GET (detail w/ rules + children + parent + linkedUser + totals) +
 *              PATCH (update) for one Affiliate.
 *              GET requires admin.affiliate.read; PATCH requires admin.affiliate.manage.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliateStatus, AffiliateTier } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getAffiliateDetail, updateAffiliate } from "@/lib/affiliate/affiliate-service"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: { affiliateId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `GET /api/admin/affiliates/${params.affiliateId}`,
      required: "admin.affiliate.read",
    },
    async () => {
      const row = await getAffiliateDetail(params.affiliateId)
      if (!row) {
        return NextResponse.json(
          { success: false, message: "affiliate not found" },
          { status: 404 },
        )
      }
      return NextResponse.json({ success: true, row })
    },
  )
}

interface PatchBody {
  name?: string
  phone?: string | null
  tier?: AffiliateTier
  status?: AffiliateStatus
  parentAffiliateId?: string | null
  linkedUserId?: string | null
  payoutMethod?: unknown
  kycLite?: unknown
  notes?: string | null
  password?: string | null
}

export async function PATCH(
  req: Request,
  { params }: { params: { affiliateId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `PATCH /api/admin/affiliates/${params.affiliateId}`,
      required: "admin.affiliate.manage",
    },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as PatchBody | null
      if (!body) {
        return NextResponse.json(
          { success: false, message: "invalid body" },
          { status: 400 },
        )
      }
      const performedById = ctx.session?.user?.id ?? null
      try {
        const row = await updateAffiliate(params.affiliateId, {
          ...body,
          updatedById: performedById,
        })
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "update failed" },
          { status: 400 },
        )
      }
    },
  )
}
