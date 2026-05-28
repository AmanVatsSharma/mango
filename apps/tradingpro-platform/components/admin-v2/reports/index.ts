/**
 * File:        components/admin-v2/reports/index.ts
 * Module:      admin-v2/reports
 * Purpose:     Barrel — re-exports the public surface of the reports module.
 *
 * Exports:
 *   - ReportsWorkbench  — main workbench component
 *   - CashFlowChart     — standalone grouped bar chart
 *   - useFinancialReport, useTradingChart  — SWR hooks
 *   - ReportPeriod, ReportRow, FinancialReportResp, TimeSeriesPoint  — types
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export { ReportsWorkbench } from "./reports-workbench"
export { CashFlowChart } from "./cash-flow-chart"
export { useFinancialReport, useTradingChart } from "./hooks"
export type {
  ReportPeriod,
  ReportRow,
  ReportSummary,
  TimeSeriesPoint,
  FinancialReportResp,
  TradingChartResp,
} from "./types"
