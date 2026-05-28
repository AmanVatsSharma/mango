/**
 * @file route.ts
 * @module api-export
 * @description User export API (CSV/JSON) including enterprise multi-section statement CSV + optional ledger-only csv-ledger.
 * @author StockTrade
 * @created 2025-01-01
 * @updated 2026-03-30
 */

import { NextResponse } from 'next/server'
import { DataExportService } from '@/lib/services/export/DataExportService'
import { auth } from '@/auth'
import { getEffectiveStatementsEnabledForUser } from '@/lib/server/console-statements'
import { normalizeApiFiniteNumber, normalizeApiOptionalDate } from '@/lib/server/api-number-utils'

export async function GET(req: Request) {
  console.log("📤 [API-EXPORT] GET request received")
  
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'orders'
    const startDateRaw = searchParams.get('startDate')
    const endDateRaw = searchParams.get('endDate')
    const startDate = normalizeApiOptionalDate(startDateRaw)
    const endDate = normalizeApiOptionalDate(endDateRaw)
    const format = searchParams.get('format') || 'csv'

    if (startDateRaw !== null && startDateRaw.trim() !== '' && !startDate) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
    }
    if (endDateRaw !== null && endDateRaw.trim() !== '' && !endDate) {
      return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 })
    }

    // Enforce statements feature flag (only for statement export)
    if (type === 'statement') {
      const resolution = await getEffectiveStatementsEnabledForUser(session.user.id!)
      if (!resolution.enabled) {
        console.warn("🚫 [API-EXPORT] Statement export blocked by settings", {
          userId: session.user.id,
          source: resolution.source,
        })
        return NextResponse.json(
          { success: false, error: 'Statements are disabled for this account' },
          { status: 403 }
        )
      }
    }

    let data: string | any
    let filename: string
    let contentType: string

    switch (type) {
      case 'orders':
        data = await DataExportService.exportOrders(session.user.id!, startDate, endDate)
        filename = `orders_${new Date().toISOString()}.csv`
        contentType = 'text/csv'
        break
      
      case 'positions':
        data = await DataExportService.exportPositions(session.user.id!)
        filename = `positions_${new Date().toISOString()}.csv`
        contentType = 'text/csv'
        break
      
      case 'transactions':
        data = await DataExportService.exportTransactions(session.user.id!, startDate, endDate)
        filename = `transactions_${new Date().toISOString()}.csv`
        contentType = 'text/csv'
        break
      
      case 'statement':
        if (!startDate || !endDate) {
          return NextResponse.json({
            error: 'Start date and end date required for statement'
          }, { status: 400 })
        }
        data = await DataExportService.generateStatement(session.user.id!, startDate, endDate)
        
        if (format === 'json') {
          return NextResponse.json({
            success: true,
            data
          })
        }

        if (format === 'csv-ledger') {
          data = DataExportService.generateCSV(
            data.transactions.map((t: any) => ({
              'Transaction ID': t.id,
              'Amount': normalizeApiFiniteNumber(t.amount),
              'Type': t.type,
              'Description': t.description || '',
              'Date': t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
            })),
            ['Transaction ID', 'Amount', 'Type', 'Description', 'Date'],
          )
          filename = `statement_ledger_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`
          contentType = 'text/csv'
          break
        }

        if (format === 'zip') {
          const zipBytes = DataExportService.buildStatementZipUint8Array({
            manifest: data.manifest,
            transactions: data.transactions,
            orders: data.orders,
            deposits: data.deposits,
            withdrawals: data.withdrawals,
            positions: data.positions,
          })
          filename = `statement_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.zip`
          contentType = 'application/zip'
          return new NextResponse(zipBytes, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="${filename}"`,
            },
          })
        }

        data = DataExportService.buildStatementEnterpriseCsv({
          manifest: data.manifest,
          transactions: data.transactions,
          orders: data.orders,
          deposits: data.deposits,
          withdrawals: data.withdrawals,
          positions: data.positions,
        })
        filename = `statement_full_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`
        contentType = 'text/csv; charset=utf-8'
        break
      
      default:
        return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
    }

    console.log("✅ [API-EXPORT] Data exported successfully")
    
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      }
    })
  } catch (error: any) {
    console.error("❌ [API-EXPORT] Error:", error)
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to export data'
    }, { status: 500 })
  }
}
