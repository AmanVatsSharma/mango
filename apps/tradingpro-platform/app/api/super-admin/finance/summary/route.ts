/**
 * @file route.ts
 * @module admin-console
 * @description API route for super-admin financial summary
 * @author StockTrade
 * @created 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/summary",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch financial summary",
    },
    async (ctx) => {
      const { searchParams } = new URL(ctx.req.url)
      const from = searchParams.get("from") ? new Date(searchParams.get("from") as string) : undefined
      const to = searchParams.get("to") ? new Date(searchParams.get("to") as string) : undefined

      const data = await SuperAdminFinanceService.getSummary(from, to)
      return NextResponse.json({ success: true, data })
    }
  )
}
