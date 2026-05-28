/**
 * @file route.ts
 * @module admin-api/session-security
 * @description GET aggregates for session security command-center (cached).
 * @author StockTrade
 * @created 2026-03-28
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getSessionSecurityOverview } from "@/lib/session-security/overview"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/overview",
      required: "admin.session-security.read",
      fallbackMessage: "Failed to load session security overview",
    },
    async () => {
      const overview = await getSessionSecurityOverview()
      return NextResponse.json({ success: true, data: { overview } })
    },
  )
}
