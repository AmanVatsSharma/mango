/**
 * @file app/api/admin/winners/list/route.ts
 * @module api/admin/winners
 * @description GET flagged-winners table for /admin-v2/house/winners.
 *              Filters: ?rung= ?pinned= ?search= ?limit= ?offset=
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextResponse } from "next/server"
import type { WinnerRung } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listFlaggedWinners } from "@/lib/winners/control-service"
import { WINNER_RUNGS } from "@/lib/winners/types"

export const dynamic = "force-dynamic"

const VALID_RUNGS: ReadonlySet<WinnerRung> = new Set<WinnerRung>(WINNER_RUNGS)

function parseRung(input: string | null): WinnerRung | undefined {
  if (input && VALID_RUNGS.has(input as WinnerRung)) return input as WinnerRung
  return undefined
}

function parseInt0(input: string | null, fallback: number): number {
  if (!input) return fallback
  const n = Number.parseInt(input, 10)
  return Number.isFinite(n) ? n : fallback
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "GET /api/admin/winners/list",
      required: "admin.house.winner",
    },
    async () => {
      const url = new URL(req.url)
      const rung = parseRung(url.searchParams.get("rung"))
      const pinnedRaw = url.searchParams.get("pinned")
      const search = url.searchParams.get("search") || undefined
      const limit = parseInt0(url.searchParams.get("limit"), 50)
      const offset = parseInt0(url.searchParams.get("offset"), 0)

      const pinned =
        pinnedRaw === "true" ? true : pinnedRaw === "false" ? false : undefined

      const data = await listFlaggedWinners({ rung, pinned, search, limit, offset })
      return NextResponse.json(data)
    },
  )
}
