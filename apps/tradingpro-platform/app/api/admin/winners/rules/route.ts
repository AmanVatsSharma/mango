/**
 * @file app/api/admin/winners/rules/route.ts
 * @module api/admin/winners
 * @description GET current auto-promotion thresholds. Phase 9 ships read-only;
 *              tunable knobs land in Phase 13 (House Risk Controls page) where the
 *              surveillance team owns them.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getRulesConfig } from "@/lib/winners/rule-engine"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/winners/rules", required: "admin.house.winner" },
    async () => {
      const rules = getRulesConfig()
      return NextResponse.json({ success: true, rules })
    },
  )
}
