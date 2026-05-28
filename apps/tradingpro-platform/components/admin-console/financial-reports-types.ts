/**
 * @file financial-reports-types.ts
 * @module admin-console
 * @description Shared types for GET /api/admin/financial/reports and the FinancialReports UI.
 * @author StockTrade
 * @created 2026-04-06
 */

export interface FinancialReportRow {
  id: string
  period: string
  revenue: number
  expenses: number
  profit: number
  commission: number
  trades: number
  users: number
  /** Sum of placementCharges on executed orders in range (rupees). */
  placementChargesTotal: number
}

export interface FinancialReportsSummary {
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

export interface FinancialReportsTimeSeriesPoint {
  bucket: string
  deposits: number
  withdrawals: number
}

export type FinancialReportsTimeGranularity = "day" | "week" | "month"

export interface FinancialReportsApiResponse {
  reports: FinancialReportRow[]
  summary: FinancialReportsSummary
  timeSeries: FinancialReportsTimeSeriesPoint[]
  timeSeriesGranularity: FinancialReportsTimeGranularity
}
