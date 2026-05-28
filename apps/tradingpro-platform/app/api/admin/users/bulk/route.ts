/**
 * @file route.ts
 * @module admin-console
 * @description API route for bulk user operations
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users/bulk",
      required: "admin.users.manage",
      fallbackMessage: "Failed to perform bulk operation",
    },
    async ({ logger }) => {
      const body = await req.json()
      const { userIds, action, isActive } = body

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "userIds must be a non-empty array",
          statusCode: 400,
        })
      }

      if (action === "updateStatus" && typeof isActive !== "boolean") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "isActive must be a boolean for updateStatus action",
          statusCode: 400,
        })
      }

      logger.debug({ action, userCount: userIds.length }, "POST /api/admin/users/bulk - request")

      const adminService = createAdminUserService()
      let result

      switch (action) {
        case "updateStatus":
          result = await adminService.bulkUpdateStatus(userIds, isActive)
          break
        default:
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Invalid action. Supported: updateStatus",
            statusCode: 400,
          })
      }

      logger.info({ affected: result.count }, "POST /api/admin/users/bulk - success")
      return NextResponse.json({ success: true, affected: result.count }, { status: 200 })
    }
  )
}
