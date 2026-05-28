/**
 * @file route.ts
 * @module api/auth
 * @description NextAuth App Router handlers; GET wraps `handlers.GET` to optionally audit `/session` JSON (no secrets).
 * @author StockTrade
 * @created 2026-03-28
 */

import { handlers } from "@/auth"
import { authSessionRouteAudit } from "@/lib/auth-session-debug"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const res = await handlers.GET(req)
  await authSessionRouteAudit(req, res)
  return res
}

export async function POST(req: NextRequest) {
  return handlers.POST(req)
}
