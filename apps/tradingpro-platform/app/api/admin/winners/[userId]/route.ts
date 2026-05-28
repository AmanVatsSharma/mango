/**
 * @file app/api/admin/winners/[userId]/route.ts
 * @module api/admin/winners
 * @description GET / PATCH a single client's winner mitigation control snapshot.
 *              GET also returns recent history (last 50 rows).
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { getControl, getHistory, updateControl } from "@/lib/winners/control-service"
import { WINNER_RUNGS } from "@/lib/winners/types"
import type { WinnerControlUpdateInput, WinnerRung } from "@/lib/winners/types"

export const dynamic = "force-dynamic"

const VALID_RUNGS: ReadonlySet<WinnerRung> = new Set<WinnerRung>(WINNER_RUNGS)

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  const { userId } = await params
  return handleAdminApi(
    req,
    { route: "GET /api/admin/winners/[userId]", required: "admin.house.winner" },
    async () => {
      const [control, history] = await Promise.all([
        getControl(userId),
        getHistory(userId, 50),
      ])
      return NextResponse.json({ success: true, control, history })
    },
  )
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { userId } = await params
  return handleAdminApi(
    req,
    { route: "PATCH /api/admin/winners/[userId]", required: "admin.house.winner" },
    async (ctx) => {
      const body = (await req.json()) as Partial<WinnerControlUpdateInput> & {
        action?: string
      }

      if (body.rung !== undefined && !VALID_RUNGS.has(body.rung as WinnerRung)) {
        return NextResponse.json(
          { success: false, message: `Invalid rung: ${body.rung}` },
          { status: 400 },
        )
      }

      const action =
        typeof body.action === "string" && body.action.length > 0 ? body.action : "MANUAL_SET"

      const performedById = ctx.session?.user?.id
      if (!performedById) {
        return NextResponse.json(
          { success: false, message: "Session missing user id" },
          { status: 401 },
        )
      }

      const updated = await updateControl(
        userId,
        sanitizeUpdate(body),
        { performedById, action },
      )
      return NextResponse.json({ success: true, control: updated })
    },
  )
}

function sanitizeUpdate(input: Partial<WinnerControlUpdateInput>): WinnerControlUpdateInput {
  const out: WinnerControlUpdateInput = {}
  if (input.rung !== undefined) out.rung = input.rung
  if (input.spreadMultiplier !== undefined) out.spreadMultiplier = input.spreadMultiplier
  if (input.positionCapPct !== undefined) out.positionCapPct = input.positionCapPct
  if (input.blockedInstruments !== undefined) out.blockedInstruments = input.blockedInstruments
  if (input.blockedSegments !== undefined) out.blockedSegments = input.blockedSegments
  if (input.maxOrderNotional !== undefined) out.maxOrderNotional = input.maxOrderNotional
  if (input.pinned !== undefined) out.pinned = input.pinned
  if (input.reason !== undefined) out.reason = input.reason
  return out
}
