/**
 * @file route.ts
 * @module cron
 * @description Purge resolved security incidents per SESSION_SECURITY_POLICY_V1 retention (CRON_SECRET).
 * @author StockTrade
 * @created 2026-03-28
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { loadSessionSecurityPolicy } from "@/lib/session-security/session-security-policy"
import { purgeStaleResolvedSecurityIncidents } from "@/lib/session-security/incident-retention"

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers.get("authorization")?.trim()
  if (header === `Bearer ${secret}`) return true
  const q = new URL(req.url).searchParams.get("secret")
  return q === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const policy = await loadSessionSecurityPolicy()
  const deleted = await purgeStaleResolvedSecurityIncidents(policy.resolvedIncidentRetentionDays)
  return NextResponse.json({
    success: true,
    data: {
      deleted,
      retentionDays: policy.resolvedIncidentRetentionDays,
    },
  })
}
