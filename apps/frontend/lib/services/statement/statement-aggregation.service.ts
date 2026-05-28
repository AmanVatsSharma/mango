/**
 * @file statement-aggregation.service.ts
 * @module statement
 * @description Paginated, count-reconciled aggregation for enterprise statements (ledger, trade register, completed funds).
 * @author StockTrade
 * @created 2026-03-30
 *
 * Notes:
 * - Ledger rows use Transaction.createdAt; executed trades use Order.executedAt (fallback createdAt if legacy null).
 * - Completed deposits/withdrawals use processedAt when set, else createdAt for range filtering.
 */

import { DepositStatus, Prisma, WithdrawalStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import { fetchAllOrderedRows } from "@/lib/services/statement/statement-fetch-batch"
import { executedOrdersStatementWhere } from "@/lib/services/statement/statement-where-builders"

export { STATEMENT_BATCH_SIZE } from "@/lib/services/statement/statement-fetch-batch"

const normalizeAmount = (value: unknown): number => parseFiniteMarketNumber(value) ?? 0

/** Case-insensitive match for rows treated as brokerage/tax/charges in manifest summaries. */
export function isLedgerRowLikelyChargesDebit(description: string | null | undefined): boolean {
  if (!description) return false
  const d = description.toLowerCase()
  return (
    d.includes("charge") ||
    d.includes("brokerage") ||
    d.includes("stt") ||
    d.includes("gst") ||
    d.includes("sebi") ||
    d.includes("turnover fee") ||
    d.includes("stamp duty") ||
    d.includes("transaction tax")
  )
}

export type StatementManifest = {
  range: { startIso: string; endIso: string }
  generatedAtIso: string
  userId: string
  tradingAccountId: string
  counts: {
    ledger: number
    executedOrders: number
    deposits: number
    withdrawals: number
    openPositionsSnapshot: number
  }
  sums: {
    ledgerCredits: number
    ledgerDebits: number
    chargesLikelyDebits: number
  }
  notes: string[]
}

export type StatementAggregationResult = {
  manifest: StatementManifest
  ledger: Prisma.TransactionGetPayload<{
    include: { order: { select: { id: true; symbol: true } }; position: { select: { id: true; symbol: true } } }
  }>[]
  executedOrders: Prisma.OrderGetPayload<{ include: { Stock: true } }>[]
  deposits: Prisma.DepositGetPayload<{ include: { bankAccount: { select: { bankName: true; accountNumber: true } } } }>[]
  withdrawals: Prisma.WithdrawalGetPayload<{
    include: { bankAccount: { select: { bankName: true; ifscCode: true; accountNumber: true } } }
  }>[]
  openPositionsSnapshot: Prisma.PositionGetPayload<{ include: { Stock: { select: { symbol: true; name: true } } } }>[]
}

function sumLedgerSums(
  rows: { type: string; amount: unknown; description: string | null }[],
): { ledgerCredits: number; ledgerDebits: number; chargesLikelyDebits: number } {
  let ledgerCredits = 0
  let ledgerDebits = 0
  let chargesLikelyDebits = 0
  for (const t of rows) {
    const n = normalizeAmount(t.amount)
    if (t.type === "CREDIT") ledgerCredits += n
    else {
      ledgerDebits += n
      if (isLedgerRowLikelyChargesDebit(t.description)) chargesLikelyDebits += n
    }
  }
  return { ledgerCredits, ledgerDebits, chargesLikelyDebits }
}

export class StatementAggregationService {
  /**
   * Full statement for a user in [start, end] (inclusive on both ends per Prisma gte/lte).
   */
  static async buildForUser(userId: string, start: Date, end: Date): Promise<StatementAggregationResult> {
    const tradingAccount = await prisma.tradingAccount.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!tradingAccount) {
      throw new Error("Trading account not found")
    }

    const tradingAccountId = tradingAccount.id
    const notes: string[] = [
      "Ledger amounts are authoritative for cash. Trade register rows are execution facts (not duplicate cash postings).",
      "Open positions snapshot is point-in-time (non-zero quantity) and not filtered by the statement date range.",
    ]

    const ledgerWhere: Prisma.TransactionWhereInput = {
      tradingAccountId,
      createdAt: { gte: start, lte: end },
    }

    const executedOrderWhere = executedOrdersStatementWhere(tradingAccountId, start, end)

    const fundsDepositWhere: Prisma.DepositWhereInput = {
      userId,
      status: DepositStatus.COMPLETED,
      OR: [
        { processedAt: { not: null, gte: start, lte: end } },
        { AND: [{ processedAt: null }, { createdAt: { gte: start, lte: end } }] },
      ],
    }

    const fundsWithdrawalWhere: Prisma.WithdrawalWhereInput = {
      userId,
      status: WithdrawalStatus.COMPLETED,
      OR: [
        { processedAt: { not: null, gte: start, lte: end } },
        { AND: [{ processedAt: null }, { createdAt: { gte: start, lte: end } }] },
      ],
    }

    const [
      ledgerCount,
      orderCount,
      depositCount,
      withdrawalCount,
      openPositionCount,
    ] = await Promise.all([
      prisma.transaction.count({ where: ledgerWhere }),
      prisma.order.count({ where: executedOrderWhere }),
      prisma.deposit.count({ where: fundsDepositWhere }),
      prisma.withdrawal.count({ where: fundsWithdrawalWhere }),
      prisma.position.count({
        where: { tradingAccountId, quantity: { not: 0 } },
      }),
    ])

    const ledgerInclude = {
      order: { select: { id: true, symbol: true } },
      position: { select: { id: true, symbol: true } },
    } as const

    const [ledger, executedOrders, deposits, withdrawals, openPositionsSnapshot] = await Promise.all([
      fetchAllOrderedRows(ledgerCount, (skip, take) =>
        prisma.transaction.findMany({
          where: ledgerWhere,
          include: ledgerInclude,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
        "ledger",
      ),
      fetchAllOrderedRows(orderCount, (skip, take) =>
        prisma.order.findMany({
          where: executedOrderWhere,
          include: { Stock: true },
          orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
        "executedOrders",
      ),
      fetchAllOrderedRows(depositCount, (skip, take) =>
        prisma.deposit.findMany({
          where: fundsDepositWhere,
          include: { bankAccount: { select: { bankName: true, accountNumber: true } } },
          orderBy: [{ processedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
        "deposits",
      ),
      fetchAllOrderedRows(withdrawalCount, (skip, take) =>
        prisma.withdrawal.findMany({
          where: fundsWithdrawalWhere,
          include: { bankAccount: { select: { bankName: true, ifscCode: true, accountNumber: true } } },
          orderBy: [{ processedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
        "withdrawals",
      ),
      fetchAllOrderedRows(openPositionCount, (skip, take) =>
        prisma.position.findMany({
          where: { tradingAccountId, quantity: { not: 0 } },
          include: { Stock: { select: { symbol: true, name: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
        "openPositionsSnapshot",
      ),
    ])

    const sums = sumLedgerSums(ledger)

    const manifest: StatementManifest = {
      range: { startIso: start.toISOString(), endIso: end.toISOString() },
      generatedAtIso: new Date().toISOString(),
      userId,
      tradingAccountId,
      counts: {
        ledger: ledger.length,
        executedOrders: executedOrders.length,
        deposits: deposits.length,
        withdrawals: withdrawals.length,
        openPositionsSnapshot: openPositionsSnapshot.length,
      },
      sums,
      notes,
    }

    return {
      manifest,
      ledger,
      executedOrders,
      deposits,
      withdrawals,
      openPositionsSnapshot,
    }
  }
}
