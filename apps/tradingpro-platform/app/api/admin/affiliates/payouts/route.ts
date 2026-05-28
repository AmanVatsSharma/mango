/**
 * @file app/api/admin/affiliates/payouts/route.ts
 * @module api/admin/affiliates
 * @description GET — global payout queue with filters.
 *              POST — create a new payout for a specific affiliate (bundles ACCRUED/PAYABLE
 *                     commissions into one PENDING payout). Body picks the TDS rate per call.
 *
 *              GET requires admin.affiliate.read; POST requires admin.affiliate.payout.
 *
 *              POST body:
 *                {
 *                  affiliateId:    string
 *                  commissionIds?: string[]   // explicit pick; omit to auto-bundle by cutoff
 *                  cutoffDate?:    string     // ISO; only used when commissionIds absent
 *                  tdsRate:        number     // fraction in [0,1] — REQUIRED, never assumed
 *                  reference?:     string     // optional UTR/UPI txn id
 *                  notes?:         string
 *                }
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliatePayoutStatus, Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { createPayoutForAffiliate } from "@/lib/affiliate/payout-service"

export const dynamic = "force-dynamic"

const VALID_STATUSES = new Set<AffiliatePayoutStatus>([
  "PENDING",
  "APPROVED",
  "PAID",
  "CANCELLED",
])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/affiliates/payouts", required: "admin.affiliate.read" },
    async () => {
      const url = new URL(req.url)
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "50"), 200))
      const page = Math.max(0, Number(url.searchParams.get("page") ?? "0"))
      const where: Prisma.AffiliatePayoutWhereInput = {}
      const affiliateId = url.searchParams.get("affiliateId")
      if (affiliateId) where.affiliateId = affiliateId
      const statusParam = url.searchParams.get("status") as AffiliatePayoutStatus | null
      if (statusParam && VALID_STATUSES.has(statusParam)) where.status = statusParam

      const [total, rows] = await Promise.all([
        prisma.affiliatePayout.count({ where }),
        prisma.affiliatePayout.findMany({
          where,
          skip: page * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            affiliate: { select: { id: true, affiliateCode: true, name: true, tier: true } },
            _count: { select: { commissions: true } },
          },
        }),
      ])
      return NextResponse.json({ success: true, rows, total, page, limit })
    },
  )
}

interface CreateBody {
  affiliateId?: string
  commissionIds?: string[]
  cutoffDate?: string | null
  tdsRate?: number
  reference?: string | null
  notes?: string | null
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/affiliates/payouts", required: "admin.affiliate.payout" },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as CreateBody | null
      if (!body || !body.affiliateId || typeof body.tdsRate !== "number") {
        return NextResponse.json(
          {
            success: false,
            message: "affiliateId and tdsRate (fraction in [0,1]) are required",
          },
          { status: 400 },
        )
      }
      const performedById = ctx.session?.user?.id ?? null
      try {
        const result = await createPayoutForAffiliate(
          {
            affiliateId: body.affiliateId,
            commissionIds: body.commissionIds,
            cutoffDate: body.cutoffDate ? new Date(body.cutoffDate) : undefined,
            tdsRate: body.tdsRate,
            reference: body.reference ?? null,
            notes: body.notes ?? null,
          },
          performedById,
        )
        return NextResponse.json({ success: true, payout: result })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "create payout failed" },
          { status: 400 },
        )
      }
    },
  )
}
