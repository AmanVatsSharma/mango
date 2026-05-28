/**
 * @file app/api/admin/affiliates/route.ts
 * @module api/admin/affiliates
 * @description GET (list w/ aggregates) + POST (create) for the Affiliate / IB program.
 *              GET requires admin.affiliate.read; POST requires admin.affiliate.manage.
 *
 *              Query params (GET):
 *                - q?           — search across affiliateCode / name / email
 *                - tier?        — BRONZE | SILVER | GOLD
 *                - status?      — PENDING | ACTIVE | SUSPENDED | REJECTED
 *                - parentId?    — filter children of a specific parent (or "null" for roots)
 *                - page, limit  — pagination
 *
 *              Response (GET): { success, rows: AffiliateRow[], total, page, limit }
 *              Response (POST): { success, row: Affiliate }
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { AffiliateStatus, AffiliateTier } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAffiliate, listAffiliates } from "@/lib/affiliate/affiliate-service"

export const dynamic = "force-dynamic"

const VALID_TIERS = new Set<AffiliateTier>(["BRONZE", "SILVER", "GOLD"])
const VALID_STATUSES = new Set<AffiliateStatus>([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/affiliates", required: "admin.affiliate.read" },
    async () => {
      const url = new URL(req.url)
      const tierParam = url.searchParams.get("tier") as AffiliateTier | null
      const statusParam = url.searchParams.get("status") as AffiliateStatus | null
      const parentIdRaw = url.searchParams.get("parentId")
      const parentAffiliateId =
        parentIdRaw === null
          ? undefined
          : parentIdRaw === "null"
            ? null
            : parentIdRaw
      const result = await listAffiliates({
        q: url.searchParams.get("q") ?? undefined,
        tier: tierParam && VALID_TIERS.has(tierParam) ? tierParam : undefined,
        status: statusParam && VALID_STATUSES.has(statusParam) ? statusParam : undefined,
        parentAffiliateId,
        page: Number(url.searchParams.get("page") ?? "0"),
        limit: Number(url.searchParams.get("limit") ?? "25"),
      })
      return NextResponse.json({ success: true, ...result })
    },
  )
}

interface CreateBody {
  email?: string
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
  affiliateCode?: string | null
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/affiliates", required: "admin.affiliate.manage" },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as CreateBody | null
      if (!body || !body.email || !body.name) {
        return NextResponse.json(
          { success: false, message: "email and name are required" },
          { status: 400 },
        )
      }
      if (body.tier && !VALID_TIERS.has(body.tier)) {
        return NextResponse.json(
          { success: false, message: "invalid tier" },
          { status: 400 },
        )
      }
      if (body.status && !VALID_STATUSES.has(body.status)) {
        return NextResponse.json(
          { success: false, message: "invalid status" },
          { status: 400 },
        )
      }
      const performedById = ctx.session?.user?.id ?? null
      try {
        const row = await createAffiliate({
          email: body.email,
          name: body.name,
          phone: body.phone ?? null,
          tier: body.tier,
          status: body.status,
          parentAffiliateId: body.parentAffiliateId ?? null,
          linkedUserId: body.linkedUserId ?? null,
          payoutMethod: body.payoutMethod,
          kycLite: body.kycLite,
          notes: body.notes ?? null,
          password: body.password ?? null,
          affiliateCode: body.affiliateCode ?? null,
          createdById: performedById,
        })
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "create failed",
          },
          { status: 400 },
        )
      }
    },
  )
}
