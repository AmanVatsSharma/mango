/**
 * @file route.ts
 * @module admin-console
 * @description Audit log when admins open or copy full payout bank details (requires sensitive permission).
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { hasPermission } from "@/lib/rbac/admin-guard"
import { createAdminFundService } from "@/lib/services/admin/AdminFundService"
import { AppError } from "@/src/common/errors"

type PayoutAccessBody = {
  withdrawalId?: string
  bankAccountId?: string
  targetUserId?: string
  event?: string
  field?: string
  revealedFullDetails?: boolean
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/payout-sensitive-access",
      required: "admin.withdrawals.manage",
      fallbackMessage: "Failed to record payout access",
    },
    async ({ session, role, permissions, logger }) => {
      const body = (await req.json().catch(() => null)) as PayoutAccessBody | null
      if (!body || typeof body !== "object") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          statusCode: 400,
        })
      }

      const event = body.event === "COPY_SENSITIVE" ? "COPY_SENSITIVE" : "OPEN_PAYOUT_DETAILS"
      const needsSensitive =
        event === "COPY_SENSITIVE" || Boolean(body.revealedFullDetails)

      if (
        needsSensitive &&
        !hasPermission(permissions, ["admin.all", "admin.users.bank.sensitive"], "any")
      ) {
        throw new AppError({
          code: "FORBIDDEN",
          message: "Insufficient permission for sensitive payout details",
          statusCode: 403,
        })
      }

      if (!body.targetUserId || typeof body.targetUserId !== "string") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "targetUserId is required",
          statusCode: 400,
        })
      }

      const fundService = createAdminFundService()
      await fundService.logPayoutSensitiveAccess({
        adminId: session.user.id!,
        adminName: session.user.name || "Admin",
        targetUserId: body.targetUserId,
        withdrawalId: typeof body.withdrawalId === "string" ? body.withdrawalId : undefined,
        bankAccountId: typeof body.bankAccountId === "string" ? body.bankAccountId : undefined,
        event,
        field: typeof body.field === "string" ? body.field : undefined,
        actorRole: role,
      })

      logger.info({ withdrawalId: body.withdrawalId, event }, "POST payout-sensitive-access recorded")
      return NextResponse.json({ success: true }, { status: 200 })
    }
  )
}
