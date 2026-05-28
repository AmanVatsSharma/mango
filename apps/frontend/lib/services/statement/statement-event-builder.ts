/**
 * @file statement-event-builder.ts
 * @module statement
 * @description Classify ledger lines (cash vs margin), stable ordering, deposit/withdrawal dedupe against Transaction refs, and grouped statement events for admin UI.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-01
 *
 * Notes:
 * - Cash running balance uses `cashAmount` only (non-margin ledger + funds rows); synthetic trades are informational (cashAmount 0).
 * - Dedupe: `Deposit ref:` / `Withdrawal ref:` suffixes match `deposit.id` / `withdrawal.id` tail (see AdminFundService shortRefId).
 * - Synthetic register lines prefer `instrumentLabel` / linked `Stock` for F&O-aware text.
 */

import type { OrderStatus, TransactionType } from "@prisma/client"
import {
  normalizeUserStatementDepositAmount,
  normalizeUserStatementLedgerSignedAmount,
  normalizeUserStatementTradePrice,
  normalizeUserStatementTradeQuantity,
  normalizeUserStatementWithdrawalAmount,
} from "@/components/admin-console/user-statement-number-utils"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"
import { isLedgerRowLikelyChargesDebit } from "@/lib/services/statement/statement-aggregation.service"

export type StatementEventKind =
  | "funds"
  | "trade_fill"
  | "fee"
  | "margin"
  | "pnl"
  | "adjustment"
  | "reversal"
  | "other"

export type StatementLineSource = "ledger" | "deposit" | "withdrawal" | "synthetic_trade"

export type StatementLineInternal = {
  id: string
  dateIso: string
  source: StatementLineSource
  description: string
  /** Full signed amount for audit display (matches ledger convention where applicable). */
  amount: number
  /** Contributes to running cash balance (excludes margin-only ledger rows and synthetic trades). */
  cashAmount: number
  marginOnly: boolean
  kind: StatementEventKind
  orderId: string | null
  positionId: string | null
  depositId?: string | null
  withdrawalId?: string | null
  type: "deposit" | "withdrawal" | "trade" | "credit" | "debit"
  status?: string
}

export type StatementEventGroup = {
  id: string
  kind: StatementEventKind
  /** ISO timestamp of primary line for sorting. */
  dateIso: string
  primary: StatementLineInternal
  children: StatementLineInternal[]
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
  /** Preformatted instrument line; else derived from optional `stock` snapshot. */
  instrumentLabel?: string | null
  stock?: {
    exchange: string
    segment: string
    name: string
    strikePrice: unknown
    optionType: string | null
    expiry: Date | null
    lot_size: unknown
  } | null
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

const DEPOSIT_REF_REGEX = /deposit ref:\s*([a-z0-9-]+)/i
const WITHDRAWAL_REF_REGEX = /withdrawal ref:\s*([a-z0-9-]+)/i

/** Exported for tests — margin reserve/release does not change `trading_accounts.balance`. */
export function isMarginOnlyLedgerDescription(description: string | null | undefined): boolean {
  if (!description) return false
  const d = description.trim()
  if (/^margin blocked/i.test(d)) return true
  if (/^margin released/i.test(d)) return true
  if (/margin released on offset/i.test(d)) return true
  if (/additional margin blocked/i.test(d)) return true
  if (/^margin released: modify order/i.test(d)) return true
  if (/^margin released \(admission\)/i.test(d)) return true
  if (/^margin released \(queued close\)/i.test(d)) return true
  if (/^margin released for closed position/i.test(d)) return true
  return false
}

function idEndsWithRef(fullId: string, ref: string): boolean {
  const r = ref.trim().toLowerCase()
  const f = fullId.toLowerCase()
  if (!r || !f) return false
  return f === r || f.endsWith(r)
}

function collectRefMatches(
  transactions: Pick<TransactionLite, "description">[],
): { depositRefs: Set<string>; withdrawalRefs: Set<string> } {
  const depositRefs = new Set<string>()
  const withdrawalRefs = new Set<string>()
  for (const t of transactions) {
    const desc = t.description || ""
    const dm = desc.match(DEPOSIT_REF_REGEX)
    if (dm?.[1]) depositRefs.add(dm[1].trim().toLowerCase())
    const wm = desc.match(WITHDRAWAL_REF_REGEX)
    if (wm?.[1]) withdrawalRefs.add(wm[1].trim().toLowerCase())
  }
  return { depositRefs, withdrawalRefs }
}

function classifyLedgerKind(description: string | null | undefined, marginOnly: boolean): StatementEventKind {
  if (marginOnly) return "margin"
  const d = (description || "").toLowerCase()
  if (
    d.includes("charges refunded") ||
    d.includes("margin released:") ||
    d.includes("order cancelled") ||
    d.includes("order failed") ||
    d.includes("position already flat") ||
    d.includes("admission release")
  ) {
    return "reversal"
  }
  if (d.includes("realized p&l") || d.includes("profit from") || d.includes("loss from")) return "pnl"
  if (isLedgerRowLikelyChargesDebit(description) || d.includes("brokerage") || d.includes("charges")) return "fee"
  if (d.includes("admin manual") || d.includes("admin credit") || d.includes("admin debit") || d.includes("position adjustment"))
    return "adjustment"
  return "other"
}

/** Lower sorts earlier within the same timestamp. */
export function tieBreakPriority(line: StatementLineInternal): number {
  if (line.source === "deposit") return 5
  if (line.source === "withdrawal") return 10
  if (line.source === "synthetic_trade") return 40
  if (line.source === "ledger") {
    if (line.kind === "fee") return 20
    if (line.kind === "margin") return 50
    if (line.kind === "pnl") return 70
    if (line.kind === "reversal") return 60
    if (line.kind === "adjustment") return 35
    return 80
  }
  return 90
}

export function compareStatementLinesAsc(a: StatementLineInternal, b: StatementLineInternal): number {
  const ta = new Date(a.dateIso).getTime()
  const tb = new Date(b.dateIso).getTime()
  if (ta !== tb) return ta - tb
  const pa = tieBreakPriority(a)
  const pb = tieBreakPriority(b)
  if (pa !== pb) return pa - pb
  return a.id.localeCompare(b.id)
}

export function collectOrderIdsWithLedger(transactions: Pick<TransactionLite, "orderId">[]): Set<string> {
  const ids = new Set<string>()
  for (const t of transactions) {
    if (t.orderId) ids.add(t.orderId)
  }
  return ids
}

export type BuildStatementLinesResult = {
  lines: StatementLineInternal[]
  warnings: string[]
  dedupedDepositIds: string[]
  dedupedWithdrawalIds: string[]
}

export function buildStatementLinesFromEntities(input: {
  orders: OrderLite[]
  transactions: TransactionLite[]
  deposits: DepositLite[]
  withdrawals: WithdrawalLite[]
}): BuildStatementLinesResult {
  const warnings: string[] = []
  const dedupedDepositIds: string[] = []
  const dedupedWithdrawalIds: string[] = []

  const { depositRefs, withdrawalRefs } = collectRefMatches(input.transactions)

  const ledgerOrderIds = collectOrderIdsWithLedger(input.transactions)
  const lines: StatementLineInternal[] = []
  let syntheticRegisterOnlyCount = 0

  for (const o of input.orders) {
    if (o.status !== "EXECUTED") continue
    if (ledgerOrderIds.has(o.id)) continue
    if ((o.filledQuantity ?? 0) <= 0 && (o.quantity ?? 0) <= 0) {
      warnings.push(`Executed order ${o.id} has zero quantity in register — verify fill data.`)
    }
    const qty = normalizeUserStatementTradeQuantity(o.filledQuantity || o.quantity || 0)
    const px = normalizeUserStatementTradePrice(o.averagePrice || o.price || 0)
    const signed = o.orderSide === "BUY" ? -1 : 1
    const at = o.executedAt ?? o.createdAt
    syntheticRegisterOnlyCount += 1
    const instrumentLine =
      (typeof o.instrumentLabel === "string" && o.instrumentLabel.trim().length > 0
        ? o.instrumentLabel.trim()
        : null) ??
      (o.stock
        ? formatInstrumentSummary({
            symbol: o.symbol,
            exchange: o.stock.exchange,
            segment: o.stock.segment,
            name: o.stock.name,
            strikePrice: o.stock.strikePrice,
            optionType: o.stock.optionType,
            expiry: o.stock.expiry,
            lotSize: o.stock.lot_size,
          })
        : o.symbol)
    lines.push({
      id: `order-${o.id}`,
      dateIso: at.toISOString(),
      source: "synthetic_trade",
      description: `${o.orderSide} ${instrumentLine} x ${qty} @ ${px} (register only — see ledger for cash)`,
      amount: signed * qty * px,
      cashAmount: 0,
      marginOnly: false,
      kind: "trade_fill",
      orderId: o.id,
      positionId: null,
      type: "trade",
      status: o.status,
    })
  }

  if (syntheticRegisterOnlyCount > 0) {
    warnings.push(
      `${syntheticRegisterOnlyCount} executed order(s) appear in the trade register without linked ledger rows — verify cash postings (e.g. admin execute without settlement).`,
    )
  }

  for (const t of input.transactions) {
    const marginOnly = isMarginOnlyLedgerDescription(t.description)
    const signed = normalizeUserStatementLedgerSignedAmount(t.type, t.amount)
    const cashAmount = marginOnly ? 0 : signed
    const kind = classifyLedgerKind(t.description, marginOnly)
    lines.push({
      id: `tx-${t.id}`,
      dateIso: t.createdAt.toISOString(),
      source: "ledger",
      description: t.description || (t.type === "CREDIT" ? "Credit" : "Debit"),
      amount: signed,
      cashAmount,
      marginOnly,
      kind,
      orderId: t.orderId ?? null,
      positionId: t.positionId ?? null,
      type: t.type === "CREDIT" ? "credit" : "debit",
    })
  }

  for (const d of input.deposits) {
    const matched = Array.from(depositRefs).some((ref) => idEndsWithRef(d.id, ref))
    let adminCreditMatched = false
    if (!matched && String(d.method).toLowerCase() === "admin_credit") {
      adminCreditMatched = input.transactions.some((t) => {
        const desc = (t.description || "").toLowerCase()
        if (!desc.includes("admin credit")) return false
        const amt = normalizeUserStatementLedgerSignedAmount(t.type, t.amount)
        const depAmt = normalizeUserStatementDepositAmount(d.amount)
        if (Math.abs(amt - depAmt) > 0.009) return false
        const tp = d.processedAt ?? d.createdAt
        const dt = Math.abs(t.createdAt.getTime() - tp.getTime())
        return dt <= 120_000
      })
    }
    if (matched || adminCreditMatched) {
      dedupedDepositIds.push(d.id)
      continue
    }
    const at = d.processedAt ?? d.createdAt
    lines.push({
      id: `dep-${d.id}`,
      dateIso: at.toISOString(),
      source: "deposit",
      description: `Deposit (${d.method}) ${d.utr ? `UTR ${d.utr}` : ""}`.trim(),
      amount: normalizeUserStatementDepositAmount(d.amount),
      cashAmount: normalizeUserStatementDepositAmount(d.amount),
      marginOnly: false,
      kind: "funds",
      orderId: null,
      positionId: null,
      depositId: d.id,
      type: "deposit",
      status: d.status,
    })
  }

  for (const w of input.withdrawals) {
    const matched = Array.from(withdrawalRefs).some((ref) => idEndsWithRef(w.id, ref))
    let adminDebitMatched = false
    if (!matched) {
      adminDebitMatched = input.transactions.some((t) => {
        const desc = (t.description || "").toLowerCase()
        if (!desc.includes("admin debit")) return false
        const signed = normalizeUserStatementLedgerSignedAmount(t.type, t.amount)
        const wAmt = normalizeUserStatementWithdrawalAmount(w.amount, w.charges)
        if (Math.abs(signed - wAmt) > 0.009) return false
        const tp = w.processedAt ?? w.createdAt
        const dt = Math.abs(t.createdAt.getTime() - tp.getTime())
        return dt <= 120_000
      })
    }
    if (matched || adminDebitMatched) {
      dedupedWithdrawalIds.push(w.id)
      continue
    }
    const at = w.processedAt ?? w.createdAt
    const wAmt = normalizeUserStatementWithdrawalAmount(w.amount, w.charges)
    lines.push({
      id: `wd-${w.id}`,
      dateIso: at.toISOString(),
      source: "withdrawal",
      description: `Withdrawal ${w.reference ? `Ref ${w.reference}` : ""}`.trim(),
      amount: wAmt,
      cashAmount: wAmt,
      marginOnly: false,
      kind: "funds",
      orderId: null,
      positionId: null,
      withdrawalId: w.id,
      type: "withdrawal",
      status: w.status,
    })
  }

  for (const o of input.orders) {
    if (o.status !== "EXECUTED") continue
    if ((o.filledQuantity ?? 0) <= 0 && (o.quantity ?? 0) > 0) {
      warnings.push(`Executed order ${o.id} has filledQuantity 0 — verify admin or system fill data.`)
    }
    const hasLedger = input.transactions.some((t) => t.orderId === o.id)
    if (!hasLedger) {
      continue
    }
    const hasCash = input.transactions.some(
      (t) => t.orderId === o.id && !isMarginOnlyLedgerDescription(t.description),
    )
    if (!hasCash) {
      warnings.push(`Executed order ${o.id} has only margin ledger rows — verify settlement lines.`)
    }
  }

  lines.sort(compareStatementLinesAsc)

  return { lines, warnings, dedupedDepositIds, dedupedWithdrawalIds }
}

export function groupStatementEvents(lines: StatementLineInternal[]): StatementEventGroup[] {
  const orderBuckets = new Map<string, StatementLineInternal[]>()
  const consumed = new Set<string>()

  for (const line of lines) {
    if (line.orderId) {
      const list = orderBuckets.get(line.orderId) ?? []
      list.push(line)
      orderBuckets.set(line.orderId, list)
      consumed.add(line.id)
    }
  }

  const groups: StatementEventGroup[] = []

  for (const [orderId, bucket] of Array.from(orderBuckets)) {
    if (bucket.length === 0) continue
    const sorted = [...bucket].sort(compareStatementLinesAsc)
    const primary = pickPrimaryLine(sorted)
    const children = sorted.filter((l) => l.id !== primary.id)
    groups.push({
      id: `evt-order-${orderId}`,
      kind: primary.kind,
      dateIso: sorted[0].dateIso,
      primary,
      children,
    })
  }

  for (const line of lines) {
    if (consumed.has(line.id)) continue
    consumed.add(line.id)
    groups.push({
      id: `evt-${line.id}`,
      kind: line.kind,
      dateIso: line.dateIso,
      primary: line,
      children: [],
    })
  }

  groups.sort((a, b) => compareStatementLinesAsc(a.primary, b.primary))
  return groups
}

function pickPrimaryLine(lines: StatementLineInternal[]): StatementLineInternal {
  const trade = lines.find((l) => l.source === "synthetic_trade")
  if (trade) return trade
  const pnl = lines.find((l) => l.kind === "pnl")
  if (pnl) return pnl
  const fee = lines.find((l) => l.kind === "fee")
  if (fee) return fee
  return lines[0]
}

export type FundsSnapshot = {
  balance: number
  availableMargin: number
  usedMargin: number
}

export type CashStreamTotals = {
  netCashInWindow: number
}

export function computeFundsWindowMeta(params: {
  lines: StatementLineInternal[]
  closing: FundsSnapshot
}): {
  opening: { balance: number; availableMargin: number | null; usedMargin: number | null }
  cashStreamTotals: CashStreamTotals
} {
  const netCashInWindow = params.lines.reduce((s, l) => s + l.cashAmount, 0)
  return {
    opening: {
      balance: Math.round((params.closing.balance - netCashInWindow + Number.EPSILON) * 100) / 100,
      availableMargin: null,
      usedMargin: null,
    },
    cashStreamTotals: { netCashInWindow },
  }
}
