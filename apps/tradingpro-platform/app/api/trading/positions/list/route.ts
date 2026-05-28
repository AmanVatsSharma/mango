/**
 * @file route.ts
 * @module api/trading/positions/list
 * @description Positions list endpoint (open + closed) for dashboard streaming.
 * @author StockTrade
 * @created 2025-11-06
 * @updated 2026-04-06
 *
 * Changelog: Stale `market:quote` overlay (`stale_token_redis`) before `Stock.ltp` when within Redis TTL.
 * Changelog: market quote Redis parse uses expectedInstrumentToken.
 */

/**
 * Positions List API
 *
 * Returns list of positions (open and closed) for a user so that the
 * dashboard can highlight booked profits after the quantity reaches zero.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { getPositionPnLSettings } from "@/lib/server/position-pnl-settings"
import { getCurrentISTDate } from "@/lib/date-utils"
import { isRedisEnabled, redisMGet } from "@/lib/redis/redis-client"
import {
  parseRedisPositionPnLSnapshot,
  positionPnlRedisKey,
  type RedisPositionPnLSnapshot,
} from "@/lib/server/position-pnl-redis-snapshot"
import { normalizeOptionalTradingNumber, parseFiniteTradingNumber } from "@/lib/server/trading-number"
import {
  assertRequestedUserScope,
  getRequestSearchParams,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"
import { normalizeMarketDataQuoteMaxAgeMs } from "@/lib/market-data/market-data-number-utils"
import { resolveMarketDisplayQuoteFreshness } from "@/lib/server/market-display-pnl-meta"
import {
  marketQuoteRedisKey,
  parseRedisMarketQuoteSnapshot,
  resolveMarketQuoteRedisTtlSeconds,
  type RedisMarketQuoteSnapshot,
} from "@/lib/server/market-quote-redis"
import { resolvePositionRowInstrumentToken } from "@/lib/server/position-instrument-resolution"
import { getMarketDisplayPositionPricingPolicies } from "@/lib/server/market-display-exit-policy"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"

type ApiPositionPayload = {
  id: string
  symbol: string
  /** Watchlist-aligned one-line instrument description. */
  instrumentLabel: string
  productType: string
  isIntraday: boolean
  identity: {
    stockId: string | null
    instrumentId: string | null
    segment: string | null
    exchange: string | null
    strikePrice: number | null
    optionType: string | null
    expiry: string | null
    token: number | null
  }
  quantity: number
  lotSize: number | null
  instrumentId: string | null
  segment: string | null
  strikePrice: number | null
  optionType: string | null
  expiry: string | null
  token: number | null
  averagePrice: number
  unrealizedPnL: number
  realizedPnL: number
  bookedPnL: number
  dayPnL: number
  pnlUpdatedAtMs: number | null
  stopLoss: number | null
  target: number | null
  createdAt: string
  closedAt: string | null
  status: "OPEN" | "CLOSED"
  isClosed: boolean
  currentPrice: number
  currentValue: number
  investedValue: number
  stock: {
    symbol: string | null
    name: string | null
    ltp: number | null
    instrumentId: string | null
    exchange: string | null
    segment: string | null
    lotSize: number | null
    strikePrice: number | null
    optionType: string | null
    expiry: string | null
    token: number | null
  } | null
  /** Resolved subscription token (position row before stock). */
  instrumentToken: number | null
  /** Which source drove `currentPrice` / open MTM for this row. */
  priceSource:
    | "redis_position_pnl"
    | "redis_market_quote"
    | "redis_market_quote_stale"
    | "stock_ltp"
    | "average_price_fallback"
    | "closed"
  /** Age of the tick used for the mark (ms), when known. */
  markAgeTickMs: number | null
  /** Policy-aligned tier for support / UI diagnostics. */
  freshnessTier:
    | "live_token_redis"
    | "stale_token_redis"
    | "position_pnl_redis"
    | "stock_ltp"
    | "fallback"
    | "closed"
}

function normalizeOptionalNumber(value: unknown): number | null {
  return normalizeOptionalTradingNumber(value)
}

function formatYyyyMmDd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function resolveTodayIstRange(): { start: Date; end: Date; dateKeyIst: string } {
  const istNow = getCurrentISTDate()
  const dateKeyIst = formatYyyyMmDd(istNow)
  const start = new Date(`${dateKeyIst}T00:00:00.000+05:30`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end, dateKeyIst }
}

export async function GET(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_positions_list" }, async () => {
      const searchParams = getRequestSearchParams(req)
      const userId = searchParams.get("userId")

      const authenticatedUserId = await requireAuthenticatedUserId()

      // Ensure user can only fetch their own data
      try {
        assertRequestedUserScope(userId, authenticatedUserId)
      } catch (error) {
        console.warn("🚫 [API-POSITIONS-LIST] Forbidden request", {
          sessionUserId: authenticatedUserId,
          requestedUserId: userId
        })
        throw error
      }

      const accountId = searchParams.get('accountId')

      // Get trading account — prefer accountId, fallback to user's primary account
      let tradingAccount
      if (accountId) {
        tradingAccount = await prisma.tradingAccount.findUnique({
          where: { id: accountId },
          select: { id: true, userId: true },
        })
        if (!tradingAccount || tradingAccount.userId !== authenticatedUserId) {
          return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 })
        }
        tradingAccount = await prisma.tradingAccount.findUnique({ where: { id: accountId } })
      } else {
        tradingAccount = await prisma.tradingAccount.findFirst({
          where: { userId: authenticatedUserId },
          orderBy: [{ accountType: "asc" }],
        })
      }

      const [pnlSettings, positionPricing, quoteFresh] = await Promise.all([
        getPositionPnLSettings(),
        getMarketDisplayPositionPricingPolicies(),
        resolveMarketDisplayQuoteFreshness(),
      ])
      const redisPnlMaxAgeMs = quoteFresh.pnlServerMaxAgeMs
      const marketQuoteMaxAgeMs = quoteFresh.redisMarketQuoteMaxAgeMs

      if (!tradingAccount) {
        return NextResponse.json({
          success: true,
          positions: [],
          meta: {
            pnlMode: pnlSettings.mode,
            workerHealthy: pnlSettings.workerHealthy,
            pnlMaxAgeMs: redisPnlMaxAgeMs,
            positionsTabMtmDisplayMode: positionPricing.positionsTabMtmDisplayMode,
            positionSquareOffPriceAuthority: positionPricing.positionSquareOffPriceAuthority,
            pricingDebug: {
              redisPositionPnlMaxAgeMs: redisPnlMaxAgeMs,
              redisMarketQuoteMaxAgeMs: marketQuoteMaxAgeMs,
              positionPnlQuoteMaxAgeMs: quoteFresh.positionPnlQuoteMaxAgeMs,
              marketQuoteRedisWriteMinIntervalMs: quoteFresh.marketQuoteRedisWriteMinIntervalMs,
              marketdataQuoteMaxAgeMs: normalizeMarketDataQuoteMaxAgeMs(
                process.env.MARKETDATA_QUOTE_MAX_AGE_MS,
                7_500,
              ),
            },
          },
        })
      }

      // Fetch open positions + only today's closed positions (IST) so Booked(Today) stays bounded.
      const { start: todayStartIst, end: todayEndIst } = resolveTodayIstRange()

      const [openPositionsRaw, closedPositionsRaw] = await Promise.all([
        prisma.position.findMany({
          where: {
            tradingAccountId: tradingAccount.id,
            quantity: { not: 0 },
          },
          include: {
            Stock: {
              select: {
                symbol: true,
                name: true,
                ltp: true,
                instrumentId: true,
                exchange: true,
                segment: true,
                lot_size: true,
                strikePrice: true,
                optionType: true,
                expiry: true,
                token: true,
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }),
        prisma.position.findMany({
          where: {
            tradingAccountId: tradingAccount.id,
            quantity: 0,
            closedAt: {
              gte: todayStartIst,
              lt: todayEndIst,
            },
          },
          include: {
            Stock: {
              select: {
                symbol: true,
                name: true,
                ltp: true,
                instrumentId: true,
                exchange: true,
                segment: true,
                lot_size: true,
                strikePrice: true,
                optionType: true,
                expiry: true,
                token: true,
              }
            }
          },
          orderBy: {
            closedAt: "desc"
          }
        }),
      ])

      const openPositions: ApiPositionPayload[] = []
      const closedPositions: ApiPositionPayload[] = []

      // Optional: overlay PnL from Redis cache for smoother server-side PnL mode.
      const redisPnLByPositionId = new Map<string, RedisPositionPnLSnapshot>()
      if (isRedisEnabled() && openPositionsRaw.length > 0) {
        try {
          const nowMs = Date.now()
          const keys = openPositionsRaw.map((p) => positionPnlRedisKey(p.id))
          const values = await redisMGet(keys)
          values.forEach((raw, idx) => {
            const parsedSnapshot = parseRedisPositionPnLSnapshot(raw, redisPnlMaxAgeMs, nowMs, {
              positionPnlQuoteMaxAgeMs: quoteFresh.positionPnlQuoteMaxAgeMs,
            })
            if (!parsedSnapshot) return
            const positionId = openPositionsRaw[idx]?.id
            if (!positionId) return
            redisPnLByPositionId.set(positionId, parsedSnapshot)
          })
        } catch {
          // Best-effort overlay only
        }
      }

      const marketQuoteByToken = new Map<number, RedisMarketQuoteSnapshot>()
      const staleMarketQuoteByToken = new Map<number, RedisMarketQuoteSnapshot>()
      if (isRedisEnabled() && openPositionsRaw.length > 0) {
        try {
          const nowMsMq = Date.now()
          const staleQuoteMaxAgeMs = Math.max(
            marketQuoteMaxAgeMs,
            resolveMarketQuoteRedisTtlSeconds() * 1000,
          )
          const tokenSet = new Set<number>()
          for (const rawPos of openPositionsRaw) {
            const t = resolvePositionRowInstrumentToken(
              {
                token: rawPos.token,
                instrumentId: typeof rawPos.instrumentId === "string" ? rawPos.instrumentId : null,
                segment: typeof rawPos.segment === "string" ? rawPos.segment : null,
                exchange: typeof rawPos.exchange === "string" ? rawPos.exchange : null,
              },
              rawPos.Stock
                ? {
                    token: rawPos.Stock.token,
                    instrumentId: rawPos.Stock.instrumentId ?? null,
                    segment: rawPos.Stock.segment ?? null,
                    exchange: rawPos.Stock.exchange ?? null,
                  }
                : null,
            )
            if (t !== null && t > 0) {
              tokenSet.add(t)
            }
          }
          const tokenList = Array.from(tokenSet)
          if (tokenList.length > 0) {
            const mqKeys = tokenList.map((t) => marketQuoteRedisKey(t))
            const mqVals = await redisMGet(mqKeys)
            tokenList.forEach((t, i) => {
              const snap = parseRedisMarketQuoteSnapshot(mqVals[i], marketQuoteMaxAgeMs, nowMsMq, {
                expectedInstrumentToken: t,
              })
              if (snap) {
                marketQuoteByToken.set(t, snap)
                return
              }
              const staleSnap = parseRedisMarketQuoteSnapshot(mqVals[i], staleQuoteMaxAgeMs, nowMsMq, {
                expectedInstrumentToken: t,
              })
              if (staleSnap) {
                staleMarketQuoteByToken.set(t, staleSnap)
              }
            })
          }
        } catch {
          // Best-effort token quote overlay
        }
      }

      const mapPosition = (
        position: any,
        redisPnL: RedisPositionPnLSnapshot | null,
        marketQuotes: Map<number, RedisMarketQuoteSnapshot>,
        staleMarketQuotes: Map<number, RedisMarketQuoteSnapshot>,
      ): ApiPositionPayload => {
        const quantity = Math.trunc(parseFiniteTradingNumber(position.quantity) ?? 0)
        const isClosed = quantity === 0
        const averagePrice = parseFiniteTradingNumber(position.averagePrice) ?? 0
        const persistedPnL = parseFiniteTradingNumber(position.unrealizedPnL) ?? 0
        const persistedDayPnL = parseFiniteTradingNumber(position.dayPnL) ?? 0
        const stockLtp = normalizeOptionalNumber(position.Stock?.ltp)
        const stopLoss = normalizeOptionalNumber(position.stopLoss)
        const target = normalizeOptionalNumber(position.target)
        const lotSize = normalizeOptionalNumber(position.Stock?.lot_size)
        const strikePrice = normalizeOptionalNumber(position.Stock?.strikePrice)
        const optionType = position.Stock?.optionType ? String(position.Stock.optionType) : null
        const expiry =
          position.Stock?.expiry instanceof Date
            ? position.Stock.expiry.toISOString()
            : null
        const token = normalizeOptionalNumber(position.Stock?.token)
        const positionStrikePrice = normalizeOptionalNumber(position.strikePrice)
        const positionOptionType = position.optionType ? String(position.optionType) : null
        const positionExpiry =
          position?.expiry instanceof Date
            ? position.expiry.toISOString()
            : null
        const positionToken = normalizeOptionalNumber(position.token)
        const positionInstrumentId =
          typeof position.instrumentId === "string" && position.instrumentId.trim()
            ? position.instrumentId
            : position.Stock?.instrumentId ?? null
        const positionSegment =
          typeof position.segment === "string" && position.segment.trim()
            ? position.segment
            : position.Stock?.segment ?? null
        const positionExchange =
          typeof position.exchange === "string" && position.exchange.trim()
            ? position.exchange
            : position.Stock?.exchange ?? null
        const normalizedProductType =
          typeof position.productType === "string" && position.productType.trim()
            ? position.productType.trim().toUpperCase()
            : "MIS"
        const normalizedIsIntraday =
          typeof position.isIntraday === "boolean"
            ? position.isIntraday
            : normalizedProductType === "MIS" || normalizedProductType === "INTRADAY"

        const instrumentTokenResolved = resolvePositionRowInstrumentToken(
          {
            token: position.token,
            instrumentId: typeof position.instrumentId === "string" ? position.instrumentId : null,
            segment: typeof position.segment === "string" ? position.segment : null,
            exchange: typeof position.exchange === "string" ? position.exchange : null,
          },
          position.Stock
            ? {
                token: position.Stock.token,
                instrumentId: position.Stock.instrumentId ?? null,
                segment: position.Stock.segment ?? null,
                exchange: position.Stock.exchange ?? null,
              }
            : null,
        )
        const marketSnap =
          !isClosed && instrumentTokenResolved
            ? marketQuotes.get(instrumentTokenResolved) ?? null
            : null
        const staleMarketSnap =
          !isClosed && instrumentTokenResolved && !marketSnap
            ? staleMarketQuotes.get(instrumentTokenResolved) ?? null
            : null

        let currentPrice: number
        let openPositionUnrealizedPnL: number
        let openPositionDayPnL: number
        let pnlUpdatedAtMsOpen: number | null
        let priceSource: ApiPositionPayload["priceSource"]
        let markAgeTickMs: number | null = null
        let freshnessTier: ApiPositionPayload["freshnessTier"]
        const rowNowMs = Date.now()

        if (isClosed) {
          currentPrice = stockLtp ?? averagePrice
          openPositionUnrealizedPnL = persistedPnL
          openPositionDayPnL = persistedDayPnL
          pnlUpdatedAtMsOpen = null
          priceSource = "closed"
          freshnessTier = "closed"
        } else if (marketSnap) {
          currentPrice = marketSnap.last_trade_price
          const prevClose =
            marketSnap.prev_close_price !== undefined &&
            typeof marketSnap.prev_close_price === "number" &&
            marketSnap.prev_close_price > 0
              ? marketSnap.prev_close_price
              : averagePrice > 0
                ? averagePrice
                : 0
          openPositionUnrealizedPnL = Number(
            ((currentPrice - averagePrice) * quantity).toFixed(2),
          )
          openPositionDayPnL = Number(((currentPrice - prevClose) * quantity).toFixed(2))
          pnlUpdatedAtMsOpen = marketSnap.receivedAtMs
          priceSource = "redis_market_quote"
          markAgeTickMs = Math.max(0, rowNowMs - marketSnap.receivedAtMs)
          freshnessTier = "live_token_redis"
        } else if (staleMarketSnap) {
          currentPrice = staleMarketSnap.last_trade_price
          const prevCloseStale =
            staleMarketSnap.prev_close_price !== undefined &&
            typeof staleMarketSnap.prev_close_price === "number" &&
            staleMarketSnap.prev_close_price > 0
              ? staleMarketSnap.prev_close_price
              : averagePrice > 0
                ? averagePrice
                : 0
          openPositionUnrealizedPnL = Number(
            ((currentPrice - averagePrice) * quantity).toFixed(2),
          )
          openPositionDayPnL = Number(((currentPrice - prevCloseStale) * quantity).toFixed(2))
          pnlUpdatedAtMsOpen = staleMarketSnap.receivedAtMs
          priceSource = "redis_market_quote_stale"
          markAgeTickMs = Math.max(0, rowNowMs - staleMarketSnap.receivedAtMs)
          freshnessTier = "stale_token_redis"
        } else if (redisPnL) {
          const redisPx = parseFiniteTradingNumber(redisPnL.currentPrice)
          currentPrice =
            redisPx !== null && redisPx > 0 ? redisPx : stockLtp ?? averagePrice
          openPositionUnrealizedPnL = redisPnL.unrealizedPnL
          openPositionDayPnL = redisPnL.dayPnL
          pnlUpdatedAtMsOpen = redisPnL.updatedAtMs
          priceSource = "redis_position_pnl"
          const tickMs = redisPnL.quoteReceivedAtMs ?? redisPnL.updatedAtMs
          markAgeTickMs = Math.max(0, rowNowMs - tickMs)
          freshnessTier = "position_pnl_redis"
        } else {
          currentPrice = stockLtp ?? averagePrice
          openPositionUnrealizedPnL = persistedPnL
          openPositionDayPnL = persistedDayPnL
          pnlUpdatedAtMsOpen = null
          priceSource =
            stockLtp !== null && stockLtp > 0 ? "stock_ltp" : "average_price_fallback"
          freshnessTier = stockLtp !== null && stockLtp > 0 ? "stock_ltp" : "fallback"
        }

        const closedAt =
          position?.closedAt instanceof Date
            ? position.closedAt.toISOString()
            : null

        const instrumentLabel = formatInstrumentSummary({
          symbol: position.symbol,
          exchange: positionExchange,
          segment: positionSegment,
          name: position.Stock?.name,
          strikePrice: positionStrikePrice ?? strikePrice,
          optionType: (positionOptionType ?? optionType) ?? undefined,
          expiry: positionExpiry ?? expiry,
          lotSize: lotSize,
        })

        return {
          id: position.id,
          symbol: position.symbol,
          instrumentLabel,
          productType: normalizedProductType,
          isIntraday: normalizedIsIntraday,
          identity: {
            stockId: typeof position.stockId === "string" ? position.stockId : null,
            instrumentId: positionInstrumentId,
            segment: positionSegment,
            exchange: positionExchange,
            strikePrice: positionStrikePrice ?? strikePrice,
            optionType: positionOptionType ?? optionType,
            expiry: positionExpiry ?? expiry,
            token: positionToken ?? token,
          },
          quantity,
          lotSize,
          instrumentId: positionInstrumentId,
          segment: positionSegment,
          strikePrice: positionStrikePrice ?? strikePrice,
          optionType: positionOptionType ?? optionType,
          expiry: positionExpiry ?? expiry,
          token: positionToken ?? token,
          averagePrice,
          unrealizedPnL: isClosed ? persistedPnL : openPositionUnrealizedPnL,
          realizedPnL: isClosed ? persistedPnL : 0,
          bookedPnL: isClosed ? persistedPnL : 0,
          dayPnL: isClosed ? persistedPnL : openPositionDayPnL,
          pnlUpdatedAtMs: isClosed ? null : pnlUpdatedAtMsOpen,
          stopLoss,
          target,
          createdAt: position.createdAt.toISOString(),
          closedAt,
          status: isClosed ? "CLOSED" : "OPEN",
          isClosed,
          currentPrice,
          currentValue: currentPrice * quantity,
          investedValue: averagePrice * quantity,
          instrumentToken: instrumentTokenResolved,
          priceSource,
          markAgeTickMs,
          freshnessTier,
          stock: position.Stock
            ? {
                symbol: position.Stock.symbol ?? null,
                name: position.Stock.name ?? null,
                ltp: position.Stock.ltp ?? null,
                instrumentId: position.Stock.instrumentId ?? null,
                exchange: position.Stock.exchange ?? null,
                segment: position.Stock.segment ?? null,
                lotSize: normalizeOptionalNumber(position.Stock.lot_size),
                strikePrice,
                optionType,
                expiry,
                token,
              }
            : null
        }
      }

      const emptyMarketQuotes = new Map<number, RedisMarketQuoteSnapshot>()
      openPositionsRaw.forEach((position) => {
        const redisPnL = redisPnLByPositionId.get(position.id) || null
        openPositions.push(mapPosition(position, redisPnL, marketQuoteByToken, staleMarketQuoteByToken))
      })

      closedPositionsRaw.forEach((position) => {
        closedPositions.push(mapPosition(position, null, emptyMarketQuotes))
      })

      const orderedPositions = [...openPositions, ...closedPositions]

      return NextResponse.json({
        success: true,
        positions: orderedPositions,
        meta: {
          pnlMode: pnlSettings.mode,
          workerHealthy: pnlSettings.workerHealthy,
          pnlMaxAgeMs: redisPnlMaxAgeMs,
          positionsTabMtmDisplayMode: positionPricing.positionsTabMtmDisplayMode,
          positionSquareOffPriceAuthority: positionPricing.positionSquareOffPriceAuthority,
          pricingDebug: {
            redisPositionPnlMaxAgeMs: redisPnlMaxAgeMs,
            redisMarketQuoteMaxAgeMs: marketQuoteMaxAgeMs,
            positionPnlQuoteMaxAgeMs: quoteFresh.positionPnlQuoteMaxAgeMs,
            marketQuoteRedisWriteMinIntervalMs: quoteFresh.marketQuoteRedisWriteMinIntervalMs,
            marketdataQuoteMaxAgeMs: normalizeMarketDataQuoteMaxAgeMs(
              process.env.MARKETDATA_QUOTE_MAX_AGE_MS,
              7_500,
            ),
          },
        },
      })
    })

    return result
  } catch (error: any) {
    console.error("❌ [API-POSITIONS-LIST] Error:", error)
    const { message, status } = resolveTradingErrorResponse(error, "Failed to fetch positions", 500)
    return NextResponse.json(
      {
        success: false,
        error: message
      },
      { status }
    )
  }
}
