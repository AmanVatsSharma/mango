/**
 * File:        lib/server/prisma-admin.ts
 * Module:      Admin Console — Prisma Client with Demo-Data Exclusion
 * Purpose:     Prisma client extension that auto-appends accountType='LIVE' to all
 *              trading model queries. Used by admin routes to ensure demo account
 *              data never surfaces in live dashboards.
 *
 * Exports:
 *   - adminPrisma — Prisma client with trading-model query overrides
 *
 * Depends on:
 *   - @/lib/prisma — base Prisma client (singleton)
 *
 * Side-effects: none (pure query-layer wrapper)
 *
 * Key invariants:
 *   - All queries on TradingAccount, Position, Order, Transaction, Deposit,
 *     Withdrawal are scoped to accountType = 'LIVE'
 *
 * Read order:
 *   1. adminPrisma — query client with demo exclusion overrides
 *
 * Author:      Claude
 * Last-updated: 2026-05-14
 */

import { prisma } from "@/lib/prisma"

const LIVE_ACCOUNT_FILTER = { accountType: "LIVE" as const }

/** Models that link to TradingAccount via tradingAccountId — must all be filtered */
const TRADING_LINKED_MODELS = [
  "position",
  "order",
  "transaction",
  "deposit",
  "withdrawal",
] as const

type TradingLinkedModel = (typeof TRADING_LINKED_MODELS)[number]

function appendLiveFilter<T extends object>(query: T): T {
  if (!query) return query
  const q = query as Record<string, unknown>
  const existingWhere = "where" in q && q.where != null ? (q.where as Record<string, unknown>) : {}
  return {
    ...query,
    where: { ...existingWhere, ...LIVE_ACCOUNT_FILTER },
  } as T
}

/**
 * Admin-safe Prisma client. Overrides findMany / findFirst / count on all
 * trading-linked models to always include accountType = 'LIVE'.
 *
 * TradingAccount itself is also overridden so admin list views never surface
 * demo accounts.
 */
export const adminPrisma = prisma.$extends({
  model: {
    tradingAccount: {
      async findMany<T extends object>(query?: T) {
        return prisma.tradingAccount.findMany(appendLiveFilter(query ?? {}))
      },
      async findFirst<T extends object>(query?: T) {
        return prisma.tradingAccount.findFirst(appendLiveFilter(query ?? {}))
      },
      async count<T extends object>(query?: T) {
        return prisma.tradingAccount.count(appendLiveFilter(query ?? {}))
      },
    },
    ...(Object.fromEntries(
      TRADING_LINKED_MODELS.map((modelName) => [
        modelName,
        {
          async findMany<T extends object>(query?: T) {
            const fn = (prisma as any)[modelName].findMany.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
          async findFirst<T extends object>(query?: T) {
            const fn = (prisma as any)[modelName].findFirst.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
          async count<T extends object>(query?: T) {
            const fn = (prisma as any)[modelName].count.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
        },
      ])
    )),
  },
})