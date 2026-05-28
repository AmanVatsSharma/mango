/**
 * @file components/admin-v2/reports/types.ts
 * @module admin-v2/reports
 * @description UI-side DTOs for the Phase 14 Reports Workbench. Mirrors the
 *              /api/admin/financial/reports response shape — kept separate so the
 *              client bundle never imports server-only modules.
 *
 * @author StockTrade
 * @created 2026-04-30
 */

export type ReportPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom"

export interface ReportSummary {
  totalDeposits: number
  totalWithdrawals: number
  netFlow: number
  pendingDeposits: number
  pendingWithdrawals: number
  platformCommission: number
  executedOrdersCount: number
  totalPlacementCharges: number
  activeUsers: number
}

export interface ReportRow {
  id: string
  period: string
  revenue: number
  expenses: number
  profit: number
  commission: number
  trades: number
  users: number
  placementChargesTotal: number
}

export interface TimeSeriesPoint {
  bucket: string
  deposits: number
  withdrawals: number
}

export interface FinancialReportResp {
  reports: ReportRow[]
  summary: ReportSummary
  timeSeries: TimeSeriesPoint[]
  timeSeriesGranularity: "hour" | "day" | "week"
}

export interface TradingChartPoint {
  date: string
  orders?: number
  trades?: number
  volume?: number
  [key: string]: unknown
}

export interface TradingChartResp {
  success: boolean
  chartData: TradingChartPoint[]
}
