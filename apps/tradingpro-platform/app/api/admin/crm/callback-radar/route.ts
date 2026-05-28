/**
 * @file route.ts
 * @module admin-console
 * @description Aggregated callback/task radar for CRM operators (scoped book for MODERATOR).
 * @author StockTrade
 * @created 2026-04-07
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { createClientCrmService } from "@/lib/services/admin/client-crm.service"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/crm/callback-radar",
      required: "admin.users.crm",
      fallbackMessage: "Failed to load callback radar",
    },
    async (ctx) => {
      const svc = createClientCrmService()
      const radar = await svc.getCallbackRadar(ctx.role, ctx.session.user.id)
      ctx.logger.debug({ radar }, "GET callback-radar - success")
      return NextResponse.json({ success: true, radar })
    },
  )
}
