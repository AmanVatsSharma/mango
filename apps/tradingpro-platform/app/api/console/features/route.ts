/**
 * File: app/api/console/features/route.ts
 * Module: console
 * Purpose: Expose end-user feature availability (e.g., statementsEnabled).
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - This endpoint is user-scoped and requires an authenticated session.
 * - The result is derived from SystemSettings global + per-user override.
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getEffectiveStatementsEnabledForUser } from "@/lib/server/console-statements"

export async function GET() {
  try {
    const session = await auth()
    const userId = (session?.user as any)?.id as string | undefined

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolution = await getEffectiveStatementsEnabledForUser(userId)

    return NextResponse.json(
      {
        success: true,
        statementsEnabled: resolution.enabled,
        source: resolution.source,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("❌ [API-CONSOLE-FEATURES] GET error", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch console features",
      },
      { status: 500 }
    )
  }
}

