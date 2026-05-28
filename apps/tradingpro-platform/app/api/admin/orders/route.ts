/**
 * @file route.ts
 * @module admin-console
 * @description Admin orders API (list + patch operations)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-01
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { adminPrisma } from '@/lib/server/prisma-admin'
import { createOrderExecutionService } from '@/lib/services/order/OrderExecutionService'
import { handleAdminApi } from '@/lib/rbac/admin-api'
import { AppError } from '@/src/common/errors'
import {
  normalizeAdminOrdersDateFilter,
  normalizeAdminOrdersExecutedAt,
  normalizeAdminOrdersLimitParam,
  normalizeAdminOrdersNonNegativeUpdate,
  normalizeAdminOrdersNullableNonNegativeUpdate,
  normalizeAdminOrdersPageParam,
  normalizeAdminOrdersSortOrder,
} from '@/lib/server/admin-orders-number-utils'
import { formatInstrumentSummary } from '@/lib/market-data/instrument-summary'

// GET /api/admin/orders
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/orders',
      required: 'admin.orders.read',
      fallbackMessage: 'Failed to fetch orders',
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const page = normalizeAdminOrdersPageParam(searchParams.get('page'))
      const limit = normalizeAdminOrdersLimitParam(searchParams.get('limit'))
      const user = searchParams.get('user')
      const userId = searchParams.get('userId')
      const clientId = searchParams.get('clientId')
      const symbol = searchParams.get('symbol')
      const statusRaw = searchParams.get('status') // PENDING, EXECUTED, CANCELLED
      const sideRaw = searchParams.get('side') // BUY, SELL
      const typeRaw = searchParams.get('type') // MARKET, LIMIT
      const status = statusRaw?.trim().toUpperCase() || null
      const side = sideRaw?.trim().toUpperCase() || null
      const type = typeRaw?.trim().toUpperCase() || null
      const qRaw = searchParams.get('q')
      const qAlt = searchParams.get('filter')
      const q = qRaw || qAlt || null
      const fromRaw = searchParams.get('from')
      const toRaw = searchParams.get('to')
      const from = normalizeAdminOrdersDateFilter(fromRaw)
      const to = normalizeAdminOrdersDateFilter(toRaw)
      const sortBy = searchParams.get('sortBy') || 'createdAt'
      const order = normalizeAdminOrdersSortOrder(searchParams.get('order'))

      const skip = (page - 1) * limit

      if (status !== null && !['PENDING', 'EXECUTED', 'CANCELLED'].includes(status)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid status filter', statusCode: 400 })
      }
      if (side !== null && !['BUY', 'SELL'].includes(side)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid side filter', statusCode: 400 })
      }
      if (type !== null && !['MARKET', 'LIMIT'].includes(type)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid type filter', statusCode: 400 })
      }
      if (fromRaw !== null && fromRaw.trim() !== '' && from === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid from date filter', statusCode: 400 })
      }
      if (toRaw !== null && toRaw.trim() !== '' && to === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid to date filter', statusCode: 400 })
      }

      const andFilters: any[] = []

      if (symbol) andFilters.push({ symbol: { contains: symbol, mode: 'insensitive' } })
      if (status) andFilters.push({ status })
      if (side) andFilters.push({ orderSide: side })
      if (type) andFilters.push({ orderType: type })
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
            { productType: { contains: q, mode: 'insensitive' } },
            { Stock: { name: { contains: q, mode: 'insensitive' } } },
            { tradingAccount: { user: { name: { contains: q, mode: 'insensitive' } } } },
            { tradingAccount: { user: { clientId: { contains: q, mode: 'insensitive' } } } },
          ],
        })
      }

      const where = andFilters.length > 0 ? { AND: andFilters } : {}

      const [orders, total] = await Promise.all([
        adminPrisma.order.findMany({
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
            Stock: true,
          },
        }),
        adminPrisma.order.count({ where }),
      ])

      const ordersOut = orders.map((o) => {
        const { Stock: st, ...rest } = o
        const instrumentLabel = formatInstrumentSummary({
          symbol: o.symbol,
          exchange: st?.exchange,
          segment: st?.segment,
          name: st?.name,
          strikePrice: st?.strikePrice,
          optionType: st?.optionType ?? undefined,
          expiry: st?.expiry,
          lotSize: st?.lot_size,
        })
        return { ...rest, instrumentLabel }
      })

      ctx.logger.info({ count: orders.length, total, page }, 'GET /api/admin/orders - success')
      return NextResponse.json({ orders: ordersOut, total, page, pages: Math.ceil(total / limit) }, { status: 200 })
    }
  )
}

// PATCH /api/admin/orders
export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/orders',
      required: 'admin.orders.manage',
      fallbackMessage: 'Failed to update order',
    },
    async () => {
      const body = await req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid request body', statusCode: 400 })
      }
      const { orderId, updates, action } = body as {
        orderId: string
        updates?: {
          quantity?: number
          price?: number | null
          productType?: string
          orderType?: 'MARKET' | 'LIMIT'
          orderSide?: 'BUY' | 'SELL'
          status?: 'PENDING' | 'EXECUTED' | 'CANCELLED'
          filledQuantity?: number
          averagePrice?: number | null
          executedAt?: string | null
        }
        action?: 'cancel' | 'execute'
      }

      const normalizedOrderId = typeof orderId === 'string' ? orderId.trim() : ''
      if (!normalizedOrderId) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'orderId is required', statusCode: 400 })
      }
      const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : undefined
      const normalizedUpdates = updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : undefined
      if (updates !== undefined && !normalizedUpdates) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'updates must be an object', statusCode: 400 })
      }

      const existing = await adminPrisma.order.findUnique({ where: { id: normalizedOrderId } })
      if (!existing) throw new AppError({ code: 'NOT_FOUND', message: 'Order not found', statusCode: 404 })

      if (normalizedAction === 'cancel') {
        const orderService = createOrderExecutionService()
        await orderService.cancelOrder(normalizedOrderId)
        const order = await adminPrisma.order.findUnique({ where: { id: normalizedOrderId } })
        return NextResponse.json({ success: true, order }, { status: 200 })
      }

      const data: any = {}
      if (normalizedAction === 'execute') {
        data.status = 'EXECUTED'
        data.filledQuantity = existing.quantity
        data.averagePrice = existing.price ?? existing.averagePrice ?? 0
        data.executedAt = new Date()
      }

      if (normalizedUpdates) {
        if (normalizedUpdates.quantity !== undefined) {
          const normalizedQuantity = normalizeAdminOrdersNonNegativeUpdate(normalizedUpdates.quantity)
          if (normalizedQuantity === null) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'quantity must be a non-negative number',
              statusCode: 400,
            })
          }
          data.quantity = normalizedQuantity
        }
        if (normalizedUpdates.price !== undefined) {
          const normalizedPrice = normalizeAdminOrdersNullableNonNegativeUpdate(normalizedUpdates.price)
          if (normalizedPrice === undefined) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'price must be null or a non-negative number',
              statusCode: 400,
            })
          }
          data.price = normalizedPrice
        }
        if (normalizedUpdates.productType !== undefined) {
          if (typeof normalizedUpdates.productType !== 'string' || normalizedUpdates.productType.trim().length === 0) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'productType must be a non-empty string',
              statusCode: 400,
            })
          }
          data.productType = normalizedUpdates.productType.trim().toUpperCase()
        }
        if (normalizedUpdates.orderType !== undefined) {
          const normalizedOrderType = typeof normalizedUpdates.orderType === 'string' ? normalizedUpdates.orderType.trim().toUpperCase() : ''
          if (!['MARKET', 'LIMIT'].includes(normalizedOrderType)) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'orderType must be MARKET or LIMIT',
              statusCode: 400,
            })
          }
          data.orderType = normalizedOrderType
        }
        if (normalizedUpdates.orderSide !== undefined) {
          const normalizedOrderSide = typeof normalizedUpdates.orderSide === 'string' ? normalizedUpdates.orderSide.trim().toUpperCase() : ''
          if (!['BUY', 'SELL'].includes(normalizedOrderSide)) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'orderSide must be BUY or SELL',
              statusCode: 400,
            })
          }
          data.orderSide = normalizedOrderSide
        }
        if (normalizedUpdates.status !== undefined) {
          const normalizedStatus = typeof normalizedUpdates.status === 'string' ? normalizedUpdates.status.trim().toUpperCase() : ''
          if (!['PENDING', 'EXECUTED', 'CANCELLED'].includes(normalizedStatus)) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'status must be PENDING, EXECUTED, or CANCELLED',
              statusCode: 400,
            })
          }
          data.status = normalizedStatus
        }
        if (normalizedUpdates.filledQuantity !== undefined) {
          const normalizedFilledQuantity = normalizeAdminOrdersNonNegativeUpdate(normalizedUpdates.filledQuantity)
          if (normalizedFilledQuantity === null) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'filledQuantity must be a non-negative number',
              statusCode: 400,
            })
          }
          data.filledQuantity = normalizedFilledQuantity
        }
        if (normalizedUpdates.averagePrice !== undefined) {
          const normalizedAveragePrice = normalizeAdminOrdersNullableNonNegativeUpdate(normalizedUpdates.averagePrice)
          if (normalizedAveragePrice === undefined) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'averagePrice must be null or a non-negative number',
              statusCode: 400,
            })
          }
          data.averagePrice = normalizedAveragePrice
        }
        if (normalizedUpdates.executedAt !== undefined) {
          const normalizedExecutedAt = normalizeAdminOrdersExecutedAt(normalizedUpdates.executedAt)
          if (normalizedExecutedAt === undefined) {
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'executedAt must be null or a valid datetime',
              statusCode: 400,
            })
          }
          data.executedAt = normalizedExecutedAt
        }
      }

      if (Object.keys(data).length === 0) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'No updates provided', statusCode: 400 })
      }

      const updated = await adminPrisma.order.update({ where: { id: normalizedOrderId }, data })
      const adminExecuteLedgerHint =
        normalizedAction === "execute"
          ? "Order marked EXECUTED via admin API — confirm Transaction ledger rows exist for settlement; otherwise statements may show register-only warnings."
          : undefined
      return NextResponse.json(
        { success: true, order: updated, statementHint: adminExecuteLedgerHint },
        { status: 200 },
      )
    }
  )
}
