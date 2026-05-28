/**
 * @file route.ts
 * @module admin-console
 * @description API route for individual user management operations (GET, PUT)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-07 — PUT passes actorUserId for OTP preference audit.
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { AppError } from "@/src/common/errors"
import { resolveKycDocumentUrl } from "@/lib/kyc-document"

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}`,
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch user details",
    },
    async (ctx) => {
      const userId = params.userId
      ctx.logger.debug({ userId }, "GET /api/admin/users/[userId] - request")

      const adminService = createAdminUserService()
      const user = await adminService.getUserDetails(userId)

      if (!user) {
        throw new AppError({
          code: "USER_NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      const resolvedKycDocumentUrl = user.kyc
        ? await resolveKycDocumentUrl({
            bankProofKey: user.kyc.bankProofKey,
            bankProofUrl: user.kyc.bankProofUrl,
          })
        : null

      const hydratedUser = user.kyc
        ? {
            ...user,
            kyc: {
              ...user.kyc,
              bankProofUrl: resolvedKycDocumentUrl || user.kyc.bankProofUrl,
            },
          }
        : user

      ctx.logger.info({ userId }, "GET /api/admin/users/[userId] - success")
      return NextResponse.json({ success: true, user: hydratedUser }, { status: 200 })
    }
  )
}

export async function PUT(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}`,
      required: "admin.users.manage",
      fallbackMessage: "Failed to update user",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()

      ctx.logger.debug({ userId }, "PUT /api/admin/users/[userId] - request")

      const adminService = createAdminUserService()
      const targetUser = await adminService.getUserDetails(userId)
      if (!targetUser) {
        throw new AppError({
          code: "USER_NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      // 🔐 SECURITY: Prevent privilege escalation
      if (targetUser.role === "ADMIN" || targetUser.role === "SUPER_ADMIN") {
        if (ctx.role !== "SUPER_ADMIN") {
          ctx.logger.warn(
            { userId, targetRole: targetUser.role, actorRole: ctx.role },
            "Security restriction hit"
          )
          throw new AppError({
            code: "SECURITY_RESTRICTION",
            message: "Security restriction: Only Super Admins can modify Admin or Super Admin users",
            statusCode: 403,
          })
        }
      }

      if (body.role && (body.role === "ADMIN" || body.role === "SUPER_ADMIN")) {
        if (ctx.role !== "SUPER_ADMIN") {
          ctx.logger.warn({ userId, attemptedRole: body.role, actorRole: ctx.role }, "Security restriction hit")
          throw new AppError({
            code: "SECURITY_RESTRICTION",
            message: "Security restriction: Only Super Admins can assign Admin or Super Admin roles",
            statusCode: 403,
          })
        }
      }

      const actorUserId =
        ctx.session?.user && typeof (ctx.session.user as { id?: string }).id === "string"
          ? (ctx.session.user as { id: string }).id
          : null
      const user = await adminService.updateUser(userId, body as Record<string, unknown>, {
        actorUserId,
      })
      ctx.logger.info({ userId }, "PUT /api/admin/users/[userId] - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}