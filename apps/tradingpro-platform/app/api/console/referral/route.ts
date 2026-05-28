/**
 * @file route.ts
 * @module app/api/console/referral
 * @description User referral dashboard payload (invite link, referees, rewards).
 * @author StockTrade
 * @created 2026-04-01
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getReferralUserDashboard } from "@/lib/services/referral/referral-user-dashboard"

export async function GET() {
  try {
    const session = await auth()
    const userId = (session?.user as { id?: string })?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await getReferralUserDashboard(userId)
    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load referral data"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
