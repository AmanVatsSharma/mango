/**
 * @file route.ts
 * @module admin-console
 * @description API route for freezing/unfreezing user accounts
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
      route: `/api/admin/users/${params.userId}/freeze`,
      required: "admin.users.manage",
      fallbackMessage: "Failed to freeze/unfreeze account",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()
      const { freeze, reason } = body

      if (typeof freeze !== "boolean") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Freeze must be a boolean value",
          statusCode: 400,
        })
      }

      ctx.logger.debug({ userId, freeze, hasReason: !!reason }, "POST /api/admin/users/[userId]/freeze - request")

      const adminService = createAdminUserService()
      const actorId = typeof ctx.session?.user?.id === "string" ? ctx.session.user.id : null
      const user = await adminService.freezeAccount(userId, freeze, reason, actorId)

      ctx.logger.info({ userId, freeze }, "POST /api/admin/users/[userId]/freeze - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}
