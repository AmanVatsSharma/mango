/**
 * @file route.ts
 * @module admin-console
 * @description Admin API: list users sharing normalized email or phone with a target user (related accounts).
 * @author StockTrade
 * @created 2026-04-03
 * @updated 2026-04-03 — Per-admin rate limit; trading_logs audit row (no PII).
 *
 * Notes:
 * - MODERATOR may only query users they manage; related rows are book-scoped to the same RM.
 * - Logs use allowlisted fields only (targetUserId, relatedCount, request path).
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { queryAdminRelatedUsers } from "@/lib/server/admin-related-users"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { checkRateLimit, getRateLimitKey, RateLimitPresets } from "@/lib/services/security/RateLimiter"

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const { userId } = params

  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${userId}/related`,
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch related users",
    },
    async (ctx) => {
      const rlKey = getRateLimitKey("admin_related_users", ctx.session.user.id)
      const rl = checkRateLimit(rlKey, RateLimitPresets.STRICT)
      if (!rl.allowed) {
        throw new AppError({
          code: "RATE_LIMIT",
          message: RateLimitPresets.STRICT.message ?? "Too many requests",
          statusCode: 429,
          details: { retryAfter: rl.retryAfter },
        })
      }

      ctx.logger.debug({ targetUserId: userId }, "GET /api/admin/users/[userId]/related - request")

      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, managedById: true },
      })

      if (!target) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      if (ctx.role === "MODERATOR" && target.managedById !== ctx.session.user.id) {
        throw new AppError({
          code: "FORBIDDEN",
          message: "You can only view related accounts for users assigned to you",
          statusCode: 403,
        })
      }

      const bookScopedRmId = ctx.role === "MODERATOR" ? ctx.session.user.id : null
      const related = await queryAdminRelatedUsers(prisma, userId, bookScopedRmId)

      const payload = related.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        clientId: r.clientId,
        createdAt: r.createdAt.toISOString(),
        kycStatus: r.kycStatus ?? "NOT_SUBMITTED",
      }))

      ctx.logger.info(
        { targetUserId: userId, relatedCount: payload.length },
        "GET /api/admin/users/[userId]/related - success",
      )

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })
      await tradingLogger.info(
        "ADMIN_RELATED_USERS_VIEW",
        "Admin fetched related accounts for a user",
        { targetUserId: userId, relatedCount: payload.length },
      )

      return NextResponse.json({ related: payload }, { status: 200 })
    },
  )
}
