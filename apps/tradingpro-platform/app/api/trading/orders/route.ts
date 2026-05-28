export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { createOrderExecutionService } from '@/lib/services/order/OrderExecutionService'
import { createTradingLogger } from '@/lib/services/logging/TradingLogger'
import { placeOrderSchema, modifyOrderSchema, cancelOrderSchema } from '@/lib/server/validation'
import { checkRateLimit, getRateLimitKey, RateLimitPresets } from '@/lib/services/security/RateLimiter'
import { trackOperation } from '@/lib/services/monitoring/PerformanceMonitor'
import {
  getSegmentTradingSession,
  resolveSegmentSessionOpenMinutesIST,
} from '@/lib/server/market-timing'
import { enqueueBackgroundTask } from "@/lib/server/background-tasks"
import { orderExecutionWorker } from "@/lib/services/order/OrderExecutionWorker"
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { parseTokenFromInstrumentId } from "@/lib/market-data/utils/quote-lookup"
import { prisma } from "@/lib/prisma"
import { evaluateTradingPoliciesForContext } from "@/lib/services/risk/dynamic-trading-policies"
import { baseLogger } from "@/lib/observability/logger"
import {
  extractIdempotencyKey,
  acquireIdempotencySlot,
  readIdempotencyCached,
  storeIdempotencyResponse,
  IDEMPOTENCY_TTL_SECONDS,
} from "@/lib/redis/order-idempotency"

const log = baseLogger.child({ module: "api/trading/orders" })
import {
  assertRequestedUserScope,
  assertOrderOwnership,
  assertTradingAccountOwnership,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"

function normalizeOptionalOrderPrice(value: unknown): number | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return "invalid"
  }
  return parsedValue
}

function normalizeOptionalOrderQuantity(value: unknown): number | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return "invalid"
  }
  return parsedValue
}

function normalizeOptionalRequiredOrderQuantity(value: unknown): number | undefined | "invalid" {
  if (value === undefined) {
    return undefined
  }
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return "invalid"
  }
  return parsedValue
}

function normalizeOptionalPositiveOrderNumber(value: unknown): number | null | undefined | "invalid" {
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

function normalizeOptionalUpperText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

function normalizeOptionalDateKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString().slice(0, 10)
}

function resolveOrderIdentityGuardError(input: {
  token?: number | null
  instrumentId?: string | null
  optionType?: string | null
  strikePrice?: number | null
  expiry?: string | null
}): string | null {
  const normalizedToken = normalizeOptionalOrderQuantity(input.token)
  if (normalizedToken === "invalid") {
    return "Invalid token value in order identity."
  }
  const parsedTokenFromInstrument = parseTokenFromInstrumentId(input.instrumentId)
  if (
    normalizedToken !== undefined &&
    parsedTokenFromInstrument !== null &&
    normalizedToken !== parsedTokenFromInstrument
  ) {
    return "Invalid order identity: token does not match instrumentId."
  }

  const normalizedOptionType = normalizeOptionalUpperText(input.optionType)
  if (normalizedOptionType && normalizedOptionType !== "CE" && normalizedOptionType !== "PE") {
    return "Invalid optionType. Allowed values are CE or PE."
  }

  const strikeProvided = input.strikePrice !== undefined && input.strikePrice !== null
  const normalizedStrikePrice = strikeProvided ? parseFiniteTradingNumber(input.strikePrice) : null
  const hasPositiveStrikePrice =
    normalizedStrikePrice !== null && normalizedStrikePrice > 0
  if (normalizedOptionType && !strikeProvided) {
    return "Invalid derivative identity: optionType requires strikePrice."
  }
  // Robustness: some futures payloads carry strikePrice=0 sentinel; treat that as absent
  // unless this is an options identity (where strikePrice must be positive).
  if (normalizedOptionType && !hasPositiveStrikePrice) {
    return "Invalid strikePrice for derivative instrument."
  }

  const expiryProvided = input.expiry !== undefined && input.expiry !== null && String(input.expiry).trim().length > 0
  const normalizedExpiry = normalizeOptionalDateKey(input.expiry)
  if (expiryProvided && !normalizedExpiry) {
    return "Invalid expiry format in order identity."
  }

  return null
}

export async function POST(req: Request) {
  console.log("🌐 [API-ORDERS] POST request received")
  const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now())
  const t0 = nowMs()
  
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_orders_post" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()

      // ── Idempotency gate ────────────────────────────────────────────────────
      // Mobile clients send a UUID v4 `Idempotency-Key` header and retry on 4G drops.
      // We return the cached response on replay instead of placing a duplicate order.
      const idempotencyKey = extractIdempotencyKey(req)
      if (idempotencyKey !== null) {
        const won = await acquireIdempotencySlot(authenticatedUserId, idempotencyKey, IDEMPOTENCY_TTL_SECONDS)
        if (!won) {
          const cached = await readIdempotencyCached(authenticatedUserId, idempotencyKey)
          if (cached === "__processing__" || cached === null) {
            // First request is still in-flight — tell the client to retry briefly.
            return NextResponse.json(
              { error: "Order is being processed. Retry in 1s.", retryAfter: 1 },
              { status: 409, headers: { "Retry-After": "1" } },
            )
          }
          // First request already completed — replay the response.
          try {
            const parsedBody = JSON.parse(cached)
            const httpStatus = parsedBody?.executionScheduled ? 202 : 200
            return NextResponse.json(parsedBody, {
              status: httpStatus,
              headers: { "X-Idempotent-Replayed": "true" },
            })
          } catch {
            // Corrupted cache entry — let the request through rather than hard-failing.
            log.warn({ idempotencyKey }, "idempotency cache entry corrupt — processing fresh")
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }
      console.log("📝 [API-ORDERS] Request body:", body)
      console.log("⏱️ [API-ORDERS] parseBody ms", Math.round(nowMs() - t0))
      const normalizedTradingAccountId = typeof body?.tradingAccountId === "string" ? body.tradingAccountId.trim() : body?.tradingAccountId
      const normalizedOrderType = typeof body?.orderType === "string" ? body.orderType.trim().toUpperCase() : body?.orderType
      const normalizedOrderSide = typeof body?.orderSide === "string" ? body.orderSide.trim().toUpperCase() : body?.orderSide
      const normalizedProductType = typeof body?.productType === "string" ? body.productType.trim().toUpperCase() : body?.productType
      const normalizedSegment = typeof body?.segment === "string" ? body.segment.trim().toUpperCase() : body?.segment
      const normalizedExchange = typeof body?.exchange === "string" ? body.exchange.trim().toUpperCase() : body?.exchange
      const normalizedOptionType = typeof body?.optionType === "string" ? body.optionType.trim().toUpperCase() : body?.optionType

      assertRequestedUserScope(body?.userId, authenticatedUserId)
      const normalizedQuantity = normalizeOptionalRequiredOrderQuantity(body?.quantity)
      const normalizedPrice = normalizeOptionalPositiveOrderNumber(body?.price)
      const normalizedToken = normalizeOptionalOrderQuantity(body?.token)
      const normalizedLotSize = normalizeOptionalPositiveOrderNumber(body?.lotSize)
      const normalizedLotSizeForSchema = normalizedLotSize === null ? undefined : normalizedLotSize
      if (
        normalizedQuantity === "invalid" ||
        normalizedPrice === "invalid" ||
        normalizedToken === "invalid" ||
        normalizedLotSizeForSchema === "invalid"
      ) {
        return NextResponse.json({ error: "Invalid order payload" }, { status: 400 })
      }
      
      const segmentHint = normalizedSegment || normalizedExchange

      // Enforce market hours per segment (NSE vs MCX windows)
      const { session: tradingWindow, reason: windowReason } = await getSegmentTradingSession(segmentHint)
      console.log("⏱️ [API-ORDERS] marketSessionCheck ms", Math.round(nowMs() - t0))
      if (tradingWindow !== 'open') {
        console.warn(`⛔ [API-ORDERS] Blocked order outside trading window`, {
          segment: segmentHint,
          tradingWindow,
          reason: windowReason
        })
        return NextResponse.json({
          error: windowReason || 'Orders are allowed only during active trading windows.',
          marketSession: tradingWindow
        }, { status: 403 })
      }
      
      // Rate limiting - 20 orders per minute per user
      const rateLimitKey = getRateLimitKey('orders', authenticatedUserId)
      const rateLimit = checkRateLimit(rateLimitKey, RateLimitPresets.TRADING)
      
      if (!rateLimit.allowed) {
        console.warn("⚠️ [API-ORDERS] Rate limit exceeded:", rateLimitKey)
        return NextResponse.json({
          error: 'Too many orders. Please wait before placing more orders.',
          retryAfter: rateLimit.retryAfter
        }, { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RateLimitPresets.TRADING.maxRequests),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
            'Retry-After': String(rateLimit.retryAfter || 60)
          }
        })
      }
      
      const input = placeOrderSchema.parse({
        ...body,
        tradingAccountId: normalizedTradingAccountId,
        quantity: normalizedQuantity,
        price: normalizedPrice,
        token: normalizedToken,
        lotSize: normalizedLotSizeForSchema,
        orderType: normalizedOrderType,
        orderSide: normalizedOrderSide,
        productType: normalizedProductType,
        segment: normalizedSegment,
        exchange: normalizedExchange,
        optionType: normalizedOptionType,
        userId: authenticatedUserId,
      })
      const identityGuardError = resolveOrderIdentityGuardError({
        token: input.token,
        instrumentId: input.instrumentId ?? null,
        optionType: input.optionType ?? null,
        strikePrice: input.strikePrice ?? null,
        expiry: input.expiry ?? null,
      })
      if (identityGuardError) {
        return NextResponse.json({ error: identityGuardError }, { status: 400 })
      }
      await assertTradingAccountOwnership(input.tradingAccountId, authenticatedUserId)
      console.log("✅ [API-ORDERS] Schema validation passed")
      console.log("⏱️ [API-ORDERS] schemaParse ms", Math.round(nowMs() - t0))

      const tradingAccountSnapshot = await prisma.tradingAccount.findUnique({
        where: { id: input.tradingAccountId },
        select: {
          balance: true,
          availableMargin: true,
          usedMargin: true,
        },
      })
      if (!tradingAccountSnapshot) {
        return NextResponse.json({ error: "Trading account not found" }, { status: 404 })
      }
      const normalizedLtpTimestamp = parseFiniteTradingNumber(input.ltpTimestamp)
      const directLtpAgeMs = parseFiniteTradingNumber(input.ltpAgeMs)
      const derivedLtpAgeMs =
        directLtpAgeMs !== null && directLtpAgeMs >= 0
          ? Math.max(0, Math.trunc(directLtpAgeMs))
          : normalizedLtpTimestamp !== null && normalizedLtpTimestamp > 0
            ? Math.max(0, Date.now() - Math.trunc(normalizedLtpTimestamp))
            : null
      const hasFreshClientLtpMetadata =
        derivedLtpAgeMs !== null && derivedLtpAgeMs <= 60_000
      const shouldUseClientLtpForPolicy = input.orderType !== "MARKET" || hasFreshClientLtpMetadata
      const normalizedOrderLtp =
        shouldUseClientLtpForPolicy
          ? parseFiniteTradingNumber(input.ltp) ?? parseFiniteTradingNumber(input.close) ?? 0
          : 0
      const submittedOrderPrice = parseFiniteTradingNumber(input.price)
      const effectiveOrderPrice =
        submittedOrderPrice !== null && submittedOrderPrice > 0 ? submittedOrderPrice : normalizedOrderLtp
      const priceOffsetFromLtp =
        normalizedOrderLtp > 0 ? effectiveOrderPrice - normalizedOrderLtp : undefined
      const priceOffsetFromLtpPercent =
        normalizedOrderLtp > 0 && priceOffsetFromLtp !== undefined
          ? (priceOffsetFromLtp / normalizedOrderLtp) * 100
          : undefined
      const orderTurnover = Math.max(0, effectiveOrderPrice * input.quantity)
      // Minutes elapsed since session open in IST. Open-minute resolution is centralized
      // in `resolveSegmentSessionOpenMinutesIST` so MCX/NCO commodity (09:00), CDS/BCD
      // currency derivatives (09:00), crypto (24/7 → 00:00), and NSE/BSE/IDX (09:15) all
      // produce the right value for the policy engine's early-session window detection.
      const nowISTMs = Date.now() + 330 * 60_000 // IST = UTC+5:30
      const nowIST = new Date(nowISTMs)
      const istMinutesSinceMidnight = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes()
      const normalizedOrderSegment = (input.segment || input.exchange || "NSE").toUpperCase()
      const sessionOpenMinutesIST = resolveSegmentSessionOpenMinutesIST(normalizedOrderSegment)
      const orderMinutesSinceOpen = Math.max(0, istMinutesSinceMidnight - sessionOpenMinutesIST)
      const policyEvaluation = await evaluateTradingPoliciesForContext({
        context: "ORDER_PLACE",
        snapshot: {
          order: {
            quantity: input.quantity,
            price: effectiveOrderPrice,
            side: input.orderSide || null,
            orderType: input.orderType || null,
            ltp: normalizedOrderLtp,
            priceOffsetFromLtp,
            priceOffsetFromLtpPercent,
            turnover: orderTurnover,
            segment: input.segment || input.exchange || null,
            productType: input.productType || null,
            minutesSinceOpen: orderMinutesSinceOpen,
          },
          account: {
            balance: parseFiniteTradingNumber(tradingAccountSnapshot.balance) ?? 0,
            availableMargin: parseFiniteTradingNumber(tradingAccountSnapshot.availableMargin) ?? 0,
            usedMargin: parseFiniteTradingNumber(tradingAccountSnapshot.usedMargin) ?? 0,
          },
          meta: {
            userId: authenticatedUserId,
            tradingAccountId: input.tradingAccountId,
          },
        },
      })
      log.info(
        {
          blocked: policyEvaluation.blocked,
          policyId: policyEvaluation.policy?.id ?? null,
          policyName: policyEvaluation.policy?.name ?? null,
          retryAfterSeconds: policyEvaluation.retryAfterSeconds,
          orderSide: input.orderSide,
          orderType: input.orderType,
          segment: input.segment || input.exchange || null,
        },
        policyEvaluation.blocked
          ? "order placement blocked by policy"
          : "order placement allowed by policy engine",
      )

      if (policyEvaluation.blocked) {
        const statusCode = policyEvaluation.retryAfterSeconds > 0 ? 423 : 403
        const responseHeaders =
          policyEvaluation.retryAfterSeconds > 0
            ? { "Retry-After": String(policyEvaluation.retryAfterSeconds) }
            : undefined
        return NextResponse.json(
          {
            error: policyEvaluation.message || "Order blocked by admin policy.",
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
          { status: statusCode, headers: responseHeaders },
        )
      }
      
      // Track performance
      const orderResult = await trackOperation('order_placement', async () => {
        const executionInput = {
          ...input,
          ltpTimestamp:
            normalizedLtpTimestamp !== null && normalizedLtpTimestamp > 0
              ? Math.trunc(normalizedLtpTimestamp)
              : undefined,
          ltpAgeMs: derivedLtpAgeMs ?? undefined,
        }
        // Create logger with context
        const logger = createTradingLogger({
          tradingAccountId: input.tradingAccountId,
          userId: input.userId,
          clientId: input.userId,
          symbol: input.symbol
        })
        
        // Create service and place order
        const orderService = createOrderExecutionService(logger)
        return await orderService.placeOrder(executionInput)
      }, { userId: input.userId, symbol: input.symbol })
      console.log("⏱️ [API-ORDERS] placeOrder_total ms", Math.round(nowMs() - t0))
      
      console.log("🎉 [API-ORDERS] Order placement result:", orderResult)
      
      // Vercel/serverless support: best-effort background execution so orders don't remain PENDING forever.
      // This must be idempotent / concurrency-safe (worker is hardened with DB advisory locks).
      if (orderResult?.executionScheduled && orderResult?.orderId) {
        enqueueBackgroundTask(orderExecutionWorker.processOrderById(orderResult.orderId))
      }

      // Cache response for idempotency replay before returning.
      if (idempotencyKey !== null) {
        await storeIdempotencyResponse(authenticatedUserId, idempotencyKey, orderResult, IDEMPOTENCY_TTL_SECONDS)
      }

      const httpStatus = orderResult?.executionScheduled ? 202 : 200
      return NextResponse.json(orderResult, {
        status: httpStatus,
        headers: {
          'X-RateLimit-Limit': String(RateLimitPresets.TRADING.maxRequests),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': rateLimit.resetAt.toISOString()
        }
      })
    })

    return result
  } catch (error: any) {
    console.error("❌ [API-ORDERS] POST error:", {
      name: error?.name,
      message: error?.message,
      issues: error?.issues
    })
    console.log("⏱️ [API-ORDERS] total_failed ms", Math.round(nowMs() - t0))
    
    const { message, status } = resolveTradingErrorResponse(error, "Invalid request", 500)
    
    console.log("📤 [API-ORDERS] Sending error response:", { message, status })
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: Request) {
  console.log("🌐 [API-ORDERS] PATCH request received")
  
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_orders_patch" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()
      const body = await req.json()
      console.log("📝 [API-ORDERS] Modify request body:", body)
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }
    assertRequestedUserScope(body?.userId, authenticatedUserId)
      const normalizedPrice = normalizeOptionalOrderPrice(body?.price)
      const normalizedQuantity = normalizeOptionalOrderQuantity(body?.quantity)
      if (normalizedPrice === "invalid" || normalizedQuantity === "invalid") {
        return NextResponse.json({ error: "Invalid order updates" }, { status: 400 })
      }
      if (normalizedPrice === undefined && normalizedQuantity === undefined) {
        return NextResponse.json({ error: "Provide price or quantity" }, { status: 400 })
      }
      const normalizedOrderId = typeof body?.orderId === "string" ? body.orderId.trim() : body?.orderId
      if (!normalizedOrderId) {
        return NextResponse.json({ error: "Order ID required" }, { status: 400 })
      }
      
      const input = modifyOrderSchema.parse({
        ...body,
        orderId: normalizedOrderId,
        price: normalizedPrice,
        quantity: normalizedQuantity,
      })
      console.log("✅ [API-ORDERS] Modify schema validation passed")
      await assertOrderOwnership(input.orderId, authenticatedUserId)
      
      // Create service and modify order
      const orderService = createOrderExecutionService()
      const patchResult = await orderService.modifyOrder(input.orderId, {
        price: input.price,
        quantity: input.quantity
      })
      console.log("🎉 [API-ORDERS] Order modification result:", patchResult)
      
      return NextResponse.json(patchResult, { status: 200 })
    })

    return result
  } catch (error: any) {
    console.error("❌ [API-ORDERS] PATCH error:", {
      name: error?.name,
      message: error?.message,
      issues: error?.issues
    })
    
    const { message, status } = resolveTradingErrorResponse(error, "Invalid request", 500)
    
    console.log("📤 [API-ORDERS] Sending modify error response:", { message, status })
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: Request) {
  console.log("🌐 [API-ORDERS] DELETE request received")
  
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_orders_delete" }, async () => {
      const authenticatedUserId = await requireAuthenticatedUserId()
      const body = await req.json()
      console.log("📝 [API-ORDERS] Cancel request body:", body)
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
      }
    assertRequestedUserScope(body?.userId, authenticatedUserId)
      const normalizedOrderId = typeof body?.orderId === "string" ? body.orderId.trim() : body?.orderId
      if (!normalizedOrderId) {
        return NextResponse.json({ error: "Order ID required" }, { status: 400 })
      }
      
      const input = cancelOrderSchema.parse({
        ...body,
        orderId: normalizedOrderId,
      })
      console.log("✅ [API-ORDERS] Cancel schema validation passed")
      await assertOrderOwnership(input.orderId, authenticatedUserId)
      
      // Create service and cancel order
      const orderService = createOrderExecutionService()
      const deleteResult = await orderService.cancelOrder(input.orderId)
      console.log("🎉 [API-ORDERS] Order cancellation result:", deleteResult)
      
      return NextResponse.json(deleteResult, { status: 200 })
    })

    return result
  } catch (error: any) {
    console.error("❌ [API-ORDERS] DELETE error:", {
      name: error?.name,
      message: error?.message,
      issues: error?.issues
    })
    
    const { message, status } = resolveTradingErrorResponse(error, "Invalid request", 500)
    
    console.log("📤 [API-ORDERS] Sending cancel error response:", { message, status })
    return NextResponse.json({ error: message }, { status })
  }
}
