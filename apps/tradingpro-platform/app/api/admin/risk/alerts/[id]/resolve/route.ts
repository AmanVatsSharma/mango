/**
 * @file route.ts
 * @module admin-console
 * @description API route for resolving risk alerts
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/alerts/[id]/resolve",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to resolve alert",
    },
    async (ctx) => {
      const { id } = params
      const userId = ctx.session.user.id

      ctx.logger.debug({ alertId: id, userId }, "POST /api/admin/risk/alerts/[id]/resolve - request")

      const alert = await prisma.riskAlert.update({
        where: { id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
        },
      })

      ctx.logger.info({ alertId: alert.id }, "POST /api/admin/risk/alerts/[id]/resolve - success")

      return NextResponse.json(
        {
          success: true,
          alert: {
            id: alert.id,
            resolved: alert.resolved,
            resolvedAt: alert.resolvedAt,
          },
        },
        { status: 200 }
      )
    }
  )
}
