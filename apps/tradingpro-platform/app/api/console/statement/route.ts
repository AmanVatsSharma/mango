/**
 * @file route.ts
 * @module console-api
 * @description GET statement for the signed-in user over a date range (full ledger + trade register + funds).
 * @author StockTrade
 * @created 2026-03-30
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DataExportService } from "@/lib/services/export/DataExportService"
import { getEffectiveStatementsEnabledForUser } from "@/lib/server/console-statements"

const DEFAULT_RANGE_MS = 90 * 24 * 60 * 60 * 1000

function parseBoundary(value: string | null, label: string): Date | null {
  if (value === null || value.trim() === "") return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label}`)
  }
  return d
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const resolution = await getEffectiveStatementsEnabledForUser(session.user.id)
    if (!resolution.enabled) {
      return NextResponse.json(
        { success: false, error: "Statements are disabled for this account" },
        { status: 403 },
      )
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const toParam = parseBoundary(searchParams.get("to"), "to")
    const fromParam = parseBoundary(searchParams.get("from"), "from")

    const end = toParam ?? now
    const start = fromParam ?? new Date(end.getTime() - DEFAULT_RANGE_MS)

    if (start.getTime() > end.getTime()) {
      return NextResponse.json({ success: false, error: "`from` must be before `to`" }, { status: 400 })
    }

    const data = await DataExportService.generateStatement(session.user.id, start, end)
    return NextResponse.json({ success: true, ...data }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load statement"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
