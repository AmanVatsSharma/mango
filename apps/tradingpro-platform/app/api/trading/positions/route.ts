/**
 * @file route.ts
 * @module api/trading/positions
 * @description Close / update position HTTP handlers; optional server live + Redis exit price when market display policy allows.
 * @author StockTrade
 * @created 2025-01-01
 * @updated 2026-03-30
 */

export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import {
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveSubscriptionIdentity,
} from "@/lib/market-data/utils/quote-lookup"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { getMarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import { resolveSquareOffExitPrice } from "@/lib/server/position-square-off-exit-price"
import {
  consumePositionCloseIdempotency,
  rememberPositionCloseIdempotency,
  resolveIdempotencyKeyFromRequest,
} from "@/lib/server/position-close-idempotency"
import { enqueueQueuedPositionCloseOrder } from "@/lib/server/queued-position-close-order"
import { prisma } from "@/lib/prisma"
import { evaluateTradingPoliciesForContext } from "@/lib/services/risk/dynamic-trading-policies"
import {
  assertRequestedUserScope,
  assertTradingAccountOwnership,
  getOwnedPositionContext,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
  TradingAccessError,
} from "@/lib/server/trading-access"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "api/trading/positions" })

const MARKET_LIVE_QUOTE_MAX_AGE_MS = 60_000
const MARKET_LIVE_QUOTE_TIMEOUT_MS = 3_000

function normalizeOptionalPositivePositionNumber(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return "invalid"
  }
  return parsedValue
}

function normalizeOptionalPositivePositionInteger(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return "invalid"
  }
  return Math.trunc(parsedValue)
}

function normalizeOptionalNonNegativePositionNumber(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return "invalid"
  }
  return parsedValue
}

function normalizeOptionalEpochMs(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return "invalid"
  }
  return parsedValue
}

export async function POST(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_positions_post" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }
      assertRequestedUserScope(body?.userId, authenticatedUserId)
      
      const rawPositionId = body?.positionId
      const rawTradingAccountId = body?.tradingAccountId
      let positionId = typeof rawPositionId === "string" ? rawPositionId.trim() : rawPositionId
      let tradingAccountId = typeof rawTradingAccountId === "string" ? rawTradingAccountId.trim() : rawTradingAccountId
      const exitPriceCandidate = normalizeOptionalPositivePositionNumber(body?.exitPrice)
      const closeQuantityCandidate = normalizeOptionalPositivePositionInteger(body?.closeQuantity)
      const closeLotsCandidate = normalizeOptionalPositivePositionInteger(body?.closeLots)
      if (exitPriceCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid exit price" }, { status: 400 })
      }
      const ltpAgeMsCandidate = normalizeOptionalNonNegativePositionNumber(body?.ltpAgeMs)
      const ltpTimestampCandidate = normalizeOptionalEpochMs(body?.ltpTimestamp)
      if (ltpAgeMsCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid ltpAgeMs" }, { status: 400 })
      }
      if (ltpTimestampCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid ltpTimestamp" }, { status: 400 })
      }
      if (closeQuantityCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid closeQuantity. Must be a positive integer." }, { status: 400 })
      }
      if (closeLotsCandidate === "invalid") {
        return NextResponse.json({ error: "Invalid closeLots. Must be a positive integer." }, { status: 400 })
      }
      if (closeQuantityCandidate !== undefined && closeLotsCandidate !== undefined) {
        return NextResponse.json(
          { error: "Provide either closeQuantity or closeLots, not both." },
          { status: 400 },
        )
      }
      const exitPrice = exitPriceCandidate

      if (!positionId) {
        return NextResponse.json({ error: "Position ID required" }, { status: 400 })
      }

      const positionContext = await getOwnedPositionContext(positionId, authenticatedUserId)

      // If tradingAccountId is passed, it must match the owned position context.
      if (tradingAccountId && tradingAccountId !== positionContext.tradingAccountId) {
        throw new TradingAccessError("Position/account mismatch", 400)
      }
      tradingAccountId = positionContext.tradingAccountId
      await assertTradingAccountOwnership(tradingAccountId, authenticatedUserId)

      const idemKey = resolveIdempotencyKeyFromRequest(req, (body as { idempotencyKey?: string }).idempotencyKey)
      const idemHit = consumePositionCloseIdempotency(idemKey)
      if (idemHit) {
        return NextResponse.json(idemHit.body, { status: idemHit.status })
      }

      const positionSnapshot = await prisma.position.findFirst({
        where: { id: positionId, tradingAccountId },
        select: {
          id: true,
          createdAt: true,
          quantity: true,
          productType: true,
          isIntraday: true,
          unrealizedPnL: true,
          Stock: {
            select: {
              segment: true,
              lot_size: true,
              token: true,
              uirId: true,
              instrumentId: true,
              exchange: true,
            },
          },
          orders: {
            select: {
              productType: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
          tradingAccount: {
            select: {
              balance: true,
              availableMargin: true,
              usedMargin: true,
            },
          },
        },
      })
      const openSignedQuantity = Math.trunc(parseFiniteTradingNumber(positionSnapshot?.quantity) ?? 0)
      const openAbsoluteQuantity = Math.abs(openSignedQuantity)
      const lotSize = Math.max(1, Math.trunc(parseFiniteTradingNumber(positionSnapshot?.Stock?.lot_size) ?? 1))
      let resolvedCloseQuantityAbs: number | undefined

      if (closeLotsCandidate !== undefined) {
        if (!positionSnapshot) {
          return NextResponse.json({ error: "Position snapshot unavailable for lot-based exit." }, { status: 400 })
        }
        if (lotSize <= 1) {
          return NextResponse.json(
            { error: "closeLots is supported only for lot-based instruments." },
            { status: 400 },
          )
        }
        resolvedCloseQuantityAbs = closeLotsCandidate * lotSize
      } else if (closeQuantityCandidate !== undefined) {
        resolvedCloseQuantityAbs = closeQuantityCandidate
      }

      if (resolvedCloseQuantityAbs !== undefined) {
        if (!positionSnapshot) {
          return NextResponse.json({ error: "Position snapshot unavailable for partial exit." }, { status: 400 })
        }
        if (openAbsoluteQuantity === 0) {
          return NextResponse.json({ error: "Position is already closed." }, { status: 400 })
        }
        if (resolvedCloseQuantityAbs > openAbsoluteQuantity) {
          return NextResponse.json(
            {
              error: `closeQuantity cannot exceed open quantity (${openAbsoluteQuantity}).`,
            },
            { status: 400 },
          )
        }
        if (lotSize > 1 && resolvedCloseQuantityAbs % lotSize !== 0) {
          return NextResponse.json(
            { error: `closeQuantity must be in lot multiples of ${lotSize}.` },
            { status: 400 },
          )
        }
      }
      if (positionSnapshot && openSignedQuantity !== 0) {
        const requestedCloseQuantity = resolvedCloseQuantityAbs ?? openAbsoluteQuantity
        const requestedCloseLots = lotSize > 1 ? requestedCloseQuantity / lotSize : 0
        const remainingQuantityAfterClose = Math.max(0, openAbsoluteQuantity - requestedCloseQuantity)
        const nowMs = Date.now()
        const createdAtMs = positionSnapshot.createdAt.getTime()
        const holdMinutes = Math.max(0, (nowMs - createdAtMs) / 60_000)
        const policyEvaluation = await evaluateTradingPoliciesForContext({
          context: "POSITION_CLOSE",
          snapshot: {
            position: {
              unrealizedPnl: parseFiniteTradingNumber(positionSnapshot.unrealizedPnL) ?? 0,
              holdMinutes,
              quantity: parseFiniteTradingNumber(positionSnapshot.quantity) ?? 0,
              lotSize,
              requestedCloseQuantity,
              requestedCloseLots,
              remainingQuantityAfterClose,
              segment: positionSnapshot.Stock?.segment || null,
              productType: positionSnapshot.productType || positionSnapshot.orders[0]?.productType || null,
              isIntraday: positionSnapshot.isIntraday === true ? 1 : 0,
            },
            account: {
              balance: parseFiniteTradingNumber(positionSnapshot.tradingAccount?.balance) ?? 0,
              availableMargin: parseFiniteTradingNumber(positionSnapshot.tradingAccount?.availableMargin) ?? 0,
              usedMargin: parseFiniteTradingNumber(positionSnapshot.tradingAccount?.usedMargin) ?? 0,
            },
            meta: {
              userId: authenticatedUserId,
              tradingAccountId,
            },
          },
        })

        log.info(
          {
            blocked: policyEvaluation.blocked,
            policyId: policyEvaluation.policy?.id ?? null,
            policyName: policyEvaluation.policy?.name ?? null,
            retryAfterSeconds: policyEvaluation.retryAfterSeconds,
            holdMinutes,
            unrealizedPnl: parseFiniteTradingNumber(positionSnapshot.unrealizedPnL) ?? 0,
            positionId,
            tradingAccountId,
          },
          policyEvaluation.blocked
            ? "position close blocked by policy"
            : "position close allowed by policy engine",
        )

        if (policyEvaluation.blocked) {
          const statusCode = policyEvaluation.retryAfterSeconds > 0 ? 423 : 403
          const responseHeaders =
            policyEvaluation.retryAfterSeconds > 0
              ? { "Retry-After": String(policyEvaluation.retryAfterSeconds) }
              : undefined
          return NextResponse.json(
            {
              error: policyEvaluation.message || "Position close blocked by admin policy.",
              policy: policyEvaluation.policy
                ? {
                    id: policyEvaluation.policy.id,
                    name: policyEvaluation.policy.name,
                    context: policyEvaluation.policy.context,
                    source: policyEvaluation.policy.source,
                    retryAfterSeconds: policyEvaluation.retryAfterSeconds,
                  }
                : null,
            },
            {
              status: statusCode,
              headers: responseHeaders,
            },
          )
        }
      }

      const asyncClose =
        (body as { async?: unknown }).async === true ||
        (typeof (body as { async?: unknown }).async === "string" &&
          String((body as { async?: string }).async).trim() === "1") ||
        new URL(req.url).searchParams.get("async") === "1"

      if (asyncClose) {
        if (!positionSnapshot || openSignedQuantity === 0) {
          return NextResponse.json({ error: "Position is already closed." }, { status: 400 })
        }
        if (exitPrice !== undefined && exitPrice !== null) {
          return NextResponse.json(
            {
              error:
                "async close does not accept exitPrice; execution price is resolved when the queued order runs.",
            },
            { status: 400 },
          )
        }
        const requestedQty = resolvedCloseQuantityAbs ?? openAbsoluteQuantity
        try {
          const enq = await enqueueQueuedPositionCloseOrder({
            positionId,
            tradingAccountId,
            closeQuantityAbs: requestedQty,
            closeMetadata: {
              source: "retail_positions_api",
              userId: authenticatedUserId,
              idempotencyKey: idemKey ?? null,
              enqueuedAtMs: Date.now(),
            },
          })
          const acceptBody: Record<string, unknown> = {
            queued: true,
            orderId: enq.orderId,
            positionId,
            closeQuantity: requestedQty,
            deduped: enq.deduped,
            message: enq.deduped
              ? "Close already queued for this position."
              : "Close queued; order executes when the order worker processes pending orders.",
          }
          rememberPositionCloseIdempotency(idemKey, 202, acceptBody)
          return NextResponse.json(acceptBody, { status: 202 })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return NextResponse.json({ error: msg }, { status: 400 })
        }
      }

      // Create logger with context
      const logger = createTradingLogger({
        tradingAccountId,
        positionId
      })
      
      const positionService = createPositionManagementService(logger)
      const stock = positionSnapshot?.Stock
      const stockToken =
        stock !== null && stock !== undefined
          ? parsePositiveIntegerMarketNumber(stock.token) ??
            parseTokenFromInstrumentId(stock.instrumentId) ??
            null
          : null
      if (stockToken === null) {
        return NextResponse.json(
          { error: "Unable to resolve instrument token for live exit price." },
          { status: 400 },
        )
      }
      const subscriptionKey =
        stock !== null && stock !== undefined
          ? resolveSubscriptionIdentity({
              token: stockToken,
              uirId: (stock as any).uirId,
              instrumentId: stock.instrumentId ?? null,
              exchange: stock.exchange ?? null,
              segment: stock.segment ?? null,
            }).subscriptionKey ?? stockToken
          : stockToken

      const pricingPolicies = await getMarketDisplayPositionPricingPolicies()
      const closeNowMs = Date.now()
      const exitResolved = await resolveSquareOffExitPrice({
        nowMs: closeNowMs,
        exitPriceCandidate: exitPrice === null ? undefined : exitPrice,
        ltpAgeMsCandidate:
          ltpAgeMsCandidate === "invalid" ? undefined : ltpAgeMsCandidate ?? undefined,
        ltpTimestampCandidate:
          ltpTimestampCandidate === "invalid" ? undefined : ltpTimestampCandidate ?? undefined,
        authority: pricingPolicies.positionSquareOffPriceAuthority,
        closeExitPolicy: pricingPolicies.positionCloseExitPricePolicy,
        maxDeviationBps: pricingPolicies.positionSquareOffClientMaxDeviationBps,
        positionId: typeof positionId === "string" ? positionId : "",
        stockToken,
        subscriptionKey,
        markLiveQuoteMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
        pnlServerMaxAgeMs: pricingPolicies.pnlServerMaxAgeMs,
        positionPnlQuoteMaxAgeMs: pricingPolicies.positionPnlQuoteMaxAgeMs,
        redisMarketQuoteMaxAgeMs: pricingPolicies.redisMarketQuoteMaxAgeMs,
        quoteTimeoutMs: MARKET_LIVE_QUOTE_TIMEOUT_MS,
        allowLastSubscriptionTickFallback: false,
        useClientPriceWhenWithinBand: pricingPolicies.positionCloseUseClientPriceWhenWithinBand,
        clientIntendedExitPrice: exitPrice === null || exitPrice === undefined ? undefined : exitPrice,
        referenceDivergenceMaxBps: pricingPolicies.positionCloseReferenceDivergenceMaxBps,
      })

      if (!exitResolved.ok) {
        return NextResponse.json(
          { error: exitResolved.error, code: exitResolved.code },
          { status: exitResolved.status },
        )
      }

      const priceForClose = exitResolved.price

      const postResult = await positionService.closePosition(
        positionId,
        tradingAccountId,
        priceForClose,
        resolvedCloseQuantityAbs,
        { reason: "USER_CLOSED", closedByUserId: authenticatedUserId },
      )
      const closeResponseBody = {
        ...(typeof postResult === "object" && postResult !== null ? postResult : {}),
        exitPrice: priceForClose,
        exitPriceSource: exitResolved.source,
        exitPriceAudit: exitResolved.audit,
      } as Record<string, unknown>
      rememberPositionCloseIdempotency(idemKey, 200, closeResponseBody)
      return NextResponse.json(closeResponseBody, { status: 200 })
    })

    return result
  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : String(error) }, "position close handler error")
    const { message: errorMessage, status: statusCode } = resolveTradingErrorResponse(error, "Unknown error", 500)
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}

export async function PATCH(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_positions_patch" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()
      const body = await req.json()
      assertRequestedUserScope(body?.userId, authenticatedUserId)
      
      const rawPositionId = body?.positionId
      const rawTradingAccountId = body?.tradingAccountId
      const positionId = typeof rawPositionId === "string" ? rawPositionId.trim() : rawPositionId
      if (
        rawTradingAccountId !== undefined &&
        rawTradingAccountId !== null &&
        typeof rawTradingAccountId !== "string"
      ) {
        return NextResponse.json({ error: "Invalid tradingAccountId" }, { status: 400 })
      }
      const requestedTradingAccountIdRaw =
        typeof rawTradingAccountId === "string" ? rawTradingAccountId.trim() : undefined
      const requestedTradingAccountId =
        requestedTradingAccountIdRaw && requestedTradingAccountIdRaw.length > 0
          ? requestedTradingAccountIdRaw
          : undefined
      const updates = body?.updates
      
      if (
        !positionId ||
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
      ) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      }
      const normalizedStopLoss = normalizeOptionalPositivePositionNumber((updates as any).stopLoss)
      const normalizedTarget = normalizeOptionalPositivePositionNumber((updates as any).target)
      if (normalizedStopLoss === "invalid" || normalizedTarget === "invalid") {
        return NextResponse.json({ error: "Invalid position updates" }, { status: 400 })
      }
      if (normalizedStopLoss === undefined && normalizedTarget === undefined) {
        return NextResponse.json({ error: "No position updates provided" }, { status: 400 })
      }
      const positionContext = await getOwnedPositionContext(positionId, authenticatedUserId)
      if (
        requestedTradingAccountId &&
        positionContext.tradingAccountId !== requestedTradingAccountId
      ) {
        throw new TradingAccessError("Position/account mismatch", 400)
      }
      const tradingAccountId = positionContext.tradingAccountId
      await assertTradingAccountOwnership(tradingAccountId, authenticatedUserId)

      // Create logger with context
      const logger = createTradingLogger({
        tradingAccountId,
        positionId
      })
      
      // Create service and update position
      const positionService = createPositionManagementService(logger)
      const patchResult = await positionService.updatePosition(positionId, {
        stopLoss: normalizedStopLoss,
        target: normalizedTarget
      })
      
      return NextResponse.json(patchResult, { status: 200 })
    })

    return result
  } catch (error: any) {
    log.error({ error: error instanceof Error ? error.message : String(error) }, "position update handler error")
    const { message: errorMessage, status: statusCode } = resolveTradingErrorResponse(error, "Invalid request", 500)
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
