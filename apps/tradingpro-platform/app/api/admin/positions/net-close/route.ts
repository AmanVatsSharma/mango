/**
 * @file route.ts
 * @module api/admin/positions/net-close
 * @description Admin net square-off (FIFO) for a client trading account; bypasses retail risk policies.
 * @author StockTrade
 * @created 2026-03-30
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { executeNetPositionClose } from "@/lib/server/net-position-close"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { parsePositiveIntegerMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import { normalizeAdminExitPriceMode } from "@/lib/server/admin-position-exit-price"
import {
  consumePositionCloseIdempotency,
  rememberPositionCloseIdempotency,
  resolveIdempotencyKeyFromRequest,
} from "@/lib/server/position-close-idempotency"

function normalizeOptionalPositiveNumber(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) return undefined
  if (value === null) return null
  const parsed = parseFiniteTradingNumber(value)
  if (parsed === null || parsed <= 0) return "invalid"
  return parsed
}

function normalizeOptionalNonNegativeNumber(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) return undefined
  if (value === null) return null
  const parsed = parseFiniteTradingNumber(value)
  if (parsed === null || parsed < 0) return "invalid"
  return parsed
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined
  const parsed = parseFiniteTradingNumber(value)
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return "invalid"
  return Math.trunc(parsed)
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/positions/net-close",
      required: "admin.positions.manage",
      fallbackMessage: "Failed to net-close positions",
    },
    async (ctx) => {
      const { result } = await withApiTelemetry(req, { name: "admin_positions_net_close" }, async () => {
        const body = await req.json()
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
        }

        const idemKey = resolveIdempotencyKeyFromRequest(req, (body as { idempotencyKey?: string }).idempotencyKey)
        const idemHit = consumePositionCloseIdempotency(idemKey)
        if (idemHit) {
          return NextResponse.json(idemHit.body, { status: idemHit.status })
        }

        const tradingAccountId = normalizeOptionalText((body as any).tradingAccountId)
        if (!tradingAccountId) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "tradingAccountId is required",
            statusCode: 400,
          })
        }

        const requestedStockId = normalizeOptionalText((body as any)?.stockId)
        if (!requestedStockId) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "stockId is required for net square-off",
            statusCode: 400,
          })
        }

        const requestedInstrumentId = normalizeOptionalText((body as any)?.instrumentId)?.toUpperCase() ?? null
        const requestedToken = parsePositiveIntegerMarketNumber((body as any)?.token)
        const productTypeRaw = normalizeOptionalText((body as any)?.productType) ?? "MIS"

        const closeQuantityCandidate = normalizeOptionalPositiveInteger((body as any)?.closeQuantity)
        const closeLotsCandidate = normalizeOptionalPositiveInteger((body as any)?.closeLots)
        if (closeQuantityCandidate === "invalid") {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "closeQuantity must be a positive integer",
            statusCode: 400,
          })
        }
        if (closeLotsCandidate === "invalid") {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "closeLots must be a positive integer",
            statusCode: 400,
          })
        }
        if (closeQuantityCandidate !== undefined && closeLotsCandidate !== undefined) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Provide either closeQuantity or closeLots, not both",
            statusCode: 400,
          })
        }

        const exitPriceCandidate = normalizeOptionalPositiveNumber((body as any)?.exitPrice)
        if (exitPriceCandidate === "invalid") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid exitPrice", statusCode: 400 })
        }
        const hasNetExitPrice =
          exitPriceCandidate !== undefined &&
          exitPriceCandidate !== null &&
          typeof exitPriceCandidate === "number"
        const netExitMode = normalizeAdminExitPriceMode((body as any)?.exitPriceMode, hasNetExitPrice)
        if (netExitMode === "manual" && !hasNetExitPrice) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "exitPrice is required when exitPriceMode is manual",
            statusCode: 400,
          })
        }
        const ltpAgeMsCandidate = normalizeOptionalNonNegativeNumber((body as any)?.ltpAgeMs)
        const ltpTimestampCandidate = normalizeOptionalPositiveNumber((body as any)?.ltpTimestamp)
        if (ltpAgeMsCandidate === "invalid") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid ltpAgeMs", statusCode: 400 })
        }
        if (ltpTimestampCandidate === "invalid") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid ltpTimestamp", statusCode: 400 })
        }

        const nowMs = Date.now()

        const tradingAccount = await adminPrisma.tradingAccount.findUnique({
          where: { id: tradingAccountId },
          select: {
            id: true,
            balance: true,
            availableMargin: true,
            usedMargin: true,
          },
        })
        if (!tradingAccount) {
          throw new AppError({ code: "NOT_FOUND", message: "Trading account not found", statusCode: 404 })
        }

        const netResult = await executeNetPositionClose({
          tradingAccount,
          policyUserId: null,
          policyMode: "admin_override",
          requestedStockId,
          requestedInstrumentId,
          requestedToken,
          productTypeRaw,
          closeQuantityCandidate,
          closeLotsCandidate,
          exitPriceCandidate:
            exitPriceCandidate === "invalid" || exitPriceCandidate === undefined
              ? undefined
              : exitPriceCandidate,
          ltpAgeMsCandidate: ltpAgeMsCandidate === "invalid" ? undefined : ltpAgeMsCandidate ?? undefined,
          ltpTimestampCandidate:
            ltpTimestampCandidate === "invalid" ? undefined : ltpTimestampCandidate ?? undefined,
          exitPriceMode: netExitMode,
          manualExitPrice: netExitMode === "manual" && hasNetExitPrice ? exitPriceCandidate : undefined,
          nowMs,
          adminUserId: ctx.session.user.id,
        })

        if (netResult.kind === "error") {
          return NextResponse.json(netResult.body, {
            status: netResult.status,
            headers: netResult.headers,
          })
        }

        ctx.logger.info(
          {
            adminUserId: ctx.session.user.id,
            tradingAccountId,
            stockId: netResult.data.stockId,
            closedQuantity: netResult.data.closedQuantity,
          },
          "POST /api/admin/positions/net-close - success",
        )

        rememberPositionCloseIdempotency(idemKey, 200, netResult.data as Record<string, unknown>)
        return NextResponse.json(netResult.data, { status: 200 })
      })

      return result
    },
  )
}
