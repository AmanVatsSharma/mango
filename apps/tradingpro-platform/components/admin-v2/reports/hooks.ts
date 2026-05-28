/**
 * @file components/admin-v2/reports/hooks.ts
 * @module admin-v2/reports
 * @description SWR hooks for the Phase 14 Reports Workbench.
 *
 * Exports:
 *   - useFinancialReport(params)   — /api/admin/financial/reports with period/dateFrom/dateTo
 *   - useTradingChart(days)        — /api/admin/charts/trading?days=N
 *
 * @author StockTrade
 * @created 2026-04-30
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type { FinancialReportResp, ReportPeriod, TradingChartResp } from "./types"

export interface FinancialReportParams {
  period: ReportPeriod
  dateFrom?: string
  dateTo?: string
}

export function useFinancialReport(params: FinancialReportParams) {
  const key = withQuery("/api/admin/financial/reports", {
    period: params.period !== "custom" ? params.period : undefined,
    dateFrom: params.period === "custom" ? params.dateFrom : undefined,
    dateTo: params.period === "custom" ? params.dateTo : undefined,
  })
  return useSWR<FinancialReportResp>(key, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}

export function useTradingChart(days: number) {
  return useSWR<TradingChartResp>(
    `/api/admin/charts/trading?days=${days}`,
    jsonFetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )
}
