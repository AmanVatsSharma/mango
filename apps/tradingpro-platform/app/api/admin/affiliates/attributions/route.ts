/**
 * @file app/api/admin/affiliates/attributions/route.ts
 * @module api/admin/affiliates
 * @description GET — paginated attribution feed (filterable by affiliate / source / live status).
 *              POST — manual re-attribution by an admin (action="REATTRIBUTE"); writes a
 *                     new row, deletes the old (FK-cascade-safe) and emits a TradingLog audit row.
 *
 *              GET requires admin.affiliate.read.
 *              POST requires admin.affiliate.manage.
 *
 *              POST body:
 *                {
 *                  action: "REATTRIBUTE",
 *                  userId: string,
 *                  affiliateCode: string,
 *                  reason: string,
 *                  utm?: Record<string,string>
 *                }
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { reattributeManually } from "@/lib/affiliate/attribution"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/affiliates/attributions", required: "admin.affiliate.read" },
    async () => {
      const url = new URL(req.url)
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "50"), 200))
      const page = Math.max(0, Number(url.searchParams.get("page") ?? "0"))

      const where: Prisma.AffiliateAttributionWhereInput = {}
      const affiliateId = url.searchParams.get("affiliateId")
      if (affiliateId) where.affiliateId = affiliateId
      const userId = url.searchParams.get("userId")
      if (userId) where.userId = userId
      const source = url.searchParams.get("source")
      if (source) where.source = source
      const liveOnly = url.searchParams.get("liveOnly") === "true"
      if (liveOnly) {
        where.replacedById = null
        where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }

      const [total, rows] = await Promise.all([
        prisma.affiliateAttribution.count({ where }),
        prisma.affiliateAttribution.findMany({
          where,
          skip: page * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, email: true, clientId: true } },
            affiliate: { select: { id: true, affiliateCode: true, name: true, tier: true } },
          },
        }),
      ])
      return NextResponse.json({ success: true, rows, total, page, limit })
    },
  )
}

interface PostBody {
  action?: "REATTRIBUTE"
  userId?: string
  affiliateCode?: string
  reason?: string
  utm?: Record<string, string | null | undefined> | null
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/affiliates/attributions", required: "admin.affiliate.manage" },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as PostBody | null
      if (
        !body ||
        body.action !== "REATTRIBUTE" ||
        !body.userId ||
        !body.affiliateCode ||
        !body.reason ||
        !body.reason.trim()
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "REATTRIBUTE requires userId, affiliateCode, and reason",
          },
          { status: 400 },
        )
      }
      const adminId = ctx.session?.user?.id
      if (!adminId) {
        return NextResponse.json(
          { success: false, message: "session missing user id" },
          { status: 401 },
        )
      }
      try {
        const result = await reattributeManually({
          userId: body.userId,
          affiliateCode: body.affiliateCode,
          attributedById: adminId,
          reason: body.reason,
          utm: body.utm ?? null,
        })
        // Audit emit — best-effort; failures don't roll the re-attribution back.
        await prisma.tradingLog
          .create({
            data: {
              clientId: body.userId,
              userId: adminId,
              action: "AFFILIATE_REATTRIBUTE",
              message: `Manual re-attribution to ${body.affiliateCode}: ${body.reason}`,
              details: {
                newAttributionId: result.attributionId,
                replacedAttributionId: result.replacedAttributionId,
              },
              category: "SYSTEM",
              level: "INFO",
            },
          })
          .catch(() => null)
        return NextResponse.json({ success: true, ...result })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "reattribution failed" },
          { status: 400 },
        )
      }
    },
  )
}
