/**
 * @file route.ts
 * @module admin-console
 * @description Admin positions API (list, patch, and admin-controlled position creation)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-30
 *
 * Changelog: Redis market quote parse passes expected token to reject mismatched payloads.
 *
 * Notes:
 * - Admin positions list includes Stock.ltp for MTM display fallback when Redis snapshot omits currentPrice.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { adminPrisma } from '@/lib/server/prisma-admin'
import { createOrderExecutionService } from '@/lib/services/order/OrderExecutionService'
import { createTradingLogger } from '@/lib/services/logging/TradingLogger'
import { createPositionManagementService } from '@/lib/services/position/PositionManagementService'
import { handleAdminApi } from '@/lib/rbac/admin-api'
import { AppError } from '@/src/common/errors'
import { getPositionPnLSettings } from '@/lib/server/position-pnl-settings'
import { getMarketDisplayPositionPricingPolicies } from '@/lib/server/market-display-exit-policy'
import { isRedisEnabled } from '@/lib/redis/redis-client'
import { resolvePositionRowInstrumentToken } from '@/lib/server/position-instrument-resolution'
import {
  normalizeAdminPositionCreateLotSize,
  normalizeAdminPositionCreatePrice,
  normalizeAdminPositionCreateQuantity,
  normalizeAdminPositionFinite,
  normalizeAdminPositionNonNegative,
  normalizeAdminPositionNullableNonNegativeUpdate,
  normalizeAdminPositionsDateFilter,
  normalizeAdminPositionsLimitParam,
  normalizeAdminPositionsPageParam,
  normalizeAdminPositionsSortOrder,
} from '@/lib/server/admin-positions-number-utils'
import {
  normalizeAdminExitPriceMode,
  resolveAdminCloseExitPrice,
} from '@/lib/server/admin-position-exit-price'
import {
  consumePositionCloseIdempotency,
  rememberPositionCloseIdempotency,
  resolveIdempotencyKeyFromRequest,
} from '@/lib/server/position-close-idempotency'
import { formatInstrumentSummary } from '@/lib/market-data/instrument-summary'
import { resolveLivePrice } from '@/lib/market-data/live-quote-ladder'

/** Short position/order ID for statement descriptions (last 8 chars). */
function shortRefId(id: string): string {
  if (!id || typeof id !== 'string') return 'unknown'
  return id.length > 8 ? id.slice(-8) : id
}

function normalizePositionQuantityForOpenState(value: unknown): number {
  const parsedValue = normalizeAdminPositionFinite(value)
  if (parsedValue === null) return 0
  return Math.trunc(parsedValue)
}

// GET /api/admin/positions
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/positions',
      required: 'admin.positions.read',
      fallbackMessage: 'Failed to fetch positions',
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const page = normalizeAdminPositionsPageParam(searchParams.get('page'))
      const limit = normalizeAdminPositionsLimitParam(searchParams.get('limit'))
      const user = searchParams.get('user')
      const userId = searchParams.get('userId')
      const clientId = searchParams.get('clientId')
      const symbol = searchParams.get('symbol')
      const qRaw = searchParams.get('q')
      const qAlt = searchParams.get('filter')
      const q = qRaw || qAlt || null
      const openOnly = (searchParams.get('openOnly') || '').toLowerCase() === 'true'
      const fromRaw = searchParams.get('from')
      const toRaw = searchParams.get('to')
      const from = normalizeAdminPositionsDateFilter(fromRaw)
      const to = normalizeAdminPositionsDateFilter(toRaw)
      const sortBy = searchParams.get('sortBy') || 'createdAt'
      const order = normalizeAdminPositionsSortOrder(searchParams.get('order'))

      const skip = (page - 1) * limit

      if (fromRaw !== null && fromRaw.trim() !== '' && from === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid from date filter', statusCode: 400 })
      }
      if (toRaw !== null && toRaw.trim() !== '' && to === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid to date filter', statusCode: 400 })
      }

      const andFilters: any[] = []

      if (openOnly) {
        andFilters.push({ quantity: { not: 0 } })
      }
      if (symbol) {
        andFilters.push({ symbol: { contains: symbol, mode: 'insensitive' } })
      }
      if (from || to) {
        const createdAt: any = {}
        if (from) createdAt.gte = from
        if (to) createdAt.lte = to
        andFilters.push({ createdAt })
      }

      const userFilters: any[] = []
      if (userId) userFilters.push({ tradingAccount: { user: { id: userId } } })
      if (clientId) {
        userFilters.push({
          tradingAccount: { user: { clientId: { contains: clientId, mode: 'insensitive' } } },
        })
      }
      if (user) {
        userFilters.push({ tradingAccount: { user: { id: user } } })
        userFilters.push({
          tradingAccount: { user: { clientId: { contains: user, mode: 'insensitive' } } },
        })
        userFilters.push({ tradingAccount: { user: { name: { contains: user, mode: 'insensitive' } } } })
      }
      if (userFilters.length > 0) andFilters.push({ OR: userFilters })

      if (q) {
        andFilters.push({
          OR: [
            { symbol: { contains: q, mode: 'insensitive' } },
            { Stock: { name: { contains: q, mode: 'insensitive' } } },
            { tradingAccount: { user: { name: { contains: q, mode: 'insensitive' } } } },
            { tradingAccount: { user: { clientId: { contains: q, mode: 'insensitive' } } } },
          ],
        })
      }

      const where = andFilters.length > 0 ? { AND: andFilters } : {}

      const [positionsRaw, total, pnlSettings, positionPricing] = await Promise.all([
        adminPrisma.position.findMany({
          where,
          orderBy: { [sortBy]: order } as any,
          skip,
          take: limit,
          include: {
            tradingAccount: {
              include: {
                user: { select: { id: true, name: true, clientId: true } },
              },
            },
            Stock: {
              select: {
                instrumentId: true,
                segment: true,
                exchange: true,
                name: true,
                strikePrice: true,
                optionType: true,
                expiry: true,
                token: true,
                lot_size: true,
                ltp: true,
              },
            },
          },
        }),
        adminPrisma.position.count({ where }),
        getPositionPnLSettings(),
        getMarketDisplayPositionPricingPolicies(),
      ])

      let positions: any[] = positionsRaw as any[]
      const redisPnlMaxAgeMs = positionPricing.pnlServerMaxAgeMs
      const marketQuoteMaxAgeMs = positionPricing.redisMarketQuoteMaxAgeMs
      if (isRedisEnabled() && positionsRaw.length > 0) {
        try {
          const openPositions = positionsRaw.filter(
            (position) => normalizePositionQuantityForOpenState((position as any)?.quantity) !== 0,
          )
          if (openPositions.length > 0) {
            const nowMs = Date.now()

            positions = await Promise.all(
              positionsRaw.map(async (position) => {
                const quantity = normalizePositionQuantityForOpenState((position as any)?.quantity)
                if (quantity === 0) return position
                const p = position as any
                const instrumentTokenResolved = resolvePositionRowInstrumentToken(
                  {
                    token: p?.token,
                    instrumentId: typeof p?.instrumentId === 'string' ? p.instrumentId : null,
                    segment: typeof p?.segment === 'string' ? p.segment : null,
                    exchange: typeof p?.exchange === 'string' ? p.exchange : null,
                  },
                  p.Stock
                    ? {
                        token: p.Stock.token,
                        instrumentId: p.Stock.instrumentId ?? null,
                        segment: p.Stock.segment ?? null,
                        exchange: p.Stock.exchange ?? null,
                      }
                    : null,
                )
                const averagePrice = normalizeAdminPositionFinite(p.averagePrice) ?? 0
                const stockLtp = normalizeAdminPositionFinite(p.Stock?.ltp)

                const livePrice = await resolveLivePrice({
                  instrumentToken: instrumentTokenResolved,
                  positionId: position.id,
                  fallbackLtp: stockLtp,
                  maxAgeMs: marketQuoteMaxAgeMs,
                })

                if (livePrice.source === 'market-quote') {
                  const currentPrice = livePrice.price
                  const prevClose =
                    livePrice.prevClose !== undefined && livePrice.prevClose > 0
                      ? livePrice.prevClose
                      : averagePrice > 0
                        ? averagePrice
                        : 0
                  const unrealizedPnL = Number(((currentPrice - averagePrice) * quantity).toFixed(2))
                  const dayPnL = Number(((currentPrice - prevClose) * quantity).toFixed(2))
                  return {
                    ...position,
                    unrealizedPnL,
                    dayPnL,
                    currentPrice,
                    pnlUpdatedAtMs: livePrice.ageMs != null ? nowMs - livePrice.ageMs : nowMs,
                  }
                }
                if (livePrice.source === 'position-pnl' && livePrice.workerPnL) {
                  const redisPx = normalizeAdminPositionFinite(livePrice.price)
                  return {
                    ...position,
                    unrealizedPnL: livePrice.workerPnL.unrealizedPnL,
                    dayPnL: livePrice.workerPnL.dayPnL,
                    currentPrice: redisPx ?? stockLtp ?? p.currentPrice,
                    pnlUpdatedAtMs: livePrice.workerPnL.updatedAtMs,
                  }
                }
                return position
              }),
            )
          }
        } catch {
          // Best-effort overlay only.
        }
      }

      const heartbeatLastRunAtMs = pnlSettings.heartbeat?.lastRunAtIso
        ? Date.parse(pnlSettings.heartbeat.lastRunAtIso)
        : null
      const heartbeatAgeMs =
        heartbeatLastRunAtMs && Number.isFinite(heartbeatLastRunAtMs)
          ? Math.max(0, Date.now() - heartbeatLastRunAtMs)
          : null

      const positionsWithLabels = positions.map((p: any) => {
        const st = p.Stock
        const instrumentLabel = formatInstrumentSummary({
          symbol: p.symbol,
          exchange: st?.exchange,
          segment: st?.segment,
          name: st?.name,
          strikePrice: st?.strikePrice,
          optionType: st?.optionType ?? undefined,
          expiry: st?.expiry,
          lotSize: st?.lot_size,
        })
        return { ...p, instrumentLabel }
      })

      ctx.logger.info({ count: positionsWithLabels.length, total, page }, 'GET /api/admin/positions - success')
      return NextResponse.json(
        {
          positions: positionsWithLabels,
          total,
          page,
          pages: Math.ceil(total / limit),
          meta: {
            pnlMode: pnlSettings.mode,
            workerHealthy: pnlSettings.workerHealthy,
            pnlMaxAgeMs: redisPnlMaxAgeMs,
            positionsTabMtmDisplayMode: positionPricing.positionsTabMtmDisplayMode,
            positionSquareOffPriceAuthority: positionPricing.positionSquareOffPriceAuthority,
            adminSquareOffAllowLastSubscriptionTick:
              positionPricing.adminSquareOffAllowLastSubscriptionTick,
            positionCloseUseClientPriceWhenWithinBand:
              positionPricing.positionCloseUseClientPriceWhenWithinBand,
            adminPositionCloseMaxDeviationBps: positionPricing.adminPositionCloseMaxDeviationBps,
            positionCloseReferenceDivergenceMaxBps:
              positionPricing.positionCloseReferenceDivergenceMaxBps,
            settingsSource: pnlSettings.source,
            heartbeat: pnlSettings.heartbeat
              ? {
                  ...pnlSettings.heartbeat,
                  ageMs: heartbeatAgeMs,
                }
              : null,
          },
        },
        { status: 200 },
      )
    }
  )
}

// PATCH /api/admin/positions
export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/positions',
      required: 'admin.positions.manage',
      fallbackMessage: 'Failed to update position',
    },
    async (ctx) => {

      const body = await req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid request body', statusCode: 400 })
      }
      const {
        positionId,
        updates,
        action,
        options,
        closeQuantity,
        closeLots,
        exitPrice,
        exitPriceMode,
        ltpAgeMs,
        ltpTimestamp,
      } = body as {
      positionId: string
      updates?: {
        quantity?: number
        averagePrice?: number
        stopLoss?: number | null
        target?: number | null
        symbol?: string
        unrealizedPnL?: number
        dayPnL?: number
      }
      action?: 'close'
      closeQuantity?: number
      closeLots?: number
      exitPrice?: number
      exitPriceMode?: string
      ltpAgeMs?: number
      ltpTimestamp?: number
      options?: {
        cascadeToOrders?: boolean
        cascadeToTransactions?: boolean
        manageFunds?: boolean
        valueDelta?: number
      }
    }

      const normalizedPositionId = typeof positionId === 'string' ? positionId.trim() : ''
      if (!normalizedPositionId) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'positionId is required', statusCode: 400 })
      }

      const existing = await adminPrisma.position.findUnique({ 
      where: { id: normalizedPositionId },
      include: {
        tradingAccount: true,
        Stock: {
          select: {
            lot_size: true,
            token: true,
            instrumentId: true,
            exchange: true,
            segment: true,
            ltp: true,
          },
        },
      }
    })
      if (!existing) throw new AppError({ code: 'NOT_FOUND', message: 'Position not found', statusCode: 404 })

      const hasCloseQuantity = closeQuantity !== undefined && closeQuantity !== null
      const hasCloseLots = closeLots !== undefined && closeLots !== null
      const normalizedCloseQuantity = hasCloseQuantity ? normalizeAdminPositionCreateQuantity(closeQuantity) : undefined
      const normalizedCloseLots = hasCloseLots ? normalizeAdminPositionCreateQuantity(closeLots) : undefined
      const hasExitPrice = exitPrice !== undefined && exitPrice !== null && String(exitPrice).trim() !== ''
      const normalizedExitPrice = hasExitPrice ? normalizeAdminPositionCreatePrice(exitPrice) : undefined

      if (hasCloseQuantity && normalizedCloseQuantity === null) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'closeQuantity must be a positive integer',
          statusCode: 400,
        })
      }
      if (hasCloseLots && normalizedCloseLots === null) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'closeLots must be a positive integer',
          statusCode: 400,
        })
      }
      if (hasExitPrice && normalizedExitPrice === null) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'exitPrice must be a positive number',
          statusCode: 400,
        })
      }
      if (normalizedCloseQuantity !== undefined && normalizedCloseLots !== undefined) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Provide either closeQuantity or closeLots, not both',
          statusCode: 400,
        })
      }

      if (action === 'close') {
        const idemKey = resolveIdempotencyKeyFromRequest(ctx.req, (body as { idempotencyKey?: string }).idempotencyKey)
        const idemHit = consumePositionCloseIdempotency(idemKey)
        if (idemHit) {
          return NextResponse.json(idemHit.body, { status: idemHit.status })
        }

        const safeCloseQuantity = normalizedCloseQuantity === null ? undefined : normalizedCloseQuantity
        const safeCloseLots = normalizedCloseLots === null ? undefined : normalizedCloseLots
        const safeExitPrice = normalizedExitPrice === null ? undefined : normalizedExitPrice
        const openQuantitySigned = Math.trunc(normalizeAdminPositionFinite(existing.quantity) ?? 0)
        const openQuantityAbs = Math.abs(openQuantitySigned)
        const lotSize = Math.max(1, Math.trunc(normalizeAdminPositionFinite(existing.Stock?.lot_size) ?? 1))
        const resolvedCloseQuantity =
          safeCloseLots !== undefined
            ? safeCloseLots * lotSize
            : safeCloseQuantity

        if (safeCloseLots !== undefined && lotSize <= 1) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'closeLots can be used only for lot-based instruments',
            statusCode: 400,
          })
        }
        if (resolvedCloseQuantity !== undefined && resolvedCloseQuantity > openQuantityAbs) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: `close quantity cannot exceed open quantity (${openQuantityAbs})`,
            statusCode: 400,
          })
        }
        if (resolvedCloseQuantity !== undefined && lotSize > 1 && resolvedCloseQuantity % lotSize !== 0) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: `close quantity must be in lot multiples of ${lotSize}`,
            statusCode: 400,
          })
        }

        const exitMode = normalizeAdminExitPriceMode(exitPriceMode, hasExitPrice)
        if (exitMode === 'manual' && (normalizedExitPrice === null || normalizedExitPrice === undefined)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'exitPrice is required when exitPriceMode is manual',
            statusCode: 400,
          })
        }

        const assistedForLive =
          exitMode === 'live' && hasExitPrice && normalizedExitPrice !== null && normalizedExitPrice !== undefined
            ? normalizedExitPrice
            : undefined

        const ltpAgeNorm =
          ltpAgeMs !== undefined && ltpAgeMs !== null ? normalizeAdminPositionFinite(ltpAgeMs) : undefined
        const ltpTsNorm =
          ltpTimestamp !== undefined && ltpTimestamp !== null
            ? normalizeAdminPositionFinite(ltpTimestamp)
            : undefined
        if (ltpAgeMs !== undefined && ltpAgeMs !== null && ltpAgeNorm === null) {
          throw new AppError({ code: 'VALIDATION_ERROR', message: 'ltpAgeMs must be a valid number', statusCode: 400 })
        }
        if (ltpTimestamp !== undefined && ltpTimestamp !== null && ltpTsNorm === null) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'ltpTimestamp must be a valid number',
            statusCode: 400,
          })
        }

        const policies = await getMarketDisplayPositionPricingPolicies()
        const avgForLtp = normalizeAdminPositionFinite(existing.averagePrice) ?? 0
        const exitResolution = await resolveAdminCloseExitPrice({
          mode: exitMode,
          manualExitPrice: exitMode === 'manual' ? safeExitPrice : undefined,
          assistedExitPrice: assistedForLive,
          ltpAgeMs: ltpAgeNorm ?? undefined,
          ltpTimestamp: ltpTsNorm ?? undefined,
          positionId: normalizedPositionId,
          position: {
            token: existing.token ?? null,
            instrumentId: existing.instrumentId ?? null,
            segment: existing.segment ?? null,
            exchange: existing.exchange ?? null,
          },
          stock: {
            token: (existing.Stock as { token?: number | null })?.token ?? null,
            instrumentId: (existing.Stock as { instrumentId?: string | null })?.instrumentId ?? null,
            exchange: (existing.Stock as { exchange?: string | null })?.exchange ?? null,
            segment: (existing.Stock as { segment?: string | null })?.segment ?? null,
            ltp: (existing.Stock as { ltp?: unknown })?.ltp ?? null,
          },
          policies,
          positionAveragePrice: avgForLtp,
          nowMs: Date.now(),
        })

        if (!exitResolution.ok) {
          throw new AppError({
            code: exitResolution.code,
            message: exitResolution.message,
            statusCode: exitResolution.status,
          })
        }

        const resolvedExitPrice = exitResolution.price

        const closeLogger = createTradingLogger({
          userId: ctx.session.user.id,
          tradingAccountId: existing.tradingAccountId,
          positionId: normalizedPositionId,
          symbol: existing.symbol,
        })
        const positionService = createPositionManagementService(closeLogger)
        const closeResult = await positionService.closePosition(
          normalizedPositionId,
          existing.tradingAccountId,
          resolvedExitPrice,
          resolvedCloseQuantity,
          {
            reason: "ADMIN_CLOSED",
            closedByUserId: ctx.session.user.id,
            note: typeof (body as Record<string, unknown>)?.adminNote === "string"
              ? String((body as Record<string, unknown>).adminNote)
              : null,
          },
        )

        const skipped =
          Math.trunc(closeResult.closedQuantity) <= 0 &&
          closeResult.message.toLowerCase().includes('skipped')
        if (skipped) {
          throw new AppError({
            code: 'POSITION_CLOSE_CONFLICT',
            message: 'Position is already closing or closed. Retry shortly.',
            statusCode: 409,
          })
        }

        ctx.logger.info(
          {
            adminUserId: ctx.session.user.id,
            positionId: normalizedPositionId,
            tradingAccountId: existing.tradingAccountId,
            exitPriceMode: exitMode,
            exitPriceSource: exitResolution.exitPriceSource,
            exitPriceAudit: exitResolution.exitPriceAudit,
            closedQuantity: closeResult.closedQuantity,
            remainingQuantity: closeResult.remainingQuantity,
            isPartial: closeResult.isPartial,
            realizedPnL: closeResult.realizedPnL,
          },
          'PATCH /api/admin/positions - close action success',
        )
        const closePayload = {
          success: true,
          closeResult,
          exitPrice: exitResolution.price,
          exitPriceSource: exitResolution.exitPriceSource,
          exitPriceMode: exitMode,
          exitPriceAudit: exitResolution.exitPriceAudit,
        }
        rememberPositionCloseIdempotency(idemKey, 200, closePayload)
        return NextResponse.json(closePayload, { status: 200 })
      }

      const data: any = {}
      const normalizedUpdates = updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : undefined
      if (updates !== undefined && !normalizedUpdates) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'updates must be an object', statusCode: 400 })
      }
      const normalizedOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : undefined
      if (options !== undefined && !normalizedOptions) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'options must be an object', statusCode: 400 })
      }
      const normalizedValueDelta =
        normalizedOptions?.valueDelta !== undefined ? normalizeAdminPositionFinite(normalizedOptions.valueDelta) : undefined
      if (normalizedOptions?.valueDelta !== undefined && normalizedValueDelta === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'valueDelta must be a valid number', statusCode: 400 })
      }

      if (normalizedUpdates) {
      if (normalizedUpdates.quantity !== undefined) {
        const normalizedQuantity = normalizeAdminPositionNonNegative(normalizedUpdates.quantity)
        if (normalizedQuantity === null) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'quantity must be a non-negative number',
            statusCode: 400,
          })
        }
        data.quantity = normalizedQuantity
      }
      if (normalizedUpdates.averagePrice !== undefined) {
        const normalizedAveragePrice = normalizeAdminPositionNonNegative(normalizedUpdates.averagePrice)
        if (normalizedAveragePrice === null) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'averagePrice must be a non-negative number',
            statusCode: 400,
          })
        }
        data.averagePrice = normalizedAveragePrice
      }
      if (normalizedUpdates.stopLoss !== undefined) {
        const normalizedStopLoss = normalizeAdminPositionNullableNonNegativeUpdate(normalizedUpdates.stopLoss)
        if (normalizedStopLoss === undefined) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'stopLoss must be null or a non-negative number',
            statusCode: 400,
          })
        }
        data.stopLoss = normalizedStopLoss
      }
      if (normalizedUpdates.target !== undefined) {
        const normalizedTarget = normalizeAdminPositionNullableNonNegativeUpdate(normalizedUpdates.target)
        if (normalizedTarget === undefined) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'target must be null or a non-negative number',
            statusCode: 400,
          })
        }
        data.target = normalizedTarget
      }
      if (normalizedUpdates.symbol !== undefined) {
        if (typeof normalizedUpdates.symbol !== 'string' || normalizedUpdates.symbol.trim().length === 0) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'symbol must be a non-empty string',
            statusCode: 400,
          })
        }
        data.symbol = normalizedUpdates.symbol.trim().toUpperCase()
      }
      if (normalizedUpdates.unrealizedPnL !== undefined) {
        const normalizedUnrealizedPnl = normalizeAdminPositionFinite(normalizedUpdates.unrealizedPnL)
        if (normalizedUnrealizedPnl === null) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'unrealizedPnL must be a number',
            statusCode: 400,
          })
        }
        data.unrealizedPnL = normalizedUnrealizedPnl
      }
      if (normalizedUpdates.dayPnL !== undefined) {
        const normalizedDayPnl = normalizeAdminPositionFinite(normalizedUpdates.dayPnL)
        if (normalizedDayPnl === null) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'dayPnL must be a number',
            statusCode: 400,
          })
        }
        data.dayPnL = normalizedDayPnl
      }
    }

      if (Object.keys(data).length === 0) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'No updates provided', statusCode: 400 })
      }

    // Handle cascading updates and fund management in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update position
      const updatedPosition = await tx.position.update({ 
        where: { id: normalizedPositionId }, 
        data 
      })

      // Cascade to orders if requested
      if (normalizedOptions?.cascadeToOrders && normalizedUpdates) {
        const orderUpdates: any = {}
        if (normalizedUpdates.symbol !== undefined) orderUpdates.symbol = normalizedUpdates.symbol
        if (normalizedUpdates.quantity !== undefined) orderUpdates.quantity = normalizedUpdates.quantity
        if (normalizedUpdates.averagePrice !== undefined) orderUpdates.averagePrice = normalizedUpdates.averagePrice

        if (Object.keys(orderUpdates).length > 0) {
          await tx.order.updateMany({
            where: { positionId: normalizedPositionId },
            data: orderUpdates
          })
          ctx.logger.debug({ positionId: normalizedPositionId }, "PATCH /api/admin/positions - cascaded updates to orders")
        }
      }

      // Cascade to transactions if requested
      if (normalizedOptions?.cascadeToTransactions && normalizedUpdates) {
        // Update transaction amounts if quantity or averagePrice changed
        if (normalizedUpdates.quantity !== undefined || normalizedUpdates.averagePrice !== undefined) {
          const newValue = (normalizedUpdates.quantity ?? updatedPosition.quantity) * (normalizedUpdates.averagePrice ?? updatedPosition.averagePrice)
          const oldValue = existing.quantity * existing.averagePrice
          const amountDelta = newValue - oldValue

          if (amountDelta !== 0) {
            // Find related transactions:
            // 1. Transactions directly linked to position (positionId)
            // 2. Transactions linked via orders that belong to this position (order.positionId = positionId)
            const relatedOrderIds = (await tx.order.findMany({
              where: { positionId: normalizedPositionId },
              select: { id: true }
            })).map((o) => o.id)

            // Get all related transactions
            const relatedTransactions = await tx.transaction.findMany({
              where: {
                OR: [
                  { positionId: normalizedPositionId }, // Directly linked to position
                  ...(relatedOrderIds.length > 0 ? [{ orderId: { in: relatedOrderIds } }] : []) // Linked via orders
                ]
              }
            })

            ctx.logger.debug(
              { positionId: normalizedPositionId, count: relatedTransactions.length },
              "PATCH /api/admin/positions - related transactions found"
            )

            // Only update transactions that represent position value (not margin/charges)
            // Margin and charge transactions should remain as historical records
            // We'll update transactions that are directly linked to position or represent position value adjustments
            for (const txn of relatedTransactions) {
              // Skip margin/charge transactions (they have specific descriptions or are DEBITs for orders)
              const isMarginOrCharge = txn.description?.toLowerCase().includes('margin') || 
                                       txn.description?.toLowerCase().includes('charge') ||
                                       (txn.type === 'DEBIT' && txn.orderId && !txn.positionId)
              
              if (!isMarginOrCharge && oldValue > 0) {
                const currentAmount = normalizeAdminPositionFinite(txn.amount)
                if (currentAmount === null) {
                  continue
                }
                const proportionalDelta = (currentAmount / oldValue) * amountDelta
                const newAmount = Math.max(0, currentAmount + proportionalDelta) // Ensure non-negative

                await tx.transaction.update({
                  where: { id: txn.id },
                  data: { amount: newAmount }
                })
              }
            }
            ctx.logger.debug({ positionId: normalizedPositionId }, "PATCH /api/admin/positions - cascaded updates to transactions")
          }
        }
      }

      // Manage funds if requested
      if (normalizedOptions?.manageFunds && normalizedValueDelta !== undefined && normalizedValueDelta !== 0) {
        const tradingAccount = await tx.tradingAccount.findUnique({
          where: { id: existing.tradingAccountId }
        })

        if (!tradingAccount) {
          throw new Error('Trading account not found')
        }

        // Check if we have sufficient funds for debit
        if (normalizedValueDelta < 0) {
          const availableMargin = normalizeAdminPositionFinite(tradingAccount.availableMargin)
          if (availableMargin === null) {
            throw new Error('Trading account available margin is invalid')
          }
          const newAvailable = availableMargin + normalizedValueDelta
          if (newAvailable < 0) {
            throw new Error('Insufficient funds to adjust position value')
          }
        }

        // Update trading account balance and available margin
        await tx.tradingAccount.update({
          where: { id: existing.tradingAccountId },
          data: {
            balance: { increment: normalizedValueDelta },
            availableMargin: { increment: normalizedValueDelta }
          }
        })

        // Create a transaction record for the fund adjustment
        await tx.transaction.create({
          data: {
            tradingAccountId: existing.tradingAccountId,
            positionId: normalizedPositionId,
            type: normalizedValueDelta > 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.abs(normalizedValueDelta),
            description: `Position adjustment: ${existing.symbol}. Value change: ${normalizedValueDelta > 0 ? 'Credit' : 'Debit'} ₹${Math.abs(normalizedValueDelta).toLocaleString()}. Position ref: ${shortRefId(normalizedPositionId)}.`
          }
        })

        ctx.logger.debug({ positionId: normalizedPositionId, valueDelta: normalizedValueDelta }, "PATCH /api/admin/positions - adjusted funds")
      }

      return updatedPosition
    })

      return NextResponse.json({ success: true, position: result }, { status: 200 })
    }
  )
}

// POST /api/admin/positions
// Create a position by placing an opening order under admin control (auto-creates order and transactions)
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/positions',
      required: 'admin.positions.manage',
      fallbackMessage: 'Failed to create position',
    },
    async (ctx) => {

      const body = await req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid request body', statusCode: 400 })
      }
      const {
        tradingAccountId,
        stockId,
        instrumentId,
        symbol,
        quantity,
        price,
        orderType,
        orderSide,
        productType,
        segment,
        lotSize,
      } = body || {}

    const normalizedTradingAccountId = typeof tradingAccountId === 'string' ? tradingAccountId.trim() : ''
    const normalizedStockId = typeof stockId === 'string' ? stockId.trim() : ''
    const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : ''
    const normalizedOrderType = typeof orderType === 'string' ? orderType.trim().toUpperCase() : ''
    const normalizedOrderSide = typeof orderSide === 'string' ? orderSide.trim().toUpperCase() : ''
    const normalizedProductType = typeof productType === 'string' ? productType.trim().toUpperCase() : ''
    const normalizedSegment = typeof segment === 'string' ? segment.trim().toUpperCase() : ''
    const normalizedQuantity = normalizeAdminPositionCreateQuantity(quantity)
    const normalizedPrice = price != null ? normalizeAdminPositionCreatePrice(price) : null
    const normalizedLotSize = lotSize != null ? normalizeAdminPositionCreateLotSize(lotSize) : undefined
    const hasProvidedLotSize = lotSize !== undefined && lotSize !== null && String(lotSize).trim() !== ''
    const hasProvidedPrice = price !== undefined && price !== null && String(price).trim() !== ''

    if (quantity !== undefined && normalizedQuantity === null) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'quantity must be a positive integer',
        statusCode: 400,
      })
    }
    if (hasProvidedPrice && normalizedPrice === null) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'price must be a positive number',
        statusCode: 400,
      })
    }
    if (hasProvidedLotSize && normalizedLotSize === undefined) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'lotSize must be a positive integer',
        statusCode: 400,
      })
    }

    // Basic validations
    if (
      !normalizedTradingAccountId ||
      !normalizedStockId ||
      !normalizedSymbol ||
      normalizedQuantity === null ||
      !normalizedOrderType ||
      !normalizedOrderSide ||
      !normalizedProductType ||
      !normalizedSegment
    ) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Missing required fields', statusCode: 400 })
    }

    if (normalizedOrderType === 'LIMIT' && normalizedPrice === null) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'LIMIT orders must include positive price',
          statusCode: 400,
        })
    }

    const logger = createTradingLogger({
      userId: ctx.session.user.id,
      tradingAccountId: normalizedTradingAccountId,
      symbol: normalizedSymbol
    })

    const svc = createOrderExecutionService(logger)
    const result = await svc.placeOrder({
      tradingAccountId: normalizedTradingAccountId,
      stockId: normalizedStockId,
      instrumentId: typeof instrumentId === 'string' ? instrumentId.trim() : '',
      symbol: normalizedSymbol,
      quantity: normalizedQuantity,
      price: normalizedPrice ?? undefined,
      orderType: normalizedOrderType as any,
      orderSide: normalizedOrderSide as any,
      productType: normalizedProductType as any,
      segment: normalizedSegment as any,
      lotSize: normalizedLotSize
    })

    return NextResponse.json(result, { status: 200 })
    }
  )
}
