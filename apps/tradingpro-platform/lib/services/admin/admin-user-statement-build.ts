/**
 * @file admin-user-statement-build.ts
 * @module admin-console
 * @description Pure helpers to assemble admin user statement rows, ledger-first order dedupe, cash-based running balances, and deposit/withdrawal dedupe.
 * @author StockTrade
 * @created 2026-03-30
 * @updated 2026-04-01
 *
 * Notes:
 * - Order payloads may include `instrumentLabel` for synthetic register lines (pass-through to statement-event-builder).
 */

import type { OrderStatus, TransactionType } from "@prisma/client"
import {
  type StatementLineInternal,
  type StatementEventKind,
  type StatementLineSource,
  compareStatementLinesAsc,
  buildStatementLinesFromEntities,
} from "@/lib/services/statement/statement-event-builder"

export type AdminStatementApiRow = {
  id: string
  dateIso: string
  type: "deposit" | "withdrawal" | "trade" | "credit" | "debit"
  description: string
  amount: number
  /**
   * Signed amount that affects cash running balance (0 for margin-only / synthetic register rows).
   * When omitted, running balance falls back to `amount`.
   */
  cashAmount?: number
  balance?: number
  status?: string
  marginOnly?: boolean
  kind?: StatementEventKind
  orderId?: string | null
  positionId?: string | null
  /** Sort / grouping metadata (from statement pipeline). */
  lineSource?: StatementLineSource
}

type OrderLite = {
  id: string
  symbol: string
  orderSide: string
  quantity: number
  filledQuantity: number
  price: unknown
  averagePrice: unknown
  status: OrderStatus
  executedAt: Date | null
  createdAt: Date
  instrumentLabel?: string | null
}

type TransactionLite = {
  id: string
  amount: unknown
  type: TransactionType
  description: string | null
  createdAt: Date
  orderId: string | null
  positionId?: string | null
}

type DepositLite = {
  id: string
  amount: unknown
  method: string
  utr: string | null
  status: string
  createdAt: Date
  processedAt?: Date | null
}

type WithdrawalLite = {
  id: string
  amount: unknown
  charges: unknown
  reference: string | null
  status: string
  createdAt: Date
  processedAt?: Date | null
}

function effectiveCashAmount(r: AdminStatementApiRow): number {
  return r.cashAmount !== undefined && r.cashAmount !== null ? r.cashAmount : r.amount
}

export function toAdminStatementRow(line: StatementLineInternal): AdminStatementApiRow {
  return {
    id: line.id,
    dateIso: line.dateIso,
    type: line.type,
    description: line.description,
    amount: line.amount,
    cashAmount: line.cashAmount,
    status: line.status,
    marginOnly: line.marginOnly,
    kind: line.kind,
    orderId: line.orderId,
    positionId: line.positionId,
    lineSource: line.source,
  }
}

function rowToComparable(r: AdminStatementApiRow): StatementLineInternal {
  return {
    id: r.id,
    dateIso: r.dateIso,
    source: r.lineSource ?? "ledger",
    description: r.description,
    amount: r.amount,
    cashAmount: effectiveCashAmount(r),
    marginOnly: r.marginOnly ?? false,
    kind: (r.kind ?? "other") as StatementEventKind,
    orderId: r.orderId ?? null,
    positionId: r.positionId ?? null,
    type: r.type,
  }
}

function compareRowsAsc(a: AdminStatementApiRow, b: AdminStatementApiRow): number {
  return compareStatementLinesAsc(rowToComparable(a), rowToComparable(b))
}

/** @deprecated Use buildStatementLinesFromEntities + lineToRow; kept for tests importing name. */
export { collectOrderIdsWithLedger } from "@/lib/services/statement/statement-event-builder"

export function buildStatementRowsFromEntities(input: {
  orders: OrderLite[]
  transactions: TransactionLite[]
  deposits: DepositLite[]
  withdrawals: WithdrawalLite[]
}): AdminStatementApiRow[] {
  const { lines } = buildStatementLinesFromEntities(input)
  return lines.map(toAdminStatementRow)
}

/**
 * Running **cash** balance: walks `cashAmount` so margin reserve/release and synthetic register rows do not move the column.
 * opening = currentBalance - sum(cashAmount); last chronological row equals currentBalance when full history is included.
 */
export function applyRunningBalancesAndSortDesc(
  rows: AdminStatementApiRow[],
  currentBalance: number,
): AdminStatementApiRow[] {
  const sortedAsc = [...rows].sort(compareRowsAsc)
  const sumCash = sortedAsc.reduce((s, r) => s + effectiveCashAmount(r), 0)
  let running = currentBalance - sumCash
  const withBalance: AdminStatementApiRow[] = []
  for (const r of sortedAsc) {
    running += effectiveCashAmount(r)
    withBalance.push({
      ...r,
      balance: Math.round((running + Number.EPSILON) * 100) / 100,
    })
  }
  return [...withBalance].sort((a, b) => -compareRowsAsc(a, b))
}

export { buildStatementLinesFromEntities, groupStatementEvents } from "@/lib/services/statement/statement-event-builder"
export type { BuildStatementLinesResult, StatementEventGroup, FundsSnapshot, CashStreamTotals } from "@/lib/services/statement/statement-event-builder"
export { computeFundsWindowMeta } from "@/lib/services/statement/statement-event-builder"
