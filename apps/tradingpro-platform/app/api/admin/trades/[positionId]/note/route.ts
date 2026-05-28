/**
 * @file route.ts
 * @module admin-console/trades
 * @description POST /api/admin/trades/[positionId]/note — attach/update admin note on a position.
 *              Writes to Position.closureNote (doubles as admin note for open positions).
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

export async function POST(
  req: Request,
  context: { params: Promise<{ positionId: string }> | { positionId: string } },
) {
  const params = await Promise.resolve(context.params)
  const positionId = params.positionId

  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/[positionId]/note",
      required: "admin.positions.manage",
      fallbackMessage: "Failed to update position note",
    },
    async () => {
      if (!positionId || typeof positionId !== "string") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "positionId is required",
          statusCode: 400,
        })
      }

      const body = (await req.json().catch(() => ({}))) as { note?: unknown }
      const rawNote = typeof body.note === "string" ? body.note : null

      const trimmed = rawNote === null ? null : rawNote.trim()
      const noteValue = trimmed ? trimmed.slice(0, 500) : null

      const existing = await adminPrisma.position.findUnique({
        where: { id: positionId },
        select: { id: true },
      })
      if (!existing) {
        throw new AppError({ code: "NOT_FOUND", message: "Position not found", statusCode: 404 })
      }

      await adminPrisma.position.update({
        where: { id: positionId },
        data: { closureNote: noteValue },
      })

      return NextResponse.json({ success: true, note: noteValue }, { status: 200 })
    },
  )
}
