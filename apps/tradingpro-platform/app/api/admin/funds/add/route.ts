/**
 * @file route.ts
 * @module admin-console
 * @description API route for admin manual fund addition to user accounts
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminFundService } from "@/lib/services/admin/AdminFundService"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { AppError } from "@/src/common/errors"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/funds/add",
      required: "admin.funds.manage",
      fallbackMessage: "Failed to add funds",
    },
    async (ctx) => {
      const body = await req.json()
      const { userId, amount, description } = body

      ctx.logger.debug({ userId, amount }, "POST /api/admin/funds/add - request")

      if (!userId || !amount || amount <= 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid input. userId and positive amount required",
          statusCode: 400,
        })
      }

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })

      const adminFundService = createAdminFundService(tradingLogger)
      const result = await adminFundService.addFundsToUser({
        userId,
        amount,
        description: description || "Manual fund addition by admin",
        adminId: ctx.session.user.id!,
        adminName: ctx.session.user.name || "Admin",
      })

      ctx.logger.info({ userId, amount }, "POST /api/admin/funds/add - success")
      return NextResponse.json(result, { status: 200 })
    }
  )
}