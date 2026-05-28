/**
 * @file route.ts
 * @module admin-console
 * @description API route for manually verifying user email or phone
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
      route: `/api/admin/users/${params.userId}/verify-contact`,
      required: "admin.users.manage",
      fallbackMessage: "Failed to verify contact",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()
      const { type } = body

      if (!type || !["email", "phone"].includes(type)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Type must be 'email' or 'phone'",
          statusCode: 400,
        })
      }

      ctx.logger.debug({ userId, type }, "POST /api/admin/users/[userId]/verify-contact - request")

      const adminService = createAdminUserService()
      const user = await adminService.verifyContact(userId, type as "email" | "phone")

      ctx.logger.info({ userId, type }, "POST /api/admin/users/[userId]/verify-contact - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}
