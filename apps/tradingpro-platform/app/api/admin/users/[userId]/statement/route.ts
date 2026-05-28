/**
 * @file route.ts
 * @module admin-console
 * @description GET admin user statement: count-reconciled ledger + trades + funds (default 90d window).
 * @author StockTrade
 * @created 2026-03-30
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { AppError } from "@/src/common/errors"

function parseBoundary(value: string | null, label: string): Date | undefined {
  if (value === null || value.trim() === "") return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label}`)
  }
  return d
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/statement`,
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch user statement",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const userId = params.userId

      const fromRaw = searchParams.get("dateFrom") ?? searchParams.get("from")
      const toRaw = searchParams.get("dateTo") ?? searchParams.get("to")

      const dateFrom = parseBoundary(fromRaw, "dateFrom")
      const dateTo = parseBoundary(toRaw, "dateTo")

      ctx.logger.debug({ userId, dateFrom, dateTo }, "statement - request")

      const adminService = createAdminUserService()
      const statement = await adminService.getUserStatementPayload(userId, { dateFrom, dateTo })

      if (!statement) {
        throw new AppError({
          code: "USER_NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      ctx.logger.info(
        {
          userId,
          ledger: statement.counts.transactions,
          trades: statement.counts.orders,
        },
        "statement - success",
      )

      return NextResponse.json({ success: true, statement }, { status: 200 })
    },
  )
}
