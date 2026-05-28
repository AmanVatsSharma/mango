/**
 * @file route.ts
 * @module admin-api/session-security
 * @description List user session registry rows (paginated) and revoke by jti or all for a user.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 */

import { NextResponse } from "next/server"
import type { Prisma, UserSessionKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { revokeAllSessionsForUser, revokeJti } from "@/lib/session-security/registry"
import { authLogger } from "@/lib/auth-logger"

const KINDS = new Set<UserSessionKind>(["WEB_JWT", "MOBILE_SESSION_AUTH", "REGISTRATION_SIGHTING"])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/sessions",
      required: "admin.session-security.read",
      fallbackMessage: "Failed to list sessions",
    },
    async () => {
      const { searchParams } = new URL(req.url)
      const userId = searchParams.get("userId")?.trim() || undefined
      const kindParam = searchParams.get("kind")?.trim() || undefined
      const page = Math.max(0, Number(searchParams.get("page") || "0") || 0)
      const limit = Math.min(150, Math.max(1, Number(searchParams.get("limit") || "50") || 50))

      const where: Prisma.UserSessionRecordWhereInput = {}
      if (userId) where.userId = userId
      if (kindParam && KINDS.has(kindParam as UserSessionKind)) {
        where.kind = kindParam as UserSessionKind
      }

      const [total, sessions] = await Promise.all([
        prisma.userSessionRecord.count({ where }),
        prisma.userSessionRecord.findMany({
          where,
          orderBy: { lastSeenAt: "desc" },
          skip: page * limit,
          take: limit,
          include: {
            user: { select: { id: true, email: true, clientId: true } },
          },
        }),
      ])

      return NextResponse.json({
        success: true,
        data: { sessions, total, page, limit },
      })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/sessions",
      required: "admin.session-security.manage",
      fallbackMessage: "Failed to revoke session",
    },
    async ({ session }) => {
      const adminId = session?.user?.id as string | undefined
      const body = (await req.json().catch(() => null)) as {
        jti?: string
        userId?: string
        revokeAllForUser?: boolean
        reason?: string
      } | null

      if (body?.revokeAllForUser && body.userId) {
        const n = await revokeAllSessionsForUser(body.userId)
        await authLogger.logEvent({
          userId: body.userId,
          eventType: "SESSION_INVALIDATED",
          severity: "MEDIUM",
          message: body.reason
            ? `Admin revoked all sessions (${body.reason})`
            : "Admin revoked all sessions for user",
          metadata: { adminUserId: adminId, reason: body.reason ?? "" },
        })
        return NextResponse.json({ success: true, data: { revoked: n } })
      }

      if (body?.jti) {
        const row = await prisma.userSessionRecord.findFirst({
          where: { jti: body.jti },
          select: { userId: true },
        })
        await revokeJti(body.jti)
        if (row?.userId) {
          await authLogger.logEvent({
            userId: row.userId,
            eventType: "SESSION_INVALIDATED",
            severity: "LOW",
            message: body.reason ? `Admin revoked session (${body.reason})` : "Admin revoked session (jti)",
            metadata: { jti: body.jti, adminUserId: adminId, reason: body.reason ?? "" },
          })
        }
        return NextResponse.json({ success: true, data: { revoked: 1 } })
      }

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Provide jti or { userId, revokeAllForUser: true }",
        statusCode: 400,
      })
    },
  )
}
