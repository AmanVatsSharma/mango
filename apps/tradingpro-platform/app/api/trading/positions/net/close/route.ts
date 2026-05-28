/**
 * @file route.ts
 * @module api/trading/positions/net/close
 * @description Kite-style net square-off across lot-wise position rows (FIFO).
 * @author StockTrade
 * @created 2026-02-25
 * @updated 2026-03-30
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { prisma } from "@/lib/prisma"
import { executeNetPositionClose } from "@/lib/server/net-position-close"
import {
  assertRequestedUserScope,
  assertTradingAccountOwnership,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
  TradingAccessError,
} from "@/lib/server/trading-access"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { parsePositiveIntegerMarketNumber } from "@/lib/market-data/utils/quote-lookup"
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
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_positions_net_close" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()

      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }

      assertRequestedUserScope((body as any)?.userId, authenticatedUserId)

      const requestedStockId = normalizeOptionalText((body as any)?.stockId)
      if (!requestedStockId) {
        return NextResponse.json({ error: "stockId is required for net square-off" }, { status: 400 })
      }
      const requestedInstrumentId = normalizeOptionalText((body as any)?.instrumentId)?.toUpperCase() ?? null
      const requestedToken = parsePositiveIntegerMarketNumber((body as any)?.token)

      const productTypeRaw = normalizeOptionalText((body as any)?.productType) ?? "MIS"

      const closeQuantityCandidate = normalizeOptionalPositiveInteger((body as any)?.closeQuantity)
      const closeLotsCandidate = normalizeOptionalPositiveInteger((body as any)?.closeLots)
      if (closeQuantityCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid closeQuantity. Must be a positive integer." }, { status: 400 })
      }
      if (closeLotsCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid closeLots. Must be a positive integer." }, { status: 400 })
      }
      if (closeQuantityCandidate !== undefined && closeLotsCandidate !== undefined) {
        return NextResponse.json({ error: "Provide either closeQuantity or closeLots, not both." }, { status: 400 })
      }

      const exitPriceCandidate = normalizeOptionalPositiveNumber((body as any)?.exitPrice)
      if (exitPriceCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid exitPrice" }, { status: 400 })
      }
      const ltpAgeMsCandidate = normalizeOptionalNonNegativeNumber((body as any)?.ltpAgeMs)
      const ltpTimestampCandidate = normalizeOptionalPositiveNumber((body as any)?.ltpTimestamp)
      if (ltpAgeMsCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid ltpAgeMs" }, { status: 400 })
      }
      if (ltpTimestampCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid ltpTimestamp" }, { status: 400 })
      }
      const nowMs = Date.now()
      const requestedTradingAccountId = normalizeOptionalText((body as any)?.tradingAccountId)

      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId: authenticatedUserId },
        select: {
          id: true,
          balance: true,
          availableMargin: true,
          usedMargin: true,
        },
      })
      if (!tradingAccount) {
        return NextResponse.json({ error: "Trading account not found" }, { status: 404 })
      }

      if (requestedTradingAccountId && requestedTradingAccountId !== tradingAccount.id) {
        throw new TradingAccessError("Position/account mismatch", 400)
      }

      await assertTradingAccountOwnership(tradingAccount.id, authenticatedUserId)

      const idemKey = resolveIdempotencyKeyFromRequest(req, (body as { idempotencyKey?: string }).idempotencyKey)
      const idemHit = consumePositionCloseIdempotency(idemKey)
      if (idemHit) {
        return NextResponse.json(idemHit.body, { status: idemHit.status })
      }

      const netResult = await executeNetPositionClose({
        tradingAccount,
        policyUserId: authenticatedUserId,
        policyMode: "retail",
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
        nowMs,
      })

      if (netResult.kind === "error") {
        return NextResponse.json(netResult.body, {
          status: netResult.status,
          headers: netResult.headers,
        })
      }

      rememberPositionCloseIdempotency(idemKey, 200, netResult.data as Record<string, unknown>)
      return NextResponse.json(netResult.data)
    })

    return result
  } catch (error: any) {
    const { message, status } = resolveTradingErrorResponse(error, "Failed to close net position", 500)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
