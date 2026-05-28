/**
 * @file app/api/admin/affiliates/rules/[ruleId]/route.ts
 * @module api/admin/affiliates
 * @description PATCH (update) + DELETE (soft-deactivate) for a commission rule.
 *              Both require admin.affiliate.manage.
 *
 *              DELETE flips isActive=false (no row delete) so historical accruals retain
 *              the FK and audit chain stays intact.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliateCommissionKind } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  deactivateCommissionRule,
  updateCommissionRule,
} from "@/lib/affiliate/affiliate-service"

export const dynamic = "force-dynamic"

interface PatchBody {
  kind?: AffiliateCommissionKind
  rate?: number
  perEventCap?: number | null
  perMonthCap?: number | null
  isActive?: boolean
  validFrom?: string | null
  validTo?: string | null
  notes?: string | null
}

export async function PATCH(
  req: Request,
  { params }: { params: { ruleId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `PATCH /api/admin/affiliates/rules/${params.ruleId}`,
      required: "admin.affiliate.manage",
    },
    async () => {
      const body = (await req.json().catch(() => null)) as PatchBody | null
      if (!body) {
        return NextResponse.json(
          { success: false, message: "invalid body" },
          { status: 400 },
        )
      }
      try {
        const row = await updateCommissionRule(params.ruleId, {
          kind: body.kind,
          rate: body.rate,
          perEventCap: body.perEventCap,
          perMonthCap: body.perMonthCap,
          isActive: body.isActive,
          validFrom: body.validFrom !== undefined ? (body.validFrom ? new Date(body.validFrom) : null) : undefined,
          validTo: body.validTo !== undefined ? (body.validTo ? new Date(body.validTo) : null) : undefined,
          notes: body.notes,
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

export async function DELETE(
  req: Request,
  { params }: { params: { ruleId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `DELETE /api/admin/affiliates/rules/${params.ruleId}`,
      required: "admin.affiliate.manage",
    },
    async () => {
      try {
        const row = await deactivateCommissionRule(params.ruleId)
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "deactivate failed" },
          { status: 400 },
        )
      }
    },
  )
}
