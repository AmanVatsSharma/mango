/**
 * @file route.ts
 * @module admin-console
 * @description API route for resetting user MPIN
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
      route: `/api/admin/users/${params.userId}/reset-mpin`,
      required: "admin.users.credentials",
      fallbackMessage: "Failed to reset MPIN",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()
      const { mpin } = body

      if (!mpin || mpin.length !== 4 || !/^\d{4}$/.test(mpin)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "MPIN must be exactly 4 digits",
          statusCode: 400,
        })
      }

      ctx.logger.debug({ userId }, "POST /api/admin/users/[userId]/reset-mpin - request")

      const adminService = createAdminUserService()
      const user = await adminService.resetMPIN(userId, mpin)

      ctx.logger.info({ userId }, "POST /api/admin/users/[userId]/reset-mpin - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}
