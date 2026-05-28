/**
 * @file route.ts
 * @module admin-console
 * @description API route for risk alerts
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/alerts",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk alerts",
    },
    async (ctx) => {
      ctx.logger.debug({}, "GET /api/admin/risk/alerts - start")

      const alerts = await prisma.riskAlert.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      })

      const formattedAlerts = alerts.map((alert) => ({
        id: alert.id,
        userId: alert.userId,
        userName: alert.user?.name || alert.user?.email || "Unknown",
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.createdAt,
        resolved: alert.resolved,
      }))

      ctx.logger.info({ count: formattedAlerts.length }, "GET /api/admin/risk/alerts - success")

      return NextResponse.json({ alerts: formattedAlerts }, { status: 200 })
    }
  )
}
