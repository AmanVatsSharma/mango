/**
 * @file app/api/admin/affiliates/[affiliateId]/rules/route.ts
 * @module api/admin/affiliates
 * @description POST — append a commission rule for one affiliate.
 *              Requires admin.affiliate.manage.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliateCommissionKind } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { addCommissionRule } from "@/lib/affiliate/affiliate-service"

export const dynamic = "force-dynamic"

const VALID_KINDS = new Set<AffiliateCommissionKind>(["SPREAD", "LOSS", "LOT", "FIXED"])

interface CreateBody {
  kind?: AffiliateCommissionKind
  rate?: number
  perEventCap?: number | null
  perMonthCap?: number | null
  isActive?: boolean
  validFrom?: string | null
  validTo?: string | null
  notes?: string | null
}

export async function POST(
  req: Request,
  { params }: { params: { affiliateId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `POST /api/admin/affiliates/${params.affiliateId}/rules`,
      required: "admin.affiliate.manage",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as CreateBody | null
      if (!body || !body.kind || !VALID_KINDS.has(body.kind) || typeof body.rate !== "number") {
        return NextResponse.json(
          { success: false, message: "kind (SPREAD|LOSS|LOT|FIXED) and rate (number) required" },
          { status: 400 },
        )
      }
      try {
        const row = await addCommissionRule({
          affiliateId: params.affiliateId,
          kind: body.kind,
          rate: body.rate,
          perEventCap: body.perEventCap ?? null,
          perMonthCap: body.perMonthCap ?? null,
          isActive: body.isActive ?? true,
          validFrom: body.validFrom ? new Date(body.validFrom) : null,
          validTo: body.validTo ? new Date(body.validTo) : null,
          notes: body.notes ?? null,
        })
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "create failed" },
          { status: 400 },
        )
      }
    },
  )
}
