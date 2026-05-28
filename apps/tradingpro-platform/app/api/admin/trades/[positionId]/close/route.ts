/**
 * @file route.ts
 * @module admin-console/trades
 * @description POST /api/admin/trades/[positionId]/close — admin force-close (full or partial).
 *              Thin wrapper over PositionManagementService.closePosition with admin closure context.
 *              Admin must supply exitPrice explicitly; this route does not consult market policies.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import {
  createPositionManagementService,
  type ClosureReason,
} from "@/lib/services/position/PositionManagementService"

const VALID_REASONS: ClosureReason[] = [
  "USER_CLOSED",
  "ADMIN_CLOSED",
  "AUTO_LIQUIDATED",
  "EXPIRY_SQUAREOFF",
  "SYSTEM_CLOSED",
  "MANUAL_OTHER",
]

function toFinite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function POST(
  req: Request,
  context: { params: Promise<{ positionId: string }> | { positionId: string } },
) {
  const params = await Promise.resolve(context.params)
  const positionId = params.positionId

  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/[positionId]/close",
      required: "admin.positions.manage",
      fallbackMessage: "Failed to close position",
    },
    async (ctx) => {
      if (!positionId || typeof positionId !== "string") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "positionId is required",
          statusCode: 400,
        })
      }

      const body = (await req.json().catch(() => ({}))) as {
        exitPrice?: unknown
        quantity?: unknown
        reason?: unknown
        note?: unknown
      }

      const exitPrice = toFinite(body.exitPrice)
      if (exitPrice === null || exitPrice <= 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "exitPrice is required and must be a positive number",
          statusCode: 400,
        })
      }

      const quantityRaw = body.quantity !== undefined && body.quantity !== null ? toFinite(body.quantity) : undefined
      if (quantityRaw !== undefined && (quantityRaw === null || quantityRaw <= 0 || !Number.isInteger(quantityRaw))) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "quantity must be a positive integer",
          statusCode: 400,
        })
      }

      const reason = typeof body.reason === "string" && (VALID_REASONS as string[]).includes(body.reason)
        ? (body.reason as ClosureReason)
        : "ADMIN_CLOSED"
      const note = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim().slice(0, 500) : null

      const existing = await adminPrisma.position.findUnique({
        where: { id: positionId },
        select: { id: true, tradingAccountId: true, quantity: true, symbol: true, closedAt: true },
      })
      if (!existing) {
        throw new AppError({ code: "NOT_FOUND", message: "Position not found", statusCode: 404 })
      }
      if (existing.closedAt || existing.quantity === 0) {
        throw new AppError({
          code: "POSITION_ALREADY_CLOSED",
          message: "Position is already closed",
          statusCode: 409,
        })
      }

      const openAbs = Math.abs(existing.quantity)
      if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw > openAbs) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `quantity cannot exceed open quantity (${openAbs})`,
          statusCode: 400,
        })
      }

      const logger = createTradingLogger({
        userId: ctx.session.user.id,
        tradingAccountId: existing.tradingAccountId,
        positionId,
        symbol: existing.symbol,
      })
      const service = createPositionManagementService(logger)
      const result = await service.closePosition(
        positionId,
        existing.tradingAccountId,
        exitPrice,
        quantityRaw ?? undefined,
        {
          reason,
          closedByUserId: ctx.session.user.id,
          note,
        },
      )

      return NextResponse.json({ success: true, result }, { status: 200 })
    },
  )
}
