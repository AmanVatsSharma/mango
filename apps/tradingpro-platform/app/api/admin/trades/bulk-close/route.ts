/**
 * @file route.ts
 * @module admin-console/trades
 * @description POST /api/admin/trades/bulk-close — bulk force-close multiple positions.
 *              Wraps closePosition in a loop; returns per-id success/error. Partial success
 *              is acceptable (no cross-position DB transaction — positions are independent).
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

const MAX_BULK = 50

const VALID_REASONS: ClosureReason[] = [
  "USER_CLOSED",
  "ADMIN_CLOSED",
  "AUTO_LIQUIDATED",
  "EXPIRY_SQUAREOFF",
  "SYSTEM_CLOSED",
  "MANUAL_OTHER",
]

interface BulkCloseResult {
  positionId: string
  success: boolean
  error?: string
  closedQuantity?: number
  realizedPnL?: number
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  if (value && typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    try {
      const n = (value as { toNumber: () => number }).toNumber()
      return Number.isFinite(n) ? n : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/bulk-close",
      required: "admin.positions.manage",
      fallbackMessage: "Failed to bulk-close positions",
    },
    async (ctx) => {
      const body = (await req.json().catch(() => ({}))) as {
        positionIds?: unknown
        reason?: unknown
        note?: unknown
      }

      const positionIds = Array.isArray(body.positionIds)
        ? body.positionIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        : []
      if (positionIds.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "positionIds array is required",
          statusCode: 400,
        })
      }
      if (positionIds.length > MAX_BULK) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `cannot close more than ${MAX_BULK} positions in one call`,
          statusCode: 400,
        })
      }

      const reason = typeof body.reason === "string" && (VALID_REASONS as string[]).includes(body.reason)
        ? (body.reason as ClosureReason)
        : "ADMIN_CLOSED"
      const note = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim().slice(0, 500) : null

      const positions = await adminPrisma.position.findMany({
        where: { id: { in: positionIds } },
        select: {
          id: true,
          tradingAccountId: true,
          symbol: true,
          quantity: true,
          averagePrice: true,
          closedAt: true,
          Stock: { select: { ltp: true } },
        },
      })
      const byId = new Map(positions.map((p) => [p.id, p]))

      const results: BulkCloseResult[] = []
      for (const pid of positionIds) {
        const p = byId.get(pid)
        if (!p) {
          results.push({ positionId: pid, success: false, error: "Position not found" })
          continue
        }
        if (p.closedAt || p.quantity === 0) {
          results.push({ positionId: pid, success: false, error: "Position already closed" })
          continue
        }
        const ltp = toNumber(p.Stock?.ltp)
        const fallbackPrice = ltp > 0 ? ltp : toNumber(p.averagePrice)
        if (fallbackPrice <= 0) {
          results.push({ positionId: pid, success: false, error: "No exit price available" })
          continue
        }

        try {
          const logger = createTradingLogger({
            userId: ctx.session.user.id,
            tradingAccountId: p.tradingAccountId,
            positionId: pid,
            symbol: p.symbol,
          })
          const service = createPositionManagementService(logger)
          const result = await service.closePosition(
            pid,
            p.tradingAccountId,
            fallbackPrice,
            undefined,
            {
              reason,
              closedByUserId: ctx.session.user.id,
              note,
            },
          )
          results.push({
            positionId: pid,
            success: true,
            closedQuantity: result.closedQuantity,
            realizedPnL: result.realizedPnL,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error"
          results.push({ positionId: pid, success: false, error: msg })
        }
      }

      const successes = results.filter((r) => r.success).length
      const failures = results.length - successes
      return NextResponse.json(
        { success: true, total: results.length, successes, failures, results },
        { status: 200 },
      )
    },
  )
}
