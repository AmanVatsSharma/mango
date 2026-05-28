/**
 * @file route.ts
 * @module api/admin/positions/bulk
 * @description Bulk position operations API: close multiple positions, modify SL/TP in batch.
 *
 * Endpoints:
 *   POST /api/admin/positions/bulk/close - Bulk close positions
 *   POST /api/admin/positions/bulk/modify - Bulk modify SL/TP
 *   GET  /api/admin/positions/bulk/analytics - Position aggregations
 *
 * Author: StockTrade
 * Last-updated: 2026-05-14
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { getBulkOperationsService } from "@/lib/services/admin/BulkOperationsService"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"

export const dynamic = "force-dynamic"

function toNumberOrUndefined(val: unknown): number | undefined {
  const n = parseFiniteTradingNumber(val)
  return n ?? undefined
}

// POST /api/admin/positions/bulk/close
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/positions/bulk/close",
      required: "admin.positions.manage",
      fallbackMessage: "Bulk close failed",
    },
    async (ctx) => {
      const body = await req.json()
      const { action, positions } = body as {
        action: "close" | "modify"
        positions: Array<{
          positionId: string
          tradingAccountId: string
          closeQuantity?: number
          closeLots?: number
          exitPrice?: number | null
          updates?: {
            stopLoss?: number | null
            target?: number | null
          }
        }>
      }

      if (!Array.isArray(positions) || positions.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "positions array is required",
          statusCode: 400,
        })
      }

      if (positions.length > 100) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Maximum 100 positions per bulk operation",
          statusCode: 400,
        })
      }

      const bulkService = getBulkOperationsService()
      const adminUserId = ctx.session.user.id

      if (action === "close") {
        const closeInputs = positions.map((p) => ({
          positionId: p.positionId,
          tradingAccountId: p.tradingAccountId,
          closeQuantity: p.closeQuantity !== undefined
            ? Math.trunc(toNumberOrUndefined(p.closeQuantity) ?? 0)
            : undefined,
          closeLots: p.closeLots !== undefined
            ? Math.trunc(toNumberOrUndefined(p.closeLots) ?? 0)
            : undefined,
          exitPrice: p.exitPrice !== undefined ? toNumberOrUndefined(p.exitPrice) : undefined,
          reason: {
            reason: "ADMIN_CLOSED" as const,
            closedByUserId: adminUserId,
          },
        }))

        const result = await bulkService.bulkClosePositions(closeInputs, adminUserId, {
          batchSize: 10,
          delayBetweenBatchesMs: 100,
        })

        return NextResponse.json(result, { status: 200 })
      }

      if (action === "modify") {
        const modifyInputs = positions
          .filter((p) => p.updates)
          .map((p) => ({
            positionId: p.positionId,
            tradingAccountId: p.tradingAccountId,
            updates: {
              stopLoss: p.updates?.stopLoss !== undefined
                ? toNumberOrUndefined(p.updates.stopLoss)
                : undefined,
              target: p.updates?.target !== undefined
                ? toNumberOrUndefined(p.updates.target)
                : undefined,
            },
          }))

        const result = await bulkService.bulkModifyPositions(modifyInputs, adminUserId, {
          batchSize: 20,
          delayBetweenBatchesMs: 50,
        })

        return NextResponse.json(result, { status: 200 })
      }

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid action. Use 'close' or 'modify'.",
        statusCode: 400,
      })
    }
  )
}

// GET /api/admin/positions/bulk/analytics
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/positions/bulk/analytics",
      required: "admin.positions.read",
      fallbackMessage: "Analytics failed",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const groupBy = searchParams.get("groupBy") as "user" | "symbol" | "segment" | "productType" | null
      const openOnly = searchParams.get("openOnly") === "true"

      if (!groupBy) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "groupBy is required (user|symbol|segment|productType)",
          statusCode: 400,
        })
      }

      const bulkService = getBulkOperationsService()
      const result = await bulkService.getPositionsAggregation({
        groupBy,
        filters: { openOnly },
      })

      return NextResponse.json(result, { status: 200 })
    }
  )
}