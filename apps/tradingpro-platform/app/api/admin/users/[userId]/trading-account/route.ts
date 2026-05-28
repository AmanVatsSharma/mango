/**
 * @file route.ts
 * @module admin-console
 * @description API endpoint for super admins to update trading account funds
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminUsersOptionalNonNegativeAmount,
  normalizeAdminUsersOutputNumber,
} from "@/lib/server/admin-users-number-utils"

export async function PUT(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/trading-account`,
      required: "admin.funds.override",
      fallbackMessage: "Failed to update trading account funds",
    },
    async (ctx) => {
      const userId = params.userId?.trim()
      if (!userId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "userId is required", statusCode: 400 })
      }
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const { balance, availableMargin, usedMargin, reason } = body
      const normalizedBalance = normalizeAdminUsersOptionalNonNegativeAmount(balance)
      const normalizedAvailableMargin = normalizeAdminUsersOptionalNonNegativeAmount(availableMargin)
      const normalizedUsedMargin = normalizeAdminUsersOptionalNonNegativeAmount(usedMargin)

      ctx.logger.debug(
        {
          userId,
          balance: normalizedBalance,
          availableMargin: normalizedAvailableMargin,
          usedMargin: normalizedUsedMargin,
          hasReason: !!reason,
        },
        "PUT /api/admin/users/[userId]/trading-account - request"
      )

      if (balance === undefined && availableMargin === undefined && usedMargin === undefined) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "At least one field (balance, availableMargin, or usedMargin) must be provided",
          statusCode: 400,
        })
      }
      if (normalizedBalance === null || normalizedAvailableMargin === null || normalizedUsedMargin === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "balance, availableMargin, and usedMargin must be non-negative numbers",
          statusCode: 400,
        })
      }

      const adminService = createAdminUserService()
      const updatedAccount = await adminService.updateTradingAccountFunds(
        userId,
        {
          ...(normalizedBalance !== undefined && { balance: normalizedBalance }),
          ...(normalizedAvailableMargin !== undefined && { availableMargin: normalizedAvailableMargin }),
          ...(normalizedUsedMargin !== undefined && { usedMargin: normalizedUsedMargin }),
        },
        reason
      )

      ctx.logger.info({ userId }, "PUT /api/admin/users/[userId]/trading-account - success")

      return NextResponse.json(
        {
          success: true,
          tradingAccount: {
            id: updatedAccount.id,
            balance: normalizeAdminUsersOutputNumber(updatedAccount.balance),
            availableMargin: normalizeAdminUsersOutputNumber(updatedAccount.availableMargin),
            usedMargin: normalizeAdminUsersOutputNumber(updatedAccount.usedMargin),
          },
        },
        { status: 200 }
      )
    }
  )
}
