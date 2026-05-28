/**
 * File: app/api/super-admin/finance/commission-rules/route.ts
 * Module: admin-console
 * Purpose: Read and update super-admin commission rules.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Uses RBAC permissions for read/manage access.
 * - Emits structured logs with IST timestamps.
 */

import { NextResponse } from "next/server"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/commission-rules",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch commission rules",
    },
    async () => {
      const rules = await SuperAdminFinanceService.getCommissionRules()
      return NextResponse.json({ success: true, data: rules })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/commission-rules",
      required: "admin.super.financial.manage",
      fallbackMessage: "Failed to update commission rules",
    },
    async (ctx) => {
      const body = await ctx.req.json()
      await SuperAdminFinanceService.updateCommissionRules(body)
      return NextResponse.json({ success: true })
    }
  )
}
