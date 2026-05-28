"use client"

import { useState, useEffect, useCallback } from "react"

// Escape HTML entities to prevent XSS when rendering user-controlled strings
function escapeHtml(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Truncate long text for display (prevents UI overflow from user data)
function truncateText(str: string | null | undefined, maxLen = 200): string {
  if (!str) return ""
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str
}

/**
 * @file financial-reports.tsx
 * @module admin-console
 * @description Financial reports: cash flow KPIs, commission from configured rules, time series chart, CSV export, and explicit API/RBAC error states.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-05-14
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  FileText,
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Printer,
  Landmark,
  Users,
} from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton } from "./shared"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import type {
  FinancialReportRow,
  FinancialReportsApiResponse,
  FinancialReportsSummary,
  FinancialReportsTimeSeriesPoint,
} from "./financial-reports-types"

const IST_TZ = "Asia/Kolkata"

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

function formatInr(value: number): string {
  return inrFormatter.format(Number.isFinite(value) ? value : 0)
}

/** Compact rupees without pulling in IDR — custom compact for chart ticks */
function formatInrShort(value: number): string {
  const v = Number.isFinite(value) ? value : 0
  const abs = Math.abs(v)
  if (abs >= 1e7) {
    return `₹${(v / 1e7).toFixed(2)} Cr`
  }
  if (abs >= 1e5) {
    return `₹${(v / 1e5).toFixed(2)} L`
  }
  if (abs >= 1e3) {
    return `₹${(v / 1e3).toFixed(1)}k`
  }
  return `₹${v.toFixed(0)}`
}

function canReadFinancialReports(permissions: string[]): boolean {
  return permissions.includes("admin.all") || permissions.includes("admin.reports.read")
}

function parseErrorMessage(status: number, body: Record<string, unknown>): string {
  const msg = typeof body.message === "string" ? body.message : undefined
  const err = typeof body.error === "string" ? body.error : undefined
  if (status === 403) {
    return msg || err || "You do not have permission to view financial reports."
  }
  return msg || err || `Request failed (${status})`
}

function buildSummaryFromReports(
  reports: FinancialReportRow[],
): FinancialReportsSummary | null {
  const r = reports[0]
  if (!r) {
    return null
  }
  return {
    totalDeposits: r.revenue,
    totalWithdrawals: r.expenses,
    netFlow: r.profit,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    platformCommission: r.commission,
    executedOrdersCount: r.trades,
    totalPlacementCharges: r.placementChargesTotal ?? 0,
    activeUsers: r.users,
  }
}

function FinancialReportsChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) {
    return null
  }
  return (
    <div
      className="rounded-lg border border-border px-3 py-2 text-sm shadow-md"
      style={{ background: "var(--card)", color: "var(--foreground)" }}
    >
      {label != null && label !== "" ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.name)} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-mono tabular-nums">{formatInr(Number(p.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function normalizeApiResponse(data: unknown): FinancialReportsApiResponse | null {
  if (!data || typeof data !== "object") {
    return null
  }
  const o = data as Record<string, unknown>
  if (!Array.isArray(o.reports)) {
    return null
  }
  const reports = o.reports as FinancialReportRow[]
  let summary = (o.summary as FinancialReportsSummary | undefined) ?? null
  if (!summary && reports.length > 0) {
    summary = buildSummaryFromReports(reports)
  }
  if (!summary) {
    return null
  }
  const timeSeries = Array.isArray(o.timeSeries)
    ? (o.timeSeries as FinancialReportsTimeSeriesPoint[])
    : []
  const timeSeriesGranularity =
    o.timeSeriesGranularity === "day" || o.timeSeriesGranularity === "week" || o.timeSeriesGranularity === "month"
      ? o.timeSeriesGranularity
      : "day"
  return { reports, summary, timeSeries, timeSeriesGranularity }
}

export function FinancialReports() {
  const { permissions, loading: sessionLoading } = useAdminSession()
  const allowed = canReadFinancialReports(permissions)

  const [draftFilters, setDraftFilters] = useState({
    period: "month",
    dateFrom: "",
    dateTo: "",
  })
  const [appliedFilters, setAppliedFilters] = useState({
    period: "month",
    dateFrom: "",
    dateTo: "",
  })

  const [reports, setReports] = useState<FinancialReportRow[]>([])
  const [summary, setSummary] = useState<FinancialReportsSummary | null>(null)
  const [timeSeries, setTimeSeries] = useState<FinancialReportsTimeSeriesPoint[]>([])
  const [timeSeriesGranularity, setTimeSeriesGranularity] = useState<"day" | "week" | "month">("day")
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [emptyReason, setEmptyReason] = useState<"none" | "no_data">("none")

  const fetchReports = useCallback(async () => {
    if (sessionLoading) {
      return
    }
    if (!allowed) {
      setLoadError("Insufficient permissions (admin.reports.read required).")
      setReports([])
      setSummary(null)
      setTimeSeries([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    setEmptyReason("none")

    const params = new URLSearchParams()
    params.set("period", appliedFilters.period)
    if (appliedFilters.dateFrom) {
      params.set("dateFrom", appliedFilters.dateFrom)
    }
    if (appliedFilters.dateTo) {
      params.set("dateTo", appliedFilters.dateTo)
    }

    let response: Response
    try {
      response = await fetch(`/api/admin/financial/reports?${params.toString()}`)
    } catch {
      setLoadError("Network error. Check your connection and try again.")
      setReports([])
      setSummary(null)
      setTimeSeries([])
      setLoading(false)
      toast({
        title: "Network error",
        description: "Could not reach financial reports API.",
        variant: "destructive",
      })
      return
    }

    let body: Record<string, unknown> = {}
    try {
      body = (await response.json()) as Record<string, unknown>
    } catch {
      body = {}
    }

    if (!response.ok) {
      const message = parseErrorMessage(response.status, body)
      const rid = typeof body.requestId === "string" ? body.requestId : undefined
      setLoadError(rid ? `${message} (ref: ${rid})` : message)
      setReports([])
      setSummary(null)
      setTimeSeries([])
      setLoading(false)
      toast({
        title: response.status === 403 ? "Access denied" : "Could not load reports",
        description: message,
        variant: "destructive",
      })
      return
    }

    const parsed = normalizeApiResponse(body)
    if (!parsed) {
      setLoadError("Invalid response from server.")
      setReports([])
      setSummary(null)
      setTimeSeries([])
      setLoading(false)
      toast({
        title: "Invalid data",
        description: "Financial reports response could not be parsed.",
        variant: "destructive",
      })
      return
    }

    setReports(parsed.reports)
    setSummary(parsed.summary)
    setTimeSeries(parsed.timeSeries)
    setTimeSeriesGranularity(parsed.timeSeriesGranularity)

    const hasCash =
      parsed.summary.totalDeposits > 0 ||
      parsed.summary.totalWithdrawals > 0 ||
      parsed.summary.executedOrdersCount > 0
    if (!hasCash && parsed.reports.length > 0) {
      setEmptyReason("no_data")
    }

    setLoading(false)
  }, [allowed, appliedFilters, sessionLoading])

  useEffect(() => {
    void fetchReports()
  }, [fetchReports])

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters })
  }

  const chartData = timeSeries.map((p) => ({
    label: new Date(p.bucket).toLocaleString("en-IN", {
      timeZone: IST_TZ,
      month: "short",
      day: "numeric",
      ...(timeSeriesGranularity === "month" ? { year: "2-digit" } : {}),
    }),
    deposits: p.deposits,
    withdrawals: p.withdrawals,
  }))

  const exportCsv = () => {
    if (!summary && reports.length === 0) {
      toast({ title: "Nothing to export", description: "Load reports first." })
      return
    }
    const lines: string[][] = []
    lines.push(["Financial Reports Export"])
    lines.push(["Generated (IST)", new Date().toLocaleString("en-IN", { timeZone: IST_TZ })])
    lines.push(["Period filter", appliedFilters.period])
    lines.push(["Date from", appliedFilters.dateFrom || "—"])
    lines.push(["Date to", appliedFilters.dateTo || "—"])
    lines.push([])
    if (summary) {
      lines.push(["Metric", "Value"])
      lines.push(["Total deposits (completed)", String(summary.totalDeposits)])
      lines.push(["Total withdrawals (completed)", String(summary.totalWithdrawals)])
      lines.push(["Net flow", String(summary.netFlow)])
      lines.push(["Pending deposits (count)", String(summary.pendingDeposits)])
      lines.push(["Pending withdrawals (count)", String(summary.pendingWithdrawals)])
      lines.push(["Platform commission (rules)", String(summary.platformCommission)])
      lines.push(["Executed orders", String(summary.executedOrdersCount)])
      lines.push(["Order placement charges (sum)", String(summary.totalPlacementCharges)])
      lines.push(["Active users (updates in range)", String(summary.activeUsers)])
      lines.push([])
    }
    lines.push(["Table"])
    lines.push([
      "Period",
      "Revenue",
      "Expenses",
      "Net",
      "Commission",
      "Executed orders",
      "Placement charges",
      "Users",
    ])
    for (const r of reports) {
      lines.push([
        r.period,
        String(r.revenue),
        String(r.expenses),
        String(r.profit),
        String(r.commission),
        String(r.trades),
        String(r.placementChargesTotal ?? 0),
        String(r.users),
      ])
    }
    if (timeSeries.length > 0) {
      lines.push([])
      lines.push(["Time series", `granularity=${timeSeriesGranularity}`])
      lines.push(["Bucket (ISO)", "Deposits", "Withdrawals"])
      for (const p of timeSeries) {
        lines.push([p.bucket, String(p.deposits), String(p.withdrawals)])
      }
    }
    const esc = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`
    const content = lines.map((row) => row.map(esc).join(",")).join("\n")
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `financial-reports-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Export started", description: "CSV download should begin shortly." })
  }

  const handlePrint = () => {
    window.print()
  }

  const showNoCashBanner = !loading && !loadError && emptyReason === "no_data"

  return (
    <div id="financial-reports-root" className="space-y-3 sm:space-y-4 md:space-y-6 print:space-y-4">
      {!allowed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access required</AlertTitle>
          <AlertDescription>
            Your role does not include <strong>admin.reports.read</strong>. Ask a super-admin to grant access or use an
            ADMIN account.
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title="Financial Reports"
        description="Cash flow, platform commission, execution metrics, and trends for broker operations"
        icon={<FileText className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <RefreshButton
              onClick={() => void fetchReports()}
              loading={loading}
              disabled={!allowed || sessionLoading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-primary/50 text-primary hover:bg-primary/10 text-xs sm:text-sm print:hidden"
              onClick={exportCsv}
              disabled={!allowed || loading || sessionLoading}
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-primary/50 text-primary hover:bg-primary/10 text-xs sm:text-sm print:hidden"
              onClick={handlePrint}
              disabled={!allowed || sessionLoading}
            >
              <Printer className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Print / PDF</span>
              <span className="sm:hidden">Print</span>
            </Button>
          </>
        }
      />

      <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Select
              value={draftFilters.period}
              onValueChange={(value) => setDraftFilters({ ...draftFilters, period: value })}
              disabled={!allowed || sessionLoading}
            >
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="From date"
              value={draftFilters.dateFrom}
              onChange={(e) => setDraftFilters({ ...draftFilters, dateFrom: e.target.value })}
              className="bg-background border-border"
              disabled={!allowed || sessionLoading}
            />
            <Input
              type="date"
              aria-label="To date"
              value={draftFilters.dateTo}
              onChange={(e) => setDraftFilters({ ...draftFilters, dateTo: e.target.value })}
              className="bg-background border-border"
              disabled={!allowed || sessionLoading}
            />
            <Button
              type="button"
              onClick={applyFilters}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!allowed || sessionLoading}
            >
              <Filter className="w-4 h-4 mr-2" />
              Apply filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load reports</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {showNoCashBanner && (
        <Alert>
          <Landmark className="h-4 w-4" />
          <AlertTitle>No completed cash movement in this range</AlertTitle>
          <AlertDescription>
            Deposits, withdrawals, and executed orders are all zero for the selected filters. Try widening the date range
            or pick another period.
          </AlertDescription>
        </Alert>
      )}

      {summary && !loadError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 print:gap-3">
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Deposits (completed)</p>
                  <p className="text-lg sm:text-xl font-bold text-green-400 truncate">{formatInr(summary.totalDeposits)}</p>
                </div>
                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-green-400 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Withdrawals (completed)</p>
                  <p className="text-lg sm:text-xl font-bold text-red-400 truncate">{formatInr(summary.totalWithdrawals)}</p>
                </div>
                <TrendingDown className="w-6 h-6 sm:w-7 sm:h-7 text-red-400 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Net flow</p>
                  <p className="text-lg sm:text-xl font-bold text-primary truncate">{formatInr(summary.netFlow)}</p>
                </div>
                <DollarSign className="w-6 h-6 sm:w-7 sm:h-7 text-primary flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Pending deposits / withdrawals</p>
                  <p className="text-lg sm:text-xl font-bold text-amber-400 truncate">
                    {summary.pendingDeposits} / {summary.pendingWithdrawals}
                  </p>
                </div>
                <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Platform commission (rules)</p>
                  <p className="text-lg sm:text-xl font-bold text-yellow-400 truncate">
                    {formatInr(summary.platformCommission)}
                  </p>
                </div>
                <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-400 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Executed orders / placement charges</p>
                  <p className="text-lg sm:text-xl font-bold text-sky-400 truncate">
                    {summary.executedOrdersCount.toLocaleString("en-IN")} · {formatInr(summary.totalPlacementCharges)}
                  </p>
                </div>
                <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-sky-400 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm neon-border print:shadow-none sm:col-span-2 xl:col-span-3">
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Active users (policy window)</p>
                  <p className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    {summary.activeUsers.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length > 0 && !loadError && allowed && (
        <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
          <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-0">
            <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Deposits vs withdrawals ({timeSeriesGranularity} buckets, IST)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 h-[300px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => formatInrShort(Number(v))} width={56} tick={{ fontSize: 11 }} />
                <Tooltip content={<FinancialReportsChartTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="deposits" name="Deposits" stroke="hsl(142 76% 45%)" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="withdrawals"
                  name="Withdrawals"
                  stroke="hsl(0 84% 60%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border shadow-sm neon-border print:shadow-none">
        <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl font-bold text-primary">Period detail</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <div className="min-w-[900px] sm:min-w-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Period</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Executed orders</TableHead>
                    <TableHead>Placement charges</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead className="print:hidden">Export</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(loading || sessionLoading) && reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        {sessionLoading ? "Loading admin session…" : "Loading reports…"}
                      </TableCell>
                    </TableRow>
                  ) : reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        {loadError
                          ? "No data loaded — see the alert above."
                          : "No report rows yet. Adjust filters and click Apply filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map((report) => (
                      <TableRow key={report.id} className="border-border">
                        <TableCell className="font-medium text-foreground" title={escapeHtml(report.period)}>
                          {truncateText(report.period)}
                        </TableCell>
                        <TableCell className="text-green-400 whitespace-nowrap">{formatInr(report.revenue)}</TableCell>
                        <TableCell className="text-red-400 whitespace-nowrap">{formatInr(report.expenses)}</TableCell>
                        <TableCell className="text-primary font-bold whitespace-nowrap">{formatInr(report.profit)}</TableCell>
                        <TableCell className="text-yellow-400 whitespace-nowrap">{formatInr(report.commission)}</TableCell>
                        <TableCell>{report.trades.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatInr(report.placementChargesTotal ?? 0)}</TableCell>
                        <TableCell>{report.users.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="print:hidden">
                          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
                            <Download className="w-4 h-4 mr-2" />
                            CSV
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
