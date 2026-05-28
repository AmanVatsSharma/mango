/**
 * @file route.ts
 * @module kyc-config-api
 * @description Public runtime endpoint exposing global KYC enforcement flag
 * @author StockTrade
 * @created 2026-02-16
 */

import { NextResponse } from "next/server"
import { getKycEnforcementFromDB } from "@/lib/server/kyc-enforcement"

export const runtime = "nodejs"

export async function GET() {
  try {
    const enabled = await getKycEnforcementFromDB()
    return NextResponse.json(
      { success: true, enabled },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    )
  } catch (error: any) {
    console.error("[KYC-Config-API] Failed to resolve KYC enforcement flag", {
      error: error?.message || "Unknown error",
    })
    return NextResponse.json(
      { success: true, enabled: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}
