/**
 * @file app/api/admin/trades/[positionId]/adjust/route.ts
 * @module api/admin/trades
 * @description POST — record a manual trade adjustment for a position (or order).
 *              Phase 9 ships the audit-recording layer; Phase 9.5 wires actions to
 *              actual state mutation services.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { logAdjustment, TradeAdjustValidationError } from "@/lib/trade-adjust/service"
import type { TradeAdjustInput } from "@/lib/trade-adjust/types"

export const dynamic = "force-dynamic"

interface RouteParams {
  params: Promise<{ positionId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const { positionId } = await params
  return handleAdminApi(
    req,
    { route: "POST /api/admin/trades/[positionId]/adjust", required: "admin.house.adjust" },
    async (ctx) => {
      const body = (await req.json()) as Partial<TradeAdjustInput>
      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }
      if (!body.userId || typeof body.userId !== "string") {
        return NextResponse.json(
          { success: false, message: "userId (trade owner) is required" },
          { status: 400 },
        )
      }
      if (!body.action) {
        return NextResponse.json(
          { success: false, message: "action is required" },
          { status: 400 },
        )
      }
      try {
        const log = await logAdjustment(
          {
            action: body.action,
            orderId: body.orderId ?? null,
            positionId: body.positionId ?? positionId,
            userId: body.userId,
            reason: body.reason ?? "",
            fromValue: body.fromValue,
            toValue: body.toValue,
          },
          performedById,
        )
        return NextResponse.json({ success: true, log })
      } catch (err) {
        if (err instanceof TradeAdjustValidationError) {
          return NextResponse.json(
            { success: false, message: err.message },
            { status: 400 },
          )
        }
        throw err
      }
    },
  )
}
