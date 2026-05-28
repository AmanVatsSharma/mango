/**
 * @file route.ts
 * @module app/api/admin/transactions
 * @description Admin ledger transactions: filter, paginate, PATCH with optional margin reconcile.
 *              Reconcile path is atomic ($transaction): validates funds before mutating, then
 *              updates the ledger row plus TradingAccount.balance/availableMargin in one commit.
 *              Both the new amount and the existing amount must be whole rupees when reconcile=true,
 *              because TradingAccount fields are Int (rupees) and Transaction.amount is Decimal(18,2).
 *              Trade-derived ledger entries with paise must be corrected via the trade-adjustment
 *              flow, not direct ledger surgery.
 * @author StockTrade
 * @created 2025 (legacy)
 * @updated 2026-05-08 — reconcile guard: integer-rupee assertion, AppError-in-transaction so 400
 *                       status propagates, richer Pino logs with delta + before/after balances.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { adminPrisma } from '@/lib/server/prisma-admin'
import { handleAdminApi } from '@/lib/rbac/admin-api'
import { AppError } from '@/src/common/errors'
import { fetchBalanceAfterByTransactionIds } from '@/lib/server/admin-transactions-balance-after'
import {
  normalizeAdminTransactionsAmountFilter,
  normalizeAdminTransactionsLimitParam,
  normalizeAdminTransactionsPageParam,
  normalizeAdminTransactionsPatchAmount,
  normalizeAdminTransactionsSortByParam,
  normalizeAdminTransactionsSortOrder,
  parseAdminTransactionDateFilterForRange,
} from '@/lib/server/admin-transactions-number-utils'

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/transactions',
      required: 'admin.funds.read',
      fallbackMessage: 'Failed to fetch transactions',
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const page = normalizeAdminTransactionsPageParam(searchParams.get('page'))
      const limit = normalizeAdminTransactionsLimitParam(searchParams.get('limit'))
      const type = searchParams.get('type') as 'CREDIT' | 'DEBIT' | null
      const user = searchParams.get('user') // can be userId or clientId
      const userId = searchParams.get('userId')
      const clientId = searchParams.get('clientId')
      const qRaw = searchParams.get('q')
      const qAlt = searchParams.get('filter')
      const q = qRaw || qAlt || null
      const fromRaw = searchParams.get('from')
      const toRaw = searchParams.get('to')
      const minAmountRaw = searchParams.get('minAmount')
      const maxAmountRaw = searchParams.get('maxAmount')
      const from = parseAdminTransactionDateFilterForRange(fromRaw, "from")
      const to = parseAdminTransactionDateFilterForRange(toRaw, "to")
      const minAmount = normalizeAdminTransactionsAmountFilter(minAmountRaw)
      const maxAmount = normalizeAdminTransactionsAmountFilter(maxAmountRaw)
      const sortByRaw = searchParams.get('sortBy')
      const { field: sortField, invalidExplicit: sortByInvalid } = normalizeAdminTransactionsSortByParam(sortByRaw)
      const order = normalizeAdminTransactionsSortOrder(searchParams.get('order'))

      const skip = (page - 1) * limit

      if (sortByInvalid) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid sortBy — use createdAt, amount, type, or id',
          statusCode: 400,
        })
      }

      ctx.logger.debug(
        { page, limit, type, user, userId, clientId, sortBy: sortField, order },
        'GET /api/admin/transactions - params',
      )

      if (fromRaw !== null && fromRaw.trim() !== '' && from === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid from date filter', statusCode: 400 })
      }
      if (toRaw !== null && toRaw.trim() !== '' && to === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid to date filter', statusCode: 400 })
      }
      if (minAmountRaw !== null && minAmountRaw.trim() !== '' && minAmount === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid minAmount filter', statusCode: 400 })
      }
      if (maxAmountRaw !== null && maxAmountRaw.trim() !== '' && maxAmount === null) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid maxAmount filter', statusCode: 400 })
      }
      if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'minAmount cannot exceed maxAmount', statusCode: 400 })
      }

      // Build WHERE clause
      const andFilters: any[] = []

      if (type === 'CREDIT' || type === 'DEBIT') {
        andFilters.push({ type })
      }

      if (from || to) {
        const createdAt: any = {}
        if (from) createdAt.gte = from
        if (to) createdAt.lte = to
        andFilters.push({ createdAt })
      }

      if (minAmount !== null || maxAmount !== null) {
        const amount: any = {}
        if (minAmount !== null) amount.gte = minAmount
        if (maxAmount !== null) amount.lte = maxAmount
        andFilters.push({ amount })
      }

      // User filters (by userId/clientId, or combined 'user' param)
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
      if (userFilters.length > 0) {
        andFilters.push({ OR: userFilters })
      }

      // Free text search
      if (q) {
        andFilters.push({
          OR: [
            { description: { contains: q, mode: 'insensitive' } },
            { tradingAccount: { user: { name: { contains: q, mode: 'insensitive' } } } },
            { tradingAccount: { user: { clientId: { contains: q, mode: 'insensitive' } } } },
          ],
        })
      }

      const where = andFilters.length > 0 ? { AND: andFilters } : {}

      const [transactions, total] = await Promise.all([
        adminPrisma.transaction.findMany({
          where,
          orderBy: { [sortField]: order },
          skip,
          take: limit,
          include: {
            tradingAccount: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    clientId: true,
                  },
                },
              },
            },
          },
        }),
        adminPrisma.transaction.count({ where }),
      ])

      let balanceMap = new Map<string, number>()
      try {
        balanceMap = await fetchBalanceAfterByTransactionIds(transactions.map((t) => t.id))
      } catch (err) {
        ctx.logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'GET /api/admin/transactions — balanceAfter query failed',
        )
        throw new AppError({
          code: 'INTERNAL',
          message: 'Failed to compute ledger balances',
          statusCode: 500,
        })
      }

      const transactionsWithBalance = transactions.map((t) => ({
        ...t,
        balanceAfter: balanceMap.get(t.id) ?? null,
      }))

      ctx.logger.info(
        {
          count: transactions.length,
          total,
          page,
          balanceRowsComputed: balanceMap.size,
          pageTransactionCount: transactions.length,
        },
        'GET /api/admin/transactions - success',
      )
      return NextResponse.json(
        {
          transactions: transactionsWithBalance,
          total,
          page,
          pages: Math.ceil(total / limit),
        },
        { status: 200 },
      )
    }
  )
}

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/transactions',
      required: 'admin.funds.override',
      fallbackMessage: 'Failed to update transaction',
    },
    async (ctx) => {
      const body = await req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid request body', statusCode: 400 })
      }
      const { transactionId, amount, description, reconcile } = body

      const normalizedTransactionId = typeof transactionId === 'string' ? transactionId.trim() : ''
      if (!normalizedTransactionId) {
        throw new AppError({ code: 'VALIDATION_ERROR', message: 'transactionId is required', statusCode: 400 })
      }

      const existing = await adminPrisma.transaction.findUnique({
        where: { id: normalizedTransactionId },
        include: { tradingAccount: true },
      })

      if (!existing) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Transaction not found', statusCode: 404 })
      }

      const updates: any = {}
      if (typeof description === 'string') updates.description = description
      if (amount !== undefined) {
        const normalizedAmount = normalizeAdminTransactionsPatchAmount(amount)
        if (normalizedAmount === null) {
          throw new AppError({ code: 'VALIDATION_ERROR', message: 'amount must be a non-negative number', statusCode: 400 })
        }
        updates.amount = normalizedAmount
      }

      if (reconcile && updates.amount !== undefined) {
        const existingAmount = normalizeAdminTransactionsAmountFilter(existing.amount)
        if (existingAmount === null) {
          throw new AppError({ code: 'VALIDATION_ERROR', message: 'Existing transaction amount is invalid', statusCode: 400 })
        }
        if (!Number.isInteger(existingAmount)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message:
              'This transaction has paise (sub-rupee) granularity — admin reconcile requires whole rupees. Use the trade-adjustment flow to correct trade-derived entries.',
            statusCode: 400,
          })
        }
        if (!Number.isInteger(updates.amount)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'Edited amount must be a whole rupee value (no paise). TradingAccount balance is stored as Int.',
            statusCode: 400,
          })
        }
        const delta = updates.amount - existingAmount
        const effect = existing.type === 'CREDIT' ? delta : -delta

        if (delta === 0) {
          // Description-only edit reaching the reconcile branch — fall through to the no-op update.
          const updatedTx = await adminPrisma.transaction.update({
            where: { id: normalizedTransactionId },
            data: updates,
          })
          ctx.logger.info(
            { transactionId: normalizedTransactionId, reconcile: true, delta: 0 },
            'PATCH /api/admin/transactions - reconciled (no fund delta)',
          )
          return NextResponse.json({ success: true, transaction: updatedTx }, { status: 200 })
        }

        const result = await prisma.$transaction(async (tx) => {
          const fresh = await tx.tradingAccount.findUnique({ where: { id: existing.tradingAccountId } })
          if (!fresh) {
            throw new AppError({ code: 'NOT_FOUND', message: 'Trading account not found', statusCode: 404 })
          }
          const beforeBalance = fresh.balance
          const beforeAvailable = fresh.availableMargin
          const newBalance = beforeBalance + effect
          const newAvailable = beforeAvailable + effect
          if (newAvailable < 0) {
            throw new AppError({
              code: 'INSUFFICIENT_FUNDS',
              message: `Insufficient available margin to apply this change. Available ₹${beforeAvailable}, would become ₹${newAvailable}.`,
              statusCode: 400,
            })
          }
          if (newBalance < 0) {
            throw new AppError({
              code: 'INSUFFICIENT_FUNDS',
              message: `Edit would drive total balance negative (current ₹${beforeBalance}, would become ₹${newBalance}).`,
              statusCode: 400,
            })
          }

          const updatedTx = await tx.transaction.update({
            where: { id: normalizedTransactionId },
            data: updates,
          })

          const updatedAccount = await tx.tradingAccount.update({
            where: { id: existing.tradingAccountId },
            data: {
              balance: { increment: effect },
              availableMargin: { increment: effect },
            },
          })

          return { updatedTx, updatedAccount, beforeBalance, beforeAvailable }
        })

        ctx.logger.info(
          {
            transactionId: normalizedTransactionId,
            tradingAccountId: existing.tradingAccountId,
            type: existing.type,
            reconcile: true,
            existingAmount,
            newAmount: updates.amount,
            delta,
            walletEffect: effect,
            beforeBalance: result.beforeBalance,
            afterBalance: result.updatedAccount.balance,
            beforeAvailable: result.beforeAvailable,
            afterAvailable: result.updatedAccount.availableMargin,
            adminId: ctx.session.user.id,
          },
          'PATCH /api/admin/transactions - reconciled',
        )
        return NextResponse.json(
          {
            success: true,
            transaction: result.updatedTx,
            account: result.updatedAccount,
            walletEffect: effect,
            delta,
          },
          { status: 200 },
        )
      }

      const updatedTx = await adminPrisma.transaction.update({
        where: { id: normalizedTransactionId },
        data: updates,
      })

      ctx.logger.info({ transactionId: normalizedTransactionId, reconcile: false }, 'PATCH /api/admin/transactions - success')
      return NextResponse.json({ success: true, transaction: updatedTx }, { status: 200 })
    }
  )
}