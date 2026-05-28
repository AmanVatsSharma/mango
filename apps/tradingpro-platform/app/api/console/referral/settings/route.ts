/**
 * @file route.ts
 * @module app/api/console/referral/settings
 * @description GET/PATCH — user referral preferences (slim GET; PATCH updates marketing opt-in).
 * @author StockTrade
 * @created 2026-04-02
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import {
  getReferralUserSettingsOnly,
  patchReferralUserMarketingOptIn,
} from "@/lib/services/referral/referral-user-dashboard"

const patchBody = z.object({
  marketingOptIn: z.boolean(),
})

export async function GET() {
  try {
    const session = await auth()
    const userId = (session?.user as { id?: string })?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const data = await getReferralUserSettingsOnly(userId)
    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load settings"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth()
    const userId = (session?.user as { id?: string })?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const json = await req.json().catch(() => ({}))
    const parsed = patchBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = await patchReferralUserMarketingOptIn(userId, parsed.data.marketingOptIn)
    return NextResponse.json({ success: true, data }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save settings"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
