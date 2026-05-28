/**
 * @file route.ts
 * @module admin-console
 * @description API route for resetting user password
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { AppError } from "@/src/common/errors"

export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/reset-password`,
      required: "admin.users.credentials",
      fallbackMessage: "Failed to reset password",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()
      const { password } = body

      if (!password || password.length < 6) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Password must be at least 6 characters",
          statusCode: 400,
        })
      }

      ctx.logger.debug({ userId }, "POST /api/admin/users/[userId]/reset-password - request")

      const adminService = createAdminUserService()
      const user = await adminService.resetPassword(userId, password)

      ctx.logger.info({ userId }, "POST /api/admin/users/[userId]/reset-password - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}
