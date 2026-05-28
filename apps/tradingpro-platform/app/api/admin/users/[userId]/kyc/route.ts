/**
 * @file route.ts
 * @module admin-console
 * @description API route for managing user KYC status
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { KycStatus } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/kyc`,
      required: "admin.users.kyc",
      fallbackMessage: "Failed to update KYC status",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json()
      const { status, reason } = body

      if (!status || !["APPROVED", "REJECTED", "PENDING"].includes(status)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid KYC status. Must be APPROVED, REJECTED, or PENDING",
          statusCode: 400,
        })
      }

      ctx.logger.debug({ userId, status, hasReason: !!reason }, "POST /api/admin/users/[userId]/kyc - request")

      const adminService = createAdminUserService()
      const kyc = await adminService.updateKYCStatus(userId, status as KycStatus, reason)

      ctx.logger.info({ userId, status }, "POST /api/admin/users/[userId]/kyc - success")
      return NextResponse.json({ success: true, kyc }, { status: 200 })
    }
  )
}
