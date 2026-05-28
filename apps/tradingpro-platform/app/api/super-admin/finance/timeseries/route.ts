/**
 * @file route.ts
 * @module admin-console
 * @description API route for super-admin finance timeseries
 * @author StockTrade
 * @created 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"
import { AppError } from "@/src/common/errors"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/timeseries",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch timeseries data",
    },
    async (ctx) => {
      const { searchParams } = new URL(ctx.req.url)
      const granularity = (searchParams.get("granularity") || "day") as any
      const from = new Date(searchParams.get("from") || "")
      const to = new Date(searchParams.get("to") || "")

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid from/to dates",
          statusCode: 400,
        })
      }

      const data = await SuperAdminFinanceService.getTimeSeries(granularity, from, to)
      return NextResponse.json({ success: true, data })
    }
  )
}
