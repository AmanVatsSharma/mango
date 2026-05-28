/**
 * @file route.ts
 * @module admin-console
 * @description Admin API: grouped contact clusters (normalized email / phone tail) for duplicate-aware UX.
 * @author StockTrade
 * @created 2026-04-03
 *
 * Notes:
 * - RBAC: admin.users.read; MODERATOR sees only clusters within their assigned book.
 * - Rate-limited per admin user; audit log via TradingLogger (no raw PII in message).
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  buildAdminContactClustersFromRows,
  queryAdminContactClusterRows,
} from "@/lib/server/admin-contact-clusters"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { checkRateLimit, getRateLimitKey, RateLimitPresets } from "@/lib/services/security/RateLimiter"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users/contact-clusters",
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch contact clusters",
    },
    async (ctx) => {
      const limitKey = getRateLimitKey("admin_contact_clusters", ctx.session.user.id)
      const rl = checkRateLimit(limitKey, RateLimitPresets.STANDARD)
      if (!rl.allowed) {
        throw new AppError({
          code: "RATE_LIMIT",
          message: RateLimitPresets.STANDARD.message ?? "Too many requests",
          statusCode: 429,
          details: { retryAfter: rl.retryAfter },
        })
      }

      ctx.logger.debug({}, "GET /api/admin/users/contact-clusters - request")

      const bookScopedRmId = ctx.role === "MODERATOR" ? ctx.session.user.id : null
      const rows = await queryAdminContactClusterRows(prisma, bookScopedRmId)
      const clusters = buildAdminContactClustersFromRows(rows)

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })
      await tradingLogger.info(
        "ADMIN_CONTACT_CLUSTERS_VIEW",
        "Admin listed contact duplicate clusters",
        { clusterCount: clusters.length, memberRowCount: rows.length },
      )

      ctx.logger.info(
        { clusterCount: clusters.length, memberRowCount: rows.length },
        "GET /api/admin/users/contact-clusters - success",
      )

      return NextResponse.json({ clusters }, { status: 200 })
    },
  )
}
