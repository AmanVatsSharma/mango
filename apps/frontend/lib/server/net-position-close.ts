/**
 * @file net-position-close.ts
 * @module server
 * @description Shared net square-off (FIFO across lot rows) for retail and admin routes.
 * @author StockTrade
 * @created 2026-03-30
 */

import { prisma } from "@/lib/prisma"
import { createPositionManagementService } from "@/lib/services/position/PositionManagementService"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { evaluateTradingPoliciesForContext } from "@/lib/services/risk/dynamic-trading-policies"
import {
  normalizeRiskConfigProductType,
  resolveRiskConfigProductTypeCandidates,
} from "@/lib/services/risk/risk-config-normalizer"
import {
  resolvePositionRowInstrumentToken,
  resolvePositionRowSubscriptionIdentity,
} from "@/lib/server/position-instrument-resolution"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { getMarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import {
  resolveSquareOffExitPrice,
  type SquareOffExitPriceAudit,
} from "@/lib/server/position-square-off-exit-price"

export type NetPositionClosePolicyMode = "retail" | "admin_override"

const MARKET_LIVE_QUOTE_MAX_AGE_MS = 60_000
const MARKET_LIVE_QUOTE_TIMEOUT_MS = 3_000

export type NetPositionCloseTradingAccount = {
  id: string
  balance: unknown
  availableMargin: unknown
  usedMargin: unknown
}

export type NetExitPriceMode = "live" | "stock_ltp" | "manual"

export type ExecuteNetPositionCloseParams = {
  tradingAccount: NetPositionCloseTradingAccount
  /** User id for retail policy snapshot; when `policyMode` is admin_override this may be null */
  policyUserId: string | null
  policyMode: NetPositionClosePolicyMode
  requestedStockId: string
  requestedInstrumentId: string | null
  requestedToken: number | null
  productTypeRaw: string
  closeQuantityCandidate?: number
  closeLotsCandidate?: number
  exitPriceCandidate?: number | null
  ltpAgeMsCandidate?: number | null
  ltpTimestampCandidate?: number | null
  /** Retail net close defaults to live; admin may set stock_ltp or manual */
  exitPriceMode?: NetExitPriceMode
  /** Required when exitPriceMode is manual */
  manualExitPrice?: number
  nowMs: number
  adminUserId?: string
}

export type NetPositionCloseResult =
  | { kind: "success"; data: Record<string, unknown> }
  | { kind: "error"; status: number; body: Record<string, unknown>; headers?: Record<string, string> }

/**
 * Core net close: aggregate open lots for stock + product type, resolve exit price, FIFO `closePosition` calls.
 */
export async function executeNetPositionClose(
  params: ExecuteNetPositionCloseParams,
): Promise<NetPositionCloseResult> {
  const {
    tradingAccount,
    policyUserId,
    policyMode,
    requestedStockId,
    requestedInstrumentId,
    requestedToken,
    productTypeRaw,
    closeQuantityCandidate,
    closeLotsCandidate,
    exitPriceCandidate,
    ltpAgeMsCandidate,
    ltpTimestampCandidate,
    nowMs,
    exitPriceMode = "live",
    manualExitPrice,
  } = params

  const productType = normalizeRiskConfigProductType(productTypeRaw)
  const productTypeCandidates = resolveRiskConfigProductTypeCandidates(productTypeRaw)

  const fetchLotsByStockId = (stockId: string) =>
    prisma.position.findMany({
      where: {
        tradingAccountId: tradingAccount.id,
        stockId,
        productType: { in: productTypeCandidates },
        quantity: { not: 0 },
      },
      select: {
        id: true,
        symbol: true,
        quantity: true,
        averagePrice: true,
        unrealizedPnL: true,
        createdAt: true,
        productType: true,
        isIntraday: true,
        token: true,
        instrumentId: true,
        segment: true,
        exchange: true,
        Stock: {
          select: {
            id: true,
            segment: true,
            lot_size: true,
            instrumentId: true,
            token: true,
            exchange: true,
            ltp: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

  let effectiveStockId = requestedStockId
  let lots = await fetchLotsByStockId(effectiveStockId)

  if (lots.length === 0) {
    const identityClauses: { token?: number; instrumentId?: string }[] = []
    if (requestedToken !== null) {
      identityClauses.push({ token: requestedToken })
    }
    if (requestedInstrumentId) {
      identityClauses.push({ instrumentId: requestedInstrumentId })
    }
    if (identityClauses.length > 0) {
      const recoveredStock = await prisma.stock.findFirst({
        where: { OR: identityClauses },
        select: { id: true },
      })
      if (recoveredStock?.id) {
        effectiveStockId = recoveredStock.id
        lots = await fetchLotsByStockId(effectiveStockId)
      }
    }
  }

  if (lots.length === 0) {
    return {
      kind: "error",
      status: 404,
      body: { error: `No open ${productType} position found for this instrument.` },
    }
  }

  const signedNetQuantity = lots.reduce(
    (sum, lot) => sum + Math.trunc(parseFiniteTradingNumber(lot.quantity) ?? 0),
    0,
  )
  const openAbsQuantity = Math.abs(signedNetQuantity)
  if (openAbsQuantity <= 0) {
    return {
      kind: "error",
      status: 400,
      body: { error: "Position is already closed." },
    }
  }

  const symbol = lots[0]?.symbol || "UNKNOWN"
  const lotSize = Math.max(1, Math.trunc(parseFiniteTradingNumber(lots[0]?.Stock?.lot_size) ?? 1))

  let requestedCloseQuantityAbs: number
  if (closeLotsCandidate !== undefined) {
    if (lotSize <= 1) {
      return {
        kind: "error",
        status: 400,
        body: { error: "closeLots is supported only for lot-based instruments." },
      }
    }
    requestedCloseQuantityAbs = closeLotsCandidate * lotSize
  } else if (closeQuantityCandidate !== undefined) {
    requestedCloseQuantityAbs = closeQuantityCandidate
  } else {
    requestedCloseQuantityAbs = openAbsQuantity
  }

  if (requestedCloseQuantityAbs > openAbsQuantity) {
    return {
      kind: "error",
      status: 400,
      body: { error: `closeQuantity cannot exceed open quantity (${openAbsQuantity}).` },
    }
  }

  if (lotSize > 1 && requestedCloseQuantityAbs % lotSize !== 0) {
    return {
      kind: "error",
      status: 400,
      body: { error: `closeQuantity must be in lot multiples of ${lotSize}.` },
    }
  }

  if (policyMode === "retail" && policyUserId) {
    const createdAtMs = Math.min(...lots.map((lot) => lot.createdAt.getTime()))
    const holdMinutes = Math.max(0, (Date.now() - createdAtMs) / 60_000)
    const unrealizedPnl = lots.reduce(
      (sum, lot) => sum + (parseFiniteTradingNumber(lot.unrealizedPnL) ?? 0),
      0,
    )
    const requestedCloseLots = lotSize > 1 ? requestedCloseQuantityAbs / lotSize : 0
    const remainingQuantityAfterClose = Math.max(0, openAbsQuantity - requestedCloseQuantityAbs)

    const policyEvaluation = await evaluateTradingPoliciesForContext({
      context: "POSITION_CLOSE",
      snapshot: {
        position: {
          unrealizedPnl,
          holdMinutes,
          quantity: signedNetQuantity,
          lotSize,
          requestedCloseQuantity: requestedCloseQuantityAbs,
          requestedCloseLots,
          remainingQuantityAfterClose,
          segment: lots[0]?.Stock?.segment || null,
          productType,
        },
        account: {
          balance: parseFiniteTradingNumber(tradingAccount.balance) ?? 0,
          availableMargin: parseFiniteTradingNumber(tradingAccount.availableMargin) ?? 0,
          usedMargin: parseFiniteTradingNumber(tradingAccount.usedMargin) ?? 0,
        },
        meta: {
          userId: policyUserId,
          tradingAccountId: tradingAccount.id,
        },
      },
    })

    if (policyEvaluation.blocked) {
      const statusCode = policyEvaluation.retryAfterSeconds > 0 ? 423 : 403
      const responseHeaders =
        policyEvaluation.retryAfterSeconds > 0
          ? { "Retry-After": String(policyEvaluation.retryAfterSeconds) }
          : undefined
      return {
        kind: "error",
        status: statusCode,
        headers: responseHeaders,
        body: {
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
      }
    }
  }

  const logger = createTradingLogger({
    ...(params.adminUserId ? { userId: params.adminUserId } : {}),
    tradingAccountId: tradingAccount.id,
    symbol,
  })
  const positionService = createPositionManagementService(logger)

  let resolvedExitPrice: number
  let exitPriceSource: string
  let exitPriceAudit: SquareOffExitPriceAudit | undefined

  if (exitPriceMode === "stock_ltp") {
    const ltp = parseFiniteTradingNumber(lots[0]?.Stock?.ltp)
    const avg = parseFiniteTradingNumber(lots[0]?.averagePrice) ?? 0
    const price = ltp !== null && ltp > 0 ? ltp : avg > 0 ? avg : null
    if (price === null || price <= 0) {
      return {
        kind: "error",
        status: 422,
        body: {
          success: false,
          code: "EXIT_PRICE_UNAVAILABLE",
          error: "Stock LTP unavailable; use live or manual exit mode.",
          message: "Stock LTP unavailable; use live or manual exit mode.",
        },
      }
    }
    resolvedExitPrice = price
    exitPriceSource = "stock_ltp"
    exitPriceAudit = {
      clientIntendedPrice: null,
      referencePrice: price,
      deviationBpsActual: null,
      executedWithClientPrice: false,
    }
  } else if (exitPriceMode === "manual") {
    const px =
      manualExitPrice !== undefined && manualExitPrice !== null
        ? parseFiniteTradingNumber(manualExitPrice)
        : null
    if (px === null || px <= 0) {
      return {
        kind: "error",
        status: 400,
        body: {
          success: false,
          code: "VALIDATION_ERROR",
          error: "manual exitPrice is required for manual net-close mode",
          message: "manual exitPrice is required for manual net-close mode",
        },
      }
    }
    resolvedExitPrice = px
    exitPriceSource = "manual"
    exitPriceAudit = {
      clientIntendedPrice: px,
      referencePrice: px,
      deviationBpsActual: 0,
      executedWithClientPrice: true,
    }
  } else {
    const lot0 = lots[0] as {
      token?: unknown
      uirId?: unknown
      instrumentId?: string | null
      segment?: string | null
      exchange?: string | null
      canonicalSymbol?: string | null
      Stock?: {
        token?: unknown
        uirId?: unknown
        instrumentId?: string | null
        segment?: string | null
        exchange?: string | null
        canonicalSymbol?: string | null
      } | null
    }
    // Mirror the frontend WS provider: thread uirId + canonicalSymbol so backend and frontend
    // produce the SAME upstream subscription key — otherwise the gateway treats them as
    // separate subscriptions and the backend never receives ticks for canonical-keyed rows
    // (which surfaces as a stale-quote rejection at square-off time).
    const stockToken = resolvePositionRowInstrumentToken(
      {
        token: lot0?.token,
        uirId: lot0?.uirId,
        instrumentId: lot0?.instrumentId ?? null,
        segment: lot0?.segment ?? null,
        exchange: lot0?.exchange ?? null,
        canonicalSymbol: lot0?.canonicalSymbol ?? null,
      },
      lot0?.Stock ?? null,
    )
    if (stockToken === null) {
      return {
        kind: "error",
        status: 400,
        body: { error: "Unable to resolve instrument token for live exit price." },
      }
    }

    const subscriptionKey =
      resolvePositionRowSubscriptionIdentity(
        {
          token: lot0?.token,
          uirId: lot0?.uirId,
          instrumentId: lot0?.instrumentId ?? null,
          segment: lot0?.segment ?? null,
          exchange: lot0?.exchange ?? null,
          canonicalSymbol: lot0?.canonicalSymbol ?? null,
        },
        lot0?.Stock ?? null,
      ).subscriptionKey ?? stockToken

    const primaryLotId = typeof lots[0]?.id === "string" ? lots[0].id : ""
    const pricingPolicies = await getMarketDisplayPositionPricingPolicies()
    const maxDeviationBps =
      params.policyMode === "admin_override"
        ? (pricingPolicies.adminPositionCloseMaxDeviationBps ??
          pricingPolicies.positionSquareOffClientMaxDeviationBps)
        : pricingPolicies.positionSquareOffClientMaxDeviationBps
    const exitResolved = await resolveSquareOffExitPrice({
      nowMs,
      exitPriceCandidate: exitPriceCandidate ?? undefined,
      ltpAgeMsCandidate: ltpAgeMsCandidate ?? undefined,
      ltpTimestampCandidate: ltpTimestampCandidate ?? undefined,
      authority: pricingPolicies.positionSquareOffPriceAuthority,
      closeExitPolicy: pricingPolicies.positionCloseExitPricePolicy,
      maxDeviationBps,
      positionId: primaryLotId,
      stockToken,
      subscriptionKey,
      markLiveQuoteMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
      pnlServerMaxAgeMs: pricingPolicies.pnlServerMaxAgeMs,
      positionPnlQuoteMaxAgeMs: pricingPolicies.positionPnlQuoteMaxAgeMs,
      redisMarketQuoteMaxAgeMs: pricingPolicies.redisMarketQuoteMaxAgeMs,
      quoteTimeoutMs: MARKET_LIVE_QUOTE_TIMEOUT_MS,
      allowLastSubscriptionTickFallback:
        params.policyMode === "admin_override" &&
        pricingPolicies.adminSquareOffAllowLastSubscriptionTick,
      useClientPriceWhenWithinBand: pricingPolicies.positionCloseUseClientPriceWhenWithinBand,
      clientIntendedExitPrice: exitPriceCandidate ?? undefined,
      referenceDivergenceMaxBps: pricingPolicies.positionCloseReferenceDivergenceMaxBps,
    })

    if (!exitResolved.ok) {
      const status =
        exitResolved.status === 400 && exitResolved.code !== "MARKET_DATA_DEGRADED"
          ? 422
          : exitResolved.status >= 400 && exitResolved.status < 600
            ? exitResolved.status
            : 422
      return {
        kind: "error",
        status,
        body: {
          success: false,
          code: exitResolved.code ?? "EXIT_PRICE_UNAVAILABLE",
          error: exitResolved.error,
          message: exitResolved.error,
        },
      }
    }

    resolvedExitPrice = exitResolved.price
    exitPriceSource = exitResolved.source
    exitPriceAudit = exitResolved.audit
  }

  let remainingAbs = requestedCloseQuantityAbs
  const lotResults: unknown[] = []

  for (const lot of lots) {
    if (remainingAbs <= 0) break
    const lotSignedQty = Math.trunc(parseFiniteTradingNumber(lot.quantity) ?? 0)
    const lotAbsQty = Math.abs(lotSignedQty)
    if (lotAbsQty <= 0) continue
    const closeAbs = Math.min(remainingAbs, lotAbsQty)

    const result = await positionService.closePosition(
      lot.id,
      tradingAccount.id,
      resolvedExitPrice,
      closeAbs,
      params.adminUserId
        ? { reason: "ADMIN_CLOSED" as const, closedByUserId: params.adminUserId }
        : { reason: "USER_CLOSED" as const, closedByUserId: policyUserId ?? null },
    )
    lotResults.push(result)

    const closedQuantity = Math.trunc(parseFiniteTradingNumber((result as { closedQuantity?: unknown }).closedQuantity) ?? 0)
    const msg = String((result as { message?: unknown }).message || "").toLowerCase()
    if (closedQuantity <= 0 && msg.includes("skipped")) {
      return {
        kind: "error",
        status: 409,
        body: {
          success: false,
          code: "POSITION_CLOSE_CONFLICT",
          error: "Position is already closing/closed. Please retry.",
          message: "Position is already closing/closed. Please retry.",
        },
      }
    }
    remainingAbs -= closeAbs
  }

  const closedQuantityAbs = requestedCloseQuantityAbs - Math.max(0, remainingAbs)
  const remainingQuantityAbs = Math.max(0, openAbsQuantity - closedQuantityAbs)
  const realizedPnL = lotResults.reduce<number>(
    (sum, r) => sum + (parseFiniteTradingNumber((r as { realizedPnL?: unknown }).realizedPnL) ?? 0),
    0,
  )
  const marginReleased = lotResults.reduce<number>(
    (sum, r) => sum + (parseFiniteTradingNumber((r as { marginReleased?: unknown }).marginReleased) ?? 0),
    0,
  )

  return {
    kind: "success",
    data: {
      success: true,
      stockId: effectiveStockId,
      productType,
      symbol,
      exitPrice: resolvedExitPrice,
      exitPriceSource,
      exitPriceAudit,
      closedQuantity: closedQuantityAbs,
      remainingQuantity: remainingQuantityAbs,
      realizedPnL,
      marginReleased,
      isPartial: remainingQuantityAbs > 0,
      results: lotResults,
      message:
        remainingQuantityAbs === 0
          ? `Net position closed. P&L: ₹${realizedPnL.toFixed(2)}`
          : `Net position partially closed (${closedQuantityAbs}). Remaining: ${remainingQuantityAbs}. Realized P&L: ₹${realizedPnL.toFixed(2)}`,
    },
  }
}
