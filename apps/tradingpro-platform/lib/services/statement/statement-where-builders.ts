/**
 * @file statement-where-builders.ts
 * @module statement
 * @description Pure Prisma where builders for statement date windows (unit-testable, no DB I/O).
 * @author StockTrade
 * @created 2026-03-30
 */

import { OrderStatus, Prisma } from "@prisma/client"

/**
 * Executed orders in the statement window: primary axis `executedAt`, legacy fallback `createdAt` when not set.
 */
export function executedOrdersStatementWhere(
  tradingAccountId: string,
  start: Date,
  end: Date,
): Prisma.OrderWhereInput {
  return {
    tradingAccountId,
    status: OrderStatus.EXECUTED,
    OR: [
      { executedAt: { gte: start, lte: end } },
      {
        AND: [{ executedAt: null }, { createdAt: { gte: start, lte: end } }],
      },
    ],
  }
}
