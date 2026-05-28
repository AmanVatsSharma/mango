/**
 * @file admin-position-exit-price.ts
 * @module server
 * @description Exit price resolution for admin PATCH position close (live / DB LTP / manual).
 * @author StockTrade
 * @created 2026-03-30
 * @updated 2026-03-30
 */

import {
  resolvePositionRowInstrumentToken,
  resolvePositionRowSubscriptionIdentity,
} from "@/lib/server/position-instrument-resolution"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import type { MarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import {
  clientExitWithinDeviationOfReference,
  resolveSquareOffExitPrice,
  type SquareOffExitPriceAudit,
} from "@/lib/server/position-square-off-exit-price"

export function effectiveAdminCloseDeviationBps(policies: MarketDisplayPositionPricingPolicies): number {
  return policies.adminPositionCloseMaxDeviationBps ?? policies.positionSquareOffClientMaxDeviationBps
}

export type AdminExitPriceMode = "live" | "stock_ltp" | "manual"

const MARKET_LIVE_QUOTE_MAX_AGE_MS = 60_000
const MARKET_LIVE_QUOTE_TIMEOUT_MS = 3_000

export type AdminPositionStockSlice = {
  token: number | null
  instrumentId: string | null
  exchange: string | null
  segment: string | null
  ltp: number | null | unknown
  lot_size?: number | null | unknown
}

export type ResolveAdminCloseExitPriceInput = {
  mode: AdminExitPriceMode
  manualExitPrice?: number | undefined
  /** Client-assisted live: optional tick + freshness (same as net close) */
  assistedExitPrice?: number | null
  ltpAgeMs?: number | null
  ltpTimestamp?: number | null
  positionId: string
  /** Position-row instrument identity (token/instrumentId preferred over stock when set). */
  position?: {
    token?: unknown
    instrumentId?: string | null
    segment?: string | null
    exchange?: string | null
  } | null
  stock: AdminPositionStockSlice
  policies: MarketDisplayPositionPricingPolicies
  positionAveragePrice: number
  nowMs: number
}

export type ResolveAdminCloseExitPriceOk = {
  ok: true
  price: number
  exitPriceSource: string
  exitPriceAudit?: SquareOffExitPriceAudit
}

export type ResolveAdminCloseExitPriceErr = {
  ok: false
  status: number
  code: string
  message: string
}

export type ResolveAdminCloseExitPriceResult =
  | ResolveAdminCloseExitPriceOk
  | ResolveAdminCloseExitPriceErr

/**
 * Resolves executed exit price for admin single-row close.
 */
export async function resolveAdminCloseExitPrice(
  input: ResolveAdminCloseExitPriceInput,
): Promise<ResolveAdminCloseExitPriceResult> {
  const {
    mode,
    manualExitPrice,
    assistedExitPrice,
    ltpAgeMs,
    ltpTimestamp,
    positionId,
    position: positionRow,
    stock,
    policies,
    positionAveragePrice,
    nowMs,
  } = input

  if (mode === "manual") {
    const px =
      manualExitPrice !== undefined && manualExitPrice !== null
        ? parseFiniteTradingNumber(manualExitPrice)
        : null
    if (px === null || px <= 0) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "exitPrice is required for manual exit mode",
      }
    }

    const positionSlice = positionRow ?? {}
    const stockSlice = {
      token: stock.token,
      uirId: (stock as { uirId?: unknown }).uirId,
      instrumentId: stock.instrumentId ?? null,
      segment: stock.segment ?? null,
      exchange: stock.exchange ?? null,
      canonicalSymbol: (stock as { canonicalSymbol?: string | null }).canonicalSymbol ?? null,
    }
    const stockToken = resolvePositionRowInstrumentToken(positionSlice, stockSlice)
    const subscriptionKey =
      stockToken !== null
        ? resolvePositionRowSubscriptionIdentity(positionSlice, stockSlice).subscriptionKey ?? stockToken
        : null

    const adminBps = effectiveAdminCloseDeviationBps(policies)
    let manualAudit: SquareOffExitPriceAudit | undefined
    if (stockToken !== null && subscriptionKey !== null && adminBps > 0) {
      const ref = await resolveSquareOffExitPrice({
        nowMs,
        exitPriceCandidate: undefined,
        ltpAgeMsCandidate: undefined,
        ltpTimestampCandidate: undefined,
        authority: policies.positionSquareOffPriceAuthority,
        closeExitPolicy: policies.positionCloseExitPricePolicy,
        maxDeviationBps: adminBps,
        positionId,
        stockToken,
        subscriptionKey,
        markLiveQuoteMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
        pnlServerMaxAgeMs: policies.pnlServerMaxAgeMs,
        positionPnlQuoteMaxAgeMs: policies.positionPnlQuoteMaxAgeMs,
        redisMarketQuoteMaxAgeMs: policies.redisMarketQuoteMaxAgeMs,
        quoteTimeoutMs: MARKET_LIVE_QUOTE_TIMEOUT_MS,
        allowLastSubscriptionTickFallback: policies.adminSquareOffAllowLastSubscriptionTick,
        useClientPriceWhenWithinBand: false,
        referenceDivergenceMaxBps: policies.positionCloseReferenceDivergenceMaxBps,
      })
      if (ref.ok) {
        if (!clientExitWithinDeviationOfReference(px, ref.price, adminBps)) {
          return {
            ok: false,
            status: 422,
            code: "EXIT_PRICE_DEVIATION",
            message: `Manual exit price deviates too far from market reference (₹${ref.price.toFixed(2)}). Adjust price or use LTP/live mode.`,
          }
        }
        manualAudit = {
          clientIntendedPrice: px,
          referencePrice: ref.price,
          deviationBpsActual:
            Math.round((Math.abs(px - ref.price) / ref.price) * 10_000) || null,
          executedWithClientPrice: true,
        }
      }
    }

    return { ok: true, price: px, exitPriceSource: "manual", exitPriceAudit: manualAudit }
  }

  if (mode === "stock_ltp") {
    const ltp = parseFiniteTradingNumber(stock.ltp)
    const avg = parseFiniteTradingNumber(positionAveragePrice) ?? 0
    const price = ltp !== null && ltp > 0 ? ltp : avg > 0 ? avg : null
    if (price === null || price <= 0) {
      return {
        ok: false,
        status: 422,
        code: "EXIT_PRICE_UNAVAILABLE",
        message: "Stock LTP unavailable; set LTP on the instrument or use live/manual exit mode.",
      }
    }
    return {
      ok: true,
      price,
      exitPriceSource: "stock_ltp",
      exitPriceAudit: {
        clientIntendedPrice: null,
        referencePrice: price,
        deviationBpsActual: null,
        executedWithClientPrice: false,
      },
    }
  }

  const positionSlice = positionRow ?? {}
  const stockSlice = {
    token: stock.token,
    uirId: (stock as { uirId?: unknown }).uirId,
    instrumentId: stock.instrumentId ?? null,
    segment: stock.segment ?? null,
    exchange: stock.exchange ?? null,
    canonicalSymbol: (stock as { canonicalSymbol?: string | null }).canonicalSymbol ?? null,
  }
  const stockToken = resolvePositionRowInstrumentToken(positionSlice, stockSlice)
  if (stockToken === null) {
    return {
      ok: false,
      status: 422,
      code: "EXIT_PRICE_UNAVAILABLE",
      message: "Unable to resolve instrument token for live exit price; use stock LTP or manual mode.",
    }
  }

  const subscriptionKey =
    resolvePositionRowSubscriptionIdentity(positionSlice, stockSlice).subscriptionKey ?? stockToken

  const adminBps = effectiveAdminCloseDeviationBps(policies)
  const exitResolved = await resolveSquareOffExitPrice({
    nowMs,
    exitPriceCandidate: assistedExitPrice ?? undefined,
    ltpAgeMsCandidate: ltpAgeMs ?? undefined,
    ltpTimestampCandidate: ltpTimestamp ?? undefined,
    authority: policies.positionSquareOffPriceAuthority,
    closeExitPolicy: policies.positionCloseExitPricePolicy,
    maxDeviationBps: adminBps,
    positionId,
    stockToken,
    subscriptionKey,
    markLiveQuoteMaxAgeMs: MARKET_LIVE_QUOTE_MAX_AGE_MS,
    pnlServerMaxAgeMs: policies.pnlServerMaxAgeMs,
    positionPnlQuoteMaxAgeMs: policies.positionPnlQuoteMaxAgeMs,
    redisMarketQuoteMaxAgeMs: policies.redisMarketQuoteMaxAgeMs,
    quoteTimeoutMs: MARKET_LIVE_QUOTE_TIMEOUT_MS,
    allowLastSubscriptionTickFallback: policies.adminSquareOffAllowLastSubscriptionTick,
    useClientPriceWhenWithinBand: policies.positionCloseUseClientPriceWhenWithinBand,
    clientIntendedExitPrice: assistedExitPrice ?? undefined,
    referenceDivergenceMaxBps: policies.positionCloseReferenceDivergenceMaxBps,
  })

  if (!exitResolved.ok) {
    const status =
      exitResolved.status === 400 && exitResolved.code !== "MARKET_DATA_DEGRADED" ? 422 : exitResolved.status
    return {
      ok: false,
      status,
      code: exitResolved.code ?? "EXIT_PRICE_UNAVAILABLE",
      message:
        exitResolved.error ||
        "Live quote unavailable; retry or use stock LTP / manual exit mode.",
    }
  }

  return {
    ok: true,
    price: exitResolved.price,
    exitPriceSource: exitResolved.source,
    exitPriceAudit: exitResolved.audit,
  }
}

/**
 * Infer admin exit mode from legacy payload (backward compatible).
 */
export function normalizeAdminExitPriceMode(
  raw: unknown,
  hasExplicitExitPrice: boolean,
): AdminExitPriceMode {
  if (raw === "live" || raw === "stock_ltp" || raw === "manual") {
    return raw
  }
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase()
    if (s === "ltp" || s === "stock_ltp") return "stock_ltp"
    if (s === "live") return "live"
    if (s === "manual") return "manual"
  }
  return hasExplicitExitPrice ? "manual" : "live"
}
