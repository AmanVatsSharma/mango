/**
 * @file app/api/admin/affiliates/commissions/route.ts
 * @module api/admin/affiliates
 * @description GET — paginated commissions feed with filters.
 *              Requires admin.affiliate.read.
 *
 *              Query params:
 *                - affiliateId?
 *                - status?  — ACCRUED | PAYABLE | PAID | CLAWED_BACK | VOID
 *                - kind?    — SPREAD | LOSS | LOT | FIXED
 *                - sourceUserId?
 *                - fromDate? toDate?  — ISO timestamps
 *                - page, limit
 *
 *              Response: { success, rows, total, page, limit, sumGrossRupees, sumTdsRupees }
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliateCommissionKind, AffiliateCommissionStatus, Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { toNumber } from "@/lib/affiliate/types"

export const dynamic = "force-dynamic"

const VALID_STATUSES = new Set<AffiliateCommissionStatus>([
  "ACCRUED",
  "PAYABLE",
  "PAID",
  "CLAWED_BACK",
  "VOID",
])
const VALID_KINDS = new Set<AffiliateCommissionKind>(["SPREAD", "LOSS", "LOT", "FIXED"])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/affiliates/commissions", required: "admin.affiliate.read" },
    async () => {
      const url = new URL(req.url)
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "50"), 200))
      const page = Math.max(0, Number(url.searchParams.get("page") ?? "0"))

      const where: Prisma.AffiliateCommissionWhereInput = {}
      const affiliateId = url.searchParams.get("affiliateId")
      if (affiliateId) where.affiliateId = affiliateId
      const sourceUserId = url.searchParams.get("sourceUserId")
      if (sourceUserId) where.sourceUserId = sourceUserId
      const statusParam = url.searchParams.get("status") as AffiliateCommissionStatus | null
      if (statusParam && VALID_STATUSES.has(statusParam)) where.status = statusParam
      const kindParam = url.searchParams.get("kind") as AffiliateCommissionKind | null
      if (kindParam && VALID_KINDS.has(kindParam)) where.kind = kindParam
      const fromDate = url.searchParams.get("fromDate")
      const toDate = url.searchParams.get("toDate")
      if (fromDate || toDate) {
        where.accruedAt = {}
        if (fromDate) where.accruedAt.gte = new Date(fromDate)
        if (toDate) where.accruedAt.lte = new Date(toDate)
      }

      const [total, rows, sums] = await Promise.all([
        prisma.affiliateCommission.count({ where }),
        prisma.affiliateCommission.findMany({
          where,
          skip: page * limit,
          take: limit,
          orderBy: { accruedAt: "desc" },
          include: {
            affiliate: { select: { id: true, affiliateCode: true, name: true, tier: true } },
            sourceUser: { select: { id: true, name: true, email: true, clientId: true } },
          },
        }),
        prisma.affiliateCommission.aggregate({
          where,
          _sum: { amount: true, tdsAmount: true },
        }),
      ])

      return NextResponse.json({
        success: true,
        rows,
        total,
        page,
        limit,
        sumGrossRupees: toNumber(sums._sum.amount),
        sumTdsRupees: toNumber(sums._sum.tdsAmount),
      })
    },
  )
}
