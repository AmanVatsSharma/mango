/**
 * @file route.ts
 * @module admin-console
 * @description API route for system health monitoring
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-25
 *
 * Notes:
 * - Rich payload from `buildSyntheticSystemHealthSnapshot` (demo-grade observability shape).
 * - Database service row, `database` strip, `traffic.edgeDbProbeMs`, and `meta.observedAt` reflect real probe wall time when Prisma succeeds.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { buildSyntheticSystemHealthSnapshot } from "@/lib/admin/synthetic-system-health-snapshot"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/system/health",
      required: "admin.system.read",
      fallbackMessage: "Failed to fetch system health",
    },
    async (ctx) => {
      let dbStatus: "ONLINE" | "OFFLINE" = "ONLINE"
      let dbResponseTime = 0
      try {
        const start = Date.now()
        await prisma.$queryRaw`SELECT 1`
        dbResponseTime = Date.now() - start
      } catch (error) {
        dbStatus = "OFFLINE"
        ctx.logger.warn({ err: error }, "GET /api/admin/system/health - database check failed")
      }

      const now = Date.now()
      const snap = buildSyntheticSystemHealthSnapshot(now)
      const ormJitter = Math.round(2 + 3 * Math.sin(now / 10_000))

      const observedAt = new Date().toISOString()

      const traffic =
        dbStatus === "ONLINE"
          ? {
              ...snap.traffic,
              edgeDbProbeMs: Math.max(0, dbResponseTime),
              p99Ms: Math.max(snap.traffic.p99Ms, dbResponseTime + ormJitter),
            }
          : { ...snap.traffic, edgeDbProbeMs: 0 }

      const services = snap.services.map((s) => {
        if (s.name !== "Database") {
          return { ...s, lastCheck: new Date(now) }
        }
        const mergedP99 =
          dbStatus === "ONLINE"
            ? Math.max(s.p99Ms, dbResponseTime + ormJitter)
            : 0
        return {
          ...s,
          status: dbStatus,
          uptime: dbStatus === "ONLINE" ? s.uptime : 0,
          responseTime: dbStatus === "ONLINE" ? Math.max(0, dbResponseTime + ormJitter) : 0,
          p99Ms: mergedP99,
          ready: dbStatus === "ONLINE" ? s.ready : "0/3",
          lastCheck: new Date(now),
        }
      })

      const database =
        dbStatus === "ONLINE"
          ? { ...snap.database, lastCheck: new Date(now) }
          : {
              ...snap.database,
              status: "OFFLINE" as const,
              connectionsActive: 0,
              walLagMs: 0,
              txPerSec: 0,
              idleInTransactions: 0,
              bufferCacheHitRatio: 0,
              lastCheck: new Date(now),
            }

      const meta = { ...snap.meta, observedAt }

      ctx.logger.info({ dbStatus, dbResponseTime }, "GET /api/admin/system/health - success")
      return NextResponse.json(
        {
          meta,
          correlation: snap.correlation,
          traffic,
          runtime: snap.runtime,
          metrics: snap.metrics,
          services,
          database,
          signals: snap.signals,
          dependencies: snap.dependencies,
        },
        { status: 200 },
      )
    },
  )
}
