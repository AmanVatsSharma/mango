/**
 * File:        components/admin-v2/reports/reports-workbench.tsx
 * Module:      admin-v2/reports
 * Purpose:     Phase 14 Reports Workbench — period-driven financial snapshot with KPI tiles,
 *              cash-flow chart, period breakdown table, and CSV export. Single source of truth
 *              for "what happened financially in this window."
 *
 * Exports:
 *   - ReportsWorkbench  — full-page workbench; no props (self-fetching via SWR hooks)
 *
 * Depends on:
 *   - @/components/admin-v2/primitives/kpi-tile  — KPI tile primitive
 *   - @/lib/admin-v2/api-client                  — formatInr, formatDateTimeIst
 *   - ./hooks                                    — useFinancialReport
 *   - ./cash-flow-chart                          — grouped deposits/withdrawals bar chart
 *   - ./types                                    — ReportPeriod, ReportRow, ReportSummary
 *
 * Side-effects:
 *   - SWR polling every 60s on /api/admin/financial/reports
 *   - Creates + immediately revokes a Blob URL on CSV export click
 *
 * Key invariants:
 *   - Custom period requires both dateFrom and dateTo; the Fetch button is disabled until both set
 *   - CSV export is disabled while loading or when reports[] is empty
 *   - All currency values rendered via formatInr (Indian crore/lakh shorthands)
 *
 * Read order:
 *   1. ReportPeriod tabs + period picker state — understand the filter surface
 *   2. KPI tile grid — the summary metrics strip
 *   3. CashFlowChart section — time-series visualization
 *   4. Breakdown table — period-level rows with sortable columns
 *   5. exportCsv — the export helper
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Download,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useFinancialReport } from "./hooks"
import { CashFlowChart } from "./cash-flow-chart"
import type { ReportPeriod, ReportRow } from "./types"

const PERIOD_TABS: { id: ReportPeriod; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" },
]

const TABLE_COLS: { key: keyof ReportRow; label: string; numeric?: boolean }[] = [
  { key: "period", label: "Period" },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "expenses", label: "Expenses", numeric: true },
  { key: "profit", label: "Profit", numeric: true },
  { key: "commission", label: "Commission", numeric: true },
  { key: "placementChargesTotal", label: "Placement charges", numeric: true },
  { key: "trades", label: "Trades", numeric: true },
  { key: "users", label: "Active users", numeric: true },
]

function exportCsv(rows: ReportRow[], period: ReportPeriod) {
  const header = TABLE_COLS.map((c) => c.label).join(",")
  const body = rows
    .map((r) =>
      TABLE_COLS.map(({ key, numeric }) => {
        const v = r[key]
        return numeric ? String(v ?? 0) : `"${String(v ?? "").replace(/"/g, '""')}"`
      }).join(","),
    )
    .join("\n")
  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `financial-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsWorkbench() {
  const [period, setPeriod] = React.useState<ReportPeriod>("month")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [customActive, setCustomActive] = React.useState(false)

  const fetchParams = React.useMemo(
    () =>
      period === "custom"
        ? { period, dateFrom: customActive ? dateFrom : undefined, dateTo: customActive ? dateTo : undefined }
        : { period },
    [period, dateFrom, dateTo, customActive],
  )

  const { data, isLoading, error, mutate } = useFinancialReport(fetchParams)

  const summary = data?.summary
  const reports = data?.reports ?? []
  const timeSeries = data?.timeSeries ?? []

  const canFetchCustom = period === "custom" ? dateFrom.length > 0 && dateTo.length > 0 : true
  const canExport = !isLoading && reports.length > 0

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Reports</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Financial workbench · fund flows · brokerage
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Financial reports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Period-level snapshot of deposits, withdrawals, net flows, platform commission, and
            active-user counts. Switch the period or use custom date range for drill-down.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            aria-label="Refresh reports"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--v2-text-mute)] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => exportCsv(reports, period)}
            disabled={!canExport}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--v2-text-mute)] transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Period picker */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setPeriod(t.id)
                if (t.id !== "custom") setCustomActive(false)
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                period === t.id
                  ? "bg-white/[0.08] text-white"
                  : "text-[var(--v2-text-mute)] hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <span className="text-xs text-[var(--v2-text-faint)]">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              onClick={() => setCustomActive(true)}
              disabled={!canFetchCustom}
              className="rounded-lg bg-[var(--v2-cobalt)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              Fetch
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-[var(--v2-loss)]/30 bg-[var(--v2-loss-soft)] px-4 py-3 text-sm text-[var(--v2-loss)]">
          {(error as Error).message ?? "Failed to load report data. Try refreshing."}
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiTile
          label="Total deposits"
          value={formatInr(summary?.totalDeposits ?? 0)}
          tone="success"
          loading={isLoading}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          hint={summary?.pendingDeposits ? `${summary.pendingDeposits} pending` : undefined}
        />
        <KpiTile
          label="Total withdrawals"
          value={formatInr(summary?.totalWithdrawals ?? 0)}
          tone="danger"
          loading={isLoading}
          icon={<ArrowUpRight className="h-4 w-4" />}
          hint={summary?.pendingWithdrawals ? `${summary.pendingWithdrawals} pending` : undefined}
        />
        <KpiTile
          label="Net fund flow"
          value={formatInr(summary?.netFlow ?? 0)}
          tone={(summary?.netFlow ?? 0) >= 0 ? "success" : "danger"}
          loading={isLoading}
          icon={
            (summary?.netFlow ?? 0) >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
        />
        <KpiTile
          label="Platform commission"
          value={formatInr(summary?.platformCommission ?? 0)}
          tone="neutral"
          loading={isLoading}
          icon={<Zap className="h-4 w-4" />}
        />
        <KpiTile
          label="Placement charges"
          value={formatInr(summary?.totalPlacementCharges ?? 0)}
          tone="neutral"
          loading={isLoading}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <KpiTile
          label="Executed orders"
          value={(summary?.executedOrdersCount ?? 0).toLocaleString("en-IN")}
          tone="info"
          loading={isLoading}
          icon={<Zap className="h-4 w-4" />}
        />
        <KpiTile
          label="Active users"
          value={(summary?.activeUsers ?? 0).toLocaleString("en-IN")}
          tone="info"
          loading={isLoading}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* Cash-flow chart */}
      <div className="mb-6 v2-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Fund flow</h2>
          <span className="text-[10px] uppercase tracking-widest text-[var(--v2-text-faint)]">
            {data?.timeSeriesGranularity ?? "—"} buckets
          </span>
        </div>
        <CashFlowChart points={timeSeries} isLoading={isLoading} />
      </div>

      {/* Period breakdown table */}
      <div className="v2-card overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Period breakdown</h2>
          <p className="mt-0.5 text-[11px] text-[var(--v2-text-mute)]">
            One row per time bucket returned by the API
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {TABLE_COLS.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      {TABLE_COLS.map((c) => (
                        <td key={c.key} className="px-4 py-2.5">
                          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
                        </td>
                      ))}
                    </tr>
                  ))
                : reports.length === 0
                  ? (
                    <tr>
                      <td
                        colSpan={TABLE_COLS.length}
                        className="px-4 py-10 text-center text-[var(--v2-text-mute)]"
                      >
                        No data for this period
                      </td>
                    </tr>
                  )
                  : reports.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-2.5 font-medium text-white">{row.period}</td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-gain)]">
                        {formatInr(row.revenue)}
                      </td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-loss)]">
                        {formatInr(row.expenses)}
                      </td>
                      <td
                        className={cn(
                          "v2-num px-4 py-2.5 text-right font-semibold",
                          row.profit >= 0 ? "text-[var(--v2-gain)]" : "text-[var(--v2-loss)]",
                        )}
                      >
                        {formatInr(row.profit)}
                      </td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-text-mute)]">
                        {formatInr(row.commission)}
                      </td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-text-mute)]">
                        {formatInr(row.placementChargesTotal)}
                      </td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-text-mute)]">
                        {row.trades.toLocaleString("en-IN")}
                      </td>
                      <td className="v2-num px-4 py-2.5 text-right text-[var(--v2-text-mute)]">
                        {row.users.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
