/**
 * @file app/api/admin/spread/simulate/route.ts
 * @module api/admin/spread
 * @description POST — slippage / revenue impact simulator. Pure function over current
 *              spread configs + admin-supplied override knobs. No side-effects.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { simulateSpread } from "@/lib/spread/spread-engine"
import type { SimulationInput } from "@/lib/spread/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/spread/simulate", required: "admin.house.spread" },
    async () => {
      const body = (await req.json()) as Partial<SimulationInput>

      if (typeof body.symbol !== "string" || body.symbol.length === 0) {
        return NextResponse.json(
          { success: false, message: "symbol is required" },
          { status: 400 },
        )
      }
      if (typeof body.mid !== "number" || !Number.isFinite(body.mid) || body.mid <= 0) {
        return NextResponse.json(
          { success: false, message: "mid must be a positive finite number" },
          { status: 400 },
        )
      }

      const result = await simulateSpread({
        symbol: body.symbol,
        segment: body.segment ?? null,
        clientTier: body.clientTier ?? null,
        mid: body.mid,
        averageDailyVolume: body.averageDailyVolume,
        overrideBidBps: body.overrideBidBps,
        overrideAskBps: body.overrideAskBps,
        perClientMultiplier: body.perClientMultiplier ?? null,
      })
      return NextResponse.json({ success: true, result })
    },
  )
}
