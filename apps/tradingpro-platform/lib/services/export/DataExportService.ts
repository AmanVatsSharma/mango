/**
 * @file DataExportService.ts
 * @module export
 * @description CSV/export helpers and enterprise statement assembly (ledger + trade register + funds).
 * @author StockTrade
 * @created 2025-01-01
 * @updated 2026-04-01
 */

import { zipSync, strToU8 } from 'fflate'
import { prisma } from '@/lib/prisma'
import { parseFiniteMarketNumber } from '@/lib/market-data/utils/quote-lookup'
import { formatInstrumentSummary } from '@/lib/market-data/instrument-summary'
import { StatementAggregationService } from '@/lib/services/statement/statement-aggregation.service'
import {
  applyRunningBalancesAndSortDesc,
  buildStatementLinesFromEntities,
  computeFundsWindowMeta,
  groupStatementEvents,
  toAdminStatementRow,
} from '@/lib/services/admin/admin-user-statement-build'

console.log("📤 [DATA-EXPORT] Module loaded")

const normalizeDataExportNumber = (value: unknown): number => parseFiniteMarketNumber(value) ?? 0

export class DataExportService {
  /**
   * Generate CSV from array of objects
   */
  static generateCSV(data: any[], headers: string[]): string {
    console.log("📤 [DATA-EXPORT] Generating CSV")
    
    // Create CSV header
    const csv = [headers.join(',')]
    
    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header]
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value ?? ''
      })
      csv.push(values.join(','))
    })
    
    return csv.join('\n')
  }

  /**
   * Export orders to CSV
   */
  static async exportOrders(userId: string, startDate?: Date, endDate?: Date): Promise<string> {
    console.log("📤 [DATA-EXPORT] Exporting orders")
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      const where: any = { tradingAccountId: tradingAccount.id }
      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) where.createdAt.gte = startDate
        if (endDate) where.createdAt.lte = endDate
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          Stock: {
            select: {
              symbol: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })

      const data = orders.map(order => ({
        'Order ID': order.id,
        'Symbol': order.symbol,
        'Stock Name': order.Stock?.name || '',
        'Quantity': order.quantity,
        'Order Type': order.orderType,
        'Order Side': order.orderSide,
        'Price': order.price ? normalizeDataExportNumber(order.price) : '',
        'Average Price': order.averagePrice ? normalizeDataExportNumber(order.averagePrice) : '',
        'Filled Quantity': order.filledQuantity,
        'Product Type': order.productType,
        'Status': order.status,
        'Created At': order.createdAt.toISOString(),
        'Executed At': order.executedAt?.toISOString() || ''
      }))

      const headers = [
        'Order ID', 'Symbol', 'Stock Name', 'Quantity', 'Order Type',
        'Order Side', 'Price', 'Average Price', 'Filled Quantity',
        'Product Type', 'Status', 'Created At', 'Executed At'
      ]

      return this.generateCSV(data, headers)
    } catch (error) {
      console.error("❌ [DATA-EXPORT] Error exporting orders:", error)
      throw error
    }
  }

  /**
   * Export positions to CSV
   */
  static async exportPositions(userId: string): Promise<string> {
    console.log("📤 [DATA-EXPORT] Exporting positions")
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      const positions = await prisma.position.findMany({
        where: { tradingAccountId: tradingAccount.id },
        include: {
          Stock: {
            select: {
              symbol: true,
              name: true,
              ltp: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })

      const data = positions.map(position => ({
        'Position ID': position.id,
        'Symbol': position.symbol,
        'Stock Name': position.Stock?.name || '',
        'Quantity': position.quantity,
        'Average Price': normalizeDataExportNumber(position.averagePrice),
        'Current Price': position.Stock?.ltp || '',
        'Unrealized P&L': normalizeDataExportNumber(position.unrealizedPnL),
        'Day P&L': normalizeDataExportNumber(position.dayPnL),
        'Stop Loss': position.stopLoss ? normalizeDataExportNumber(position.stopLoss) : '',
        'Target': position.target ? normalizeDataExportNumber(position.target) : '',
        'Created At': position.createdAt.toISOString(),
        'Status': position.quantity === 0 ? 'CLOSED' : 'OPEN'
      }))

      const headers = [
        'Position ID', 'Symbol', 'Stock Name', 'Quantity', 'Average Price',
        'Current Price', 'Unrealized P&L', 'Day P&L', 'Stop Loss',
        'Target', 'Created At', 'Status'
      ]

      return this.generateCSV(data, headers)
    } catch (error) {
      console.error("❌ [DATA-EXPORT] Error exporting positions:", error)
      throw error
    }
  }

  /**
   * Export transactions to CSV
   */
  static async exportTransactions(userId: string, startDate?: Date, endDate?: Date): Promise<string> {
    console.log("📤 [DATA-EXPORT] Exporting transactions")
    
    try {
      const tradingAccount = await prisma.tradingAccount.findUnique({
        where: { userId }
      })

      if (!tradingAccount) {
        throw new Error("Trading account not found")
      }

      const where: any = { tradingAccountId: tradingAccount.id }
      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) where.createdAt.gte = startDate
        if (endDate) where.createdAt.lte = endDate
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      })

      const data = transactions.map(transaction => ({
        'Transaction ID': transaction.id,
        'Amount': normalizeDataExportNumber(transaction.amount),
        'Type': transaction.type,
        'Description': transaction.description || '',
        'Date': transaction.createdAt.toISOString()
      }))

      const headers = ['Transaction ID', 'Amount', 'Type', 'Description', 'Date']

      return this.generateCSV(data, headers)
    } catch (error) {
      console.error("❌ [DATA-EXPORT] Error exporting transactions:", error)
      throw error
    }
  }

  /**
   * Wide CSV: LEDGER (cash-authoritative), TRADE (execution facts), funds, open-position snapshot + manifest row.
   */
  static buildStatementEnterpriseCsv(payload: {
    manifest: import('@/lib/services/statement/statement-aggregation.service').StatementManifest
    transactions: any[]
    orders: any[]
    deposits: any[]
    withdrawals: any[]
    positions: any[]
  }): string {
    const headers = [
      'section',
      'id',
      'event_time_utc',
      'ledger_type',
      'amount',
      'description',
      'symbol',
      'side',
      'quantity',
      'avg_price',
      'status',
      'ref_order_id',
      'ref_position_id',
    ]

    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const rows: string[][] = [headers]

    const m = payload.manifest
    rows.push([
      'MANIFEST',
      'manifest',
      m.generatedAtIso,
      '',
      '',
      JSON.stringify({
        range: m.range,
        counts: m.counts,
        sums: m.sums,
        notes: m.notes,
      }),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])

    for (const t of payload.transactions) {
      rows.push([
        'LEDGER',
        t.id,
        t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
        t.type,
        String(normalizeDataExportNumber(t.amount)),
        t.description || '',
        t.order?.symbol || t.position?.symbol || '',
        '',
        '',
        '',
        '',
        t.orderId || '',
        t.positionId || '',
      ])
    }

    for (const o of payload.orders) {
      const exec = o.executedAt || o.createdAt
      rows.push([
        'TRADE_REGISTER',
        o.id,
        exec instanceof Date ? exec.toISOString() : String(exec),
        '',
        '',
        `Executed ${o.orderSide} ${o.filledQuantity ?? o.quantity} ${o.symbol} @ ${o.averagePrice != null ? normalizeDataExportNumber(o.averagePrice) : ''}`.trim(),
        o.symbol,
        o.orderSide,
        String(o.filledQuantity ?? o.quantity),
        o.averagePrice != null ? String(normalizeDataExportNumber(o.averagePrice)) : '',
        o.status,
        o.id,
        o.positionId || '',
      ])
    }

    for (const d of payload.deposits) {
      const ev = d.processedAt || d.createdAt
      rows.push([
        'DEPOSIT',
        d.id,
        ev instanceof Date ? ev.toISOString() : String(ev),
        'CREDIT',
        String(normalizeDataExportNumber(d.amount)),
        `Deposit ${d.method} ${d.utr || ''}`.trim(),
        '',
        '',
        '',
        '',
        d.status,
        '',
        '',
      ])
    }

    for (const w of payload.withdrawals) {
      const ev = w.processedAt || w.createdAt
      rows.push([
        'WITHDRAWAL',
        w.id,
        ev instanceof Date ? ev.toISOString() : String(ev),
        'DEBIT',
        String(normalizeDataExportNumber(w.amount)),
        `Withdrawal ref ${w.reference || ''}`.trim(),
        '',
        '',
        '',
        '',
        w.status,
        '',
        '',
      ])
    }

    for (const p of payload.positions) {
      const posTs =
        p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? '')
      rows.push([
        'OPEN_POSITION_SNAPSHOT',
        p.id,
        posTs,
        '',
        String(normalizeDataExportNumber(p.unrealizedPnL)),
        'Non-zero holdings snapshot (not range-filtered)',
        p.symbol,
        '',
        String(p.quantity),
        String(normalizeDataExportNumber(p.averagePrice)),
        p.quantity === 0 ? 'CLOSED' : 'OPEN',
        '',
        '',
      ])
    }

    return rows.map((r) => r.map(esc).join(',')).join('\n')
  }

  /**
   * ZIP audit pack: separate CSVs + manifest.json (plan: ledger, executed_orders, manifest; plus funds & positions).
   */
  static buildStatementZipUint8Array(payload: {
    manifest: import('@/lib/services/statement/statement-aggregation.service').StatementManifest
    transactions: any[]
    orders: any[]
    deposits: any[]
    withdrawals: any[]
    positions: any[]
  }): Uint8Array {
    const ledgerCsv = this.generateCSV(
      payload.transactions.map((t: any) => ({
        'Transaction ID': t.id,
        Amount: normalizeDataExportNumber(t.amount),
        Type: t.type,
        Description: t.description || '',
        'Order ref': t.orderId || '',
        'Position ref': t.positionId || '',
        Date: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      })),
      ['Transaction ID', 'Amount', 'Type', 'Description', 'Order ref', 'Position ref', 'Date'],
    )

    const ordersCsv = this.generateCSV(
      payload.orders.map((o: any) => {
        const exec = o.executedAt || o.createdAt
        return {
          'Order ID': o.id,
          Symbol: o.symbol,
          Side: o.orderSide,
          Quantity: o.quantity,
          'Filled Qty': o.filledQuantity ?? o.quantity,
          'Avg price':
            o.averagePrice != null ? normalizeDataExportNumber(o.averagePrice) : '',
          Status: o.status,
          'Executed At': exec instanceof Date ? exec.toISOString() : String(exec ?? ''),
          'Created At': o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt ?? ''),
        }
      }),
      [
        'Order ID',
        'Symbol',
        'Side',
        'Quantity',
        'Filled Qty',
        'Avg price',
        'Status',
        'Executed At',
        'Created At',
      ],
    )

    const depositsCsv = this.generateCSV(
      payload.deposits.map((d: any) => {
        const ev = d.processedAt || d.createdAt
        return {
          'Deposit ID': d.id,
          Amount: normalizeDataExportNumber(d.amount),
          Method: d.method,
          UTR: d.utr || '',
          Status: d.status,
          'Event At': ev instanceof Date ? ev.toISOString() : String(ev ?? ''),
        }
      }),
      ['Deposit ID', 'Amount', 'Method', 'UTR', 'Status', 'Event At'],
    )

    const withdrawalsCsv = this.generateCSV(
      payload.withdrawals.map((w: any) => {
        const ev = w.processedAt || w.createdAt
        return {
          'Withdrawal ID': w.id,
          Amount: normalizeDataExportNumber(w.amount),
          Charges: normalizeDataExportNumber(w.charges),
          Reference: w.reference || '',
          Status: w.status,
          'Event At': ev instanceof Date ? ev.toISOString() : String(ev ?? ''),
        }
      }),
      ['Withdrawal ID', 'Amount', 'Charges', 'Reference', 'Status', 'Event At'],
    )

    const positionsCsv = this.generateCSV(
      payload.positions.map((p: any) => ({
        'Position ID': p.id,
        Symbol: p.symbol,
        Quantity: p.quantity,
        'Avg price': normalizeDataExportNumber(p.averagePrice),
        'Unrealized PnL': normalizeDataExportNumber(p.unrealizedPnL),
        'Created At': p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ''),
      })),
      ['Position ID', 'Symbol', 'Quantity', 'Avg price', 'Unrealized PnL', 'Created At'],
    )

    const manifestJson = JSON.stringify(payload.manifest, null, 2)

    return zipSync({
      'ledger.csv': strToU8(ledgerCsv),
      'executed_orders.csv': strToU8(ordersCsv),
      'deposits.csv': strToU8(depositsCsv),
      'withdrawals.csv': strToU8(withdrawalsCsv),
      'open_positions_snapshot.csv': strToU8(positionsCsv),
      'manifest.json': strToU8(manifestJson),
    })
  }

  /**
   * Generate trading statement (full reconciliation; no silent caps in-range).
   */
  static async generateStatement(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    orders: any[]
    positions: any[]
    transactions: any[]
    deposits: any[]
    withdrawals: any[]
    manifest: import('@/lib/services/statement/statement-aggregation.service').StatementManifest
    summary: any
    /** End-user / console: merged cash rows with running balances (deduped funds + cash-only balance column). */
    statementRows: ReturnType<typeof applyRunningBalancesAndSortDesc>
    statementEvents: Array<{
      id: string
      kind: string
      dateIso: string
      primary: ReturnType<typeof toAdminStatementRow>
      children: ReturnType<typeof toAdminStatementRow>[]
    }>
    statementFunds: {
      opening: { balance: number; availableMargin: number | null; usedMargin: number | null }
      closing: { balance: number; availableMargin: number; usedMargin: number }
      cashStreamTotals: { netCashInWindow: number }
    } | null
    statementWarnings: string[]
  }> {
    console.log("📤 [DATA-EXPORT] Generating statement")

    try {
      const agg = await StatementAggregationService.buildForUser(userId, startDate, endDate)

      const toPlain = (v: unknown) =>
        typeof v === 'object' && v !== null && 'toJSON' in v && typeof (v as { toJSON: () => unknown }).toJSON === 'function'
          ? (v as { toJSON: () => unknown }).toJSON()
          : v

      const transactions = agg.ledger.map((t) => ({
        id: t.id,
        tradingAccountId: t.tradingAccountId,
        amount: toPlain(t.amount),
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
        orderId: t.orderId,
        positionId: t.positionId,
        order: t.order,
        position: t.position,
      }))

      const orders = agg.executedOrders.map((o) => ({
        ...o,
        price: o.price != null ? toPlain(o.price) : null,
        averagePrice: o.averagePrice != null ? toPlain(o.averagePrice) : null,
      }))

      const positions = agg.openPositionsSnapshot.map((p) => ({
        ...p,
        averagePrice: toPlain(p.averagePrice),
        unrealizedPnL: toPlain(p.unrealizedPnL),
        dayPnL: toPlain(p.dayPnL),
        stopLoss: p.stopLoss != null ? toPlain(p.stopLoss) : null,
        target: p.target != null ? toPlain(p.target) : null,
        strikePrice: p.strikePrice != null ? toPlain(p.strikePrice) : null,
      }))

      const deposits = agg.deposits.map((d) => ({
        ...d,
        amount: toPlain(d.amount),
      }))

      const withdrawals = agg.withdrawals.map((w) => ({
        ...w,
        amount: toPlain(w.amount),
        charges: toPlain(w.charges),
      }))

      const totalPnL = positions.reduce((sum, p) => sum + normalizeDataExportNumber(p.unrealizedPnL), 0)

      const ordersSlice = agg.executedOrders.map((o) => {
        const st = o.Stock
        const instrumentLabel = formatInstrumentSummary({
          symbol: o.symbol,
          exchange: st?.exchange,
          segment: st?.segment,
          name: st?.name,
          strikePrice: st?.strikePrice,
          optionType: st?.optionType,
          expiry: st?.expiry,
          lotSize: st?.lot_size,
        })
        return {
          id: o.id,
          symbol: o.symbol,
          instrumentLabel,
          orderSide: o.orderSide,
          quantity: o.quantity,
          filledQuantity: o.filledQuantity,
          price: o.price,
          averagePrice: o.averagePrice,
          status: o.status,
          executedAt: o.executedAt,
          createdAt: o.createdAt,
        }
      })
      const transactionsSlice = agg.ledger.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
        orderId: t.orderId,
        positionId: t.positionId ?? null,
      }))
      const depositsSlice = agg.deposits.map((d) => ({
        id: d.id,
        amount: d.amount,
        method: d.method,
        utr: d.utr,
        status: d.status,
        createdAt: d.createdAt,
        processedAt: d.processedAt,
      }))
      const withdrawalsSlice = agg.withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        charges: w.charges,
        reference: w.reference,
        status: w.status,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
      }))

      const built = buildStatementLinesFromEntities({
        orders: ordersSlice,
        transactions: transactionsSlice,
        deposits: depositsSlice,
        withdrawals: withdrawalsSlice,
      })
      const taRow = await prisma.tradingAccount.findUnique({
        where: { userId },
        select: { balance: true, availableMargin: true, usedMargin: true },
      })
      const currentBalance = normalizeDataExportNumber(taRow?.balance)
      const availM = normalizeDataExportNumber(taRow?.availableMargin)
      const usedM = normalizeDataExportNumber(taRow?.usedMargin)
      const statementRows = applyRunningBalancesAndSortDesc(built.lines.map(toAdminStatementRow), currentBalance)
      const cashBalById = new Map(statementRows.map((r) => [r.id, r.balance]))
      const fundsMeta = computeFundsWindowMeta({
        lines: built.lines,
        closing: { balance: currentBalance, availableMargin: availM, usedMargin: usedM },
      })
      const statementFunds = taRow
        ? {
            opening: fundsMeta.opening,
            closing: { balance: currentBalance, availableMargin: availM, usedMargin: usedM },
            cashStreamTotals: fundsMeta.cashStreamTotals,
          }
        : null
      const statementWarnings: string[] = [...built.warnings]
      if (built.dedupedDepositIds.length > 0) {
        statementWarnings.push(
          `${built.dedupedDepositIds.length} deposit record(s) merged with ledger rows (deduped).`,
        )
      }
      if (built.dedupedWithdrawalIds.length > 0) {
        statementWarnings.push(
          `${built.dedupedWithdrawalIds.length} withdrawal record(s) merged with ledger rows (deduped).`,
        )
      }
      const statementEvents = groupStatementEvents(built.lines).map((g) => {
        const primary = toAdminStatementRow(g.primary)
        const children = g.children.map(toAdminStatementRow)
        return {
          id: g.id,
          kind: g.kind,
          dateIso: g.dateIso,
          primary: { ...primary, balance: cashBalById.get(primary.id) },
          children: children.map((c) => ({ ...c, balance: cashBalById.get(c.id) })),
        }
      })

      const summary = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalOrders: orders.length,
        executedOrders: orders.length,
        totalPositionsSnapshot: positions.length,
        closedPositionsInSnapshot: positions.filter((p) => p.quantity === 0).length,
        totalPnL,
        totalCharges: agg.manifest.sums.chargesLikelyDebits,
        totalCredits: agg.manifest.sums.ledgerCredits,
        totalDebits: agg.manifest.sums.ledgerDebits,
        netCashFlow: agg.manifest.sums.ledgerCredits - agg.manifest.sums.ledgerDebits,
        manifest: agg.manifest,
        funds: statementFunds,
        statementWarnings,
      }

      return {
        orders,
        positions,
        transactions,
        deposits,
        withdrawals,
        manifest: agg.manifest,
        summary,
        statementRows,
        statementEvents,
        statementFunds,
        statementWarnings,
      }
    } catch (error) {
      console.error("❌ [DATA-EXPORT] Error generating statement:", error)
      throw error
    }
  }
}

console.log("✅ [DATA-EXPORT] Module initialized")
