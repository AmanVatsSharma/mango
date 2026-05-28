/**
 * @file route.ts
 * @module admin-console
 * @description API route for super-admin top users (deposits/withdrawals/etc)
 * @author StockTrade
 * @created 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"
import { AppError } from "@/src/common/errors"
import { normalizeApiBoundedInteger, normalizeApiOptionalDate } from "@/lib/server/api-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/top-users",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch top users",
    },
    async (ctx) => {
      const { searchParams } = new URL(ctx.req.url)
      const by = (searchParams.get("by") || "deposits") as any
      const limit = normalizeApiBoundedInteger(searchParams.get("limit"), 10, 1, 200)
      const fromRaw = searchParams.get("from")
      const toRaw = searchParams.get("to")
      const from = normalizeApiOptionalDate(fromRaw)
      const to = normalizeApiOptionalDate(toRaw)

      if (fromRaw !== null && fromRaw.trim() !== "" && !from) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid from date", statusCode: 400 })
      }
      if (toRaw !== null && toRaw.trim() !== "" && !to) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid to date", statusCode: 400 })
      }

      const data = await SuperAdminFinanceService.getTopUsers(by, limit, from, to)
      return NextResponse.json({ success: true, data })
    }
  )
}
