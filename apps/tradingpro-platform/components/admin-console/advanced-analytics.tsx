/**
 * @file advanced-analytics.tsx
 * @module admin-console
 * @description Enterprise-grade analytics dashboard with Recharts, CSV export, and API-aligned KPIs.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Activity,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  Download,
  Calendar,
  Target,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton, TradingDashboardOnlineDot } from "./shared"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"
import type { AdminAnalyticsResponse, AdminAnalyticsTopUser } from "@/lib/types/admin-analytics"

type AnalyticsRange = "24h" | "7d" | "30d" | "90d" | "1y"

function emptyMetrics(): AdminAnalyticsResponse {
  return {
    totalRevenue: 0,
    totalTrades: 0,
    activeUsers: 0,
    avgOrderValue: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    conversionRate: null,
    churnRate: null,
    userGrowth: null,
    revenueGrowth: null,
    topPerformingUsers: [],
    revenueByPeriod: [],
    revenueBucketGranularity: "day",
    userActivity: [],
    tradingVolume: [],
  }
}

function parseAnalyticsJson(raw: unknown): AdminAnalyticsResponse {
  if (!raw || typeof raw !== "object") return emptyMetrics()
  const d = raw as Record<string, unknown>
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && !Number.isNaN(v) ? v : fallback
  const nullableNum = (v: unknown): number | null =>
    v === null || v === undefined ? null : typeof v === "number" && !Number.isNaN(v) ? v : null
  const users = Array.isArray(d.topPerformingUsers) ? d.topPerformingUsers : []
  return {
    totalRevenue: num(d.totalRevenue),
    totalTrades: num(d.totalTrades),
    activeUsers: num(d.activeUsers),
    avgOrderValue: num(d.avgOrderValue),
    totalDeposits: num(d.totalDeposits),
    totalWithdrawals: num(d.totalWithdrawals),
    conversionRate: nullableNum(d.conversionRate),
    churnRate: nullableNum(d.churnRate),
    userGrowth: nullableNum(d.userGrowth),
    revenueGrowth: nullableNum(d.revenueGrowth),
    topPerformingUsers: users as AdminAnalyticsTopUser[],
    revenueByPeriod: Array.isArray(d.revenueByPeriod) ? (d.revenueByPeriod as AdminAnalyticsResponse["revenueByPeriod"]) : [],
    revenueBucketGranularity:
      d.revenueBucketGranularity === "hour" || d.revenueBucketGranularity === "week"
        ? d.revenueBucketGranularity
        : "day",
    userActivity: [],
    tradingVolume: Array.isArray(d.tradingVolume) ? (d.tradingVolume as AdminAnalyticsResponse["tradingVolume"]) : [],
  }
}

async function parseAdminFetchError(response: Response | null): Promise<string> {
  if (!response) {
    return "Network error — could not reach analytics API."
  }
  const fallback = `Request failed (${response.status})`
  try {
    const text = await response.text()
    if (!text) return fallback
    const body = JSON.parse(text) as { error?: string; message?: string }
    return body.error || body.message || fallback
  } catch {
    return fallback
  }
}

function formatRevenueCr(value: number): string {
  if (value === 0) return "₹0"
  return `₹${(value / 100000).toFixed(2)}Cr`
}

function growthDisplay(
  v: number | null,
): { text: string; trend: "up" | "down" | "neutral" } | null {
  if (v === null || v === undefined) return null
  const sign = v > 0 ? "+" : ""
  return {
    text: `${sign}${v}% vs prior`,
    trend: v > 0 ? "up" : v < 0 ? "down" : "neutral",
  }
}

function csvEscape(field: string): string {
  if (/[",\n]/.test(field)) return `"${field.replace(/"/g, '""')}"`
  return field
}

function buildAnalyticsCsv(payload: AdminAnalyticsResponse, range: AnalyticsRange): string {
  const lines: string[] = []
  lines.push("section,key,value")
  lines.push(`meta,range,${csvEscape(range)}`)
  lines.push(`kpi,totalRevenue,${payload.totalRevenue}`)
  lines.push(`kpi,totalTrades,${payload.totalTrades}`)
  lines.push(`kpi,activeUsers,${payload.activeUsers}`)
  lines.push(`kpi,avgOrderValue,${payload.avgOrderValue}`)
  lines.push(`kpi,totalDeposits,${payload.totalDeposits}`)
  lines.push(`kpi,totalWithdrawals,${payload.totalWithdrawals}`)
  lines.push(`kpi,conversionRate,${payload.conversionRate ?? ""}`)
  lines.push(`kpi,churnRate,${payload.churnRate ?? ""}`)
  lines.push(`kpi,userGrowthPct,${payload.userGrowth ?? ""}`)
  lines.push(`kpi,revenueGrowthPct,${payload.revenueGrowth ?? ""}`)
  lines.push(`kpi,revenueBucketGranularity,${payload.revenueBucketGranularity}`)
  for (const row of payload.revenueByPeriod) {
    lines.push(`revenue,${csvEscape(row.period)},${row.value}`)
  }
  for (const row of payload.tradingVolume) {
    lines.push(`volume,${csvEscape(row.symbol)},${row.volume}`)
  }
  for (const u of payload.topPerformingUsers) {
    lines.push(
      `topUser,${csvEscape(u.id)},${csvEscape(u.name)},${csvEscape(u.clientId)},${u.profit},${u.trades}`,
    )
  }
  return lines.join("\n")
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface MetricCardProps {
  title: string
  value: string | number
  change?: string
  trend?: "up" | "down" | "neutral"
  icon: LucideIcon
  color: string
  description?: string
  loading?: boolean
}

function MetricCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color,
  description,
  loading,
}: MetricCardProps) {
  return (
    <Card className="bg-card border-border shadow-sm neon-border hover:shadow-md transition-shadow">
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">{title}</p>
            {loading ? (
              <div className="h-6 sm:h-8 w-20 sm:w-24 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate">{value}</p>
                {change ? (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {trend === "up" ? (
                      <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-green-400 flex-shrink-0" />
                    ) : trend === "down" ? (
                      <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 text-red-400 flex-shrink-0" />
                    ) : null}
                    <span
                      className={`text-xs sm:text-sm font-medium ${
                        trend === "up"
                          ? "text-green-400"
                          : trend === "down"
                            ? "text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {change}
                    </span>
                  </div>
                ) : null}
                {description ? (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{description}</p>
                ) : null}
              </>
            )}
          </div>
          <div className={`${color} bg-opacity-10 p-2 sm:p-3 rounded-lg flex-shrink-0`}>
            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const REVENUE_CHART_COL = "hsl(var(--primary))"

export function AdvancedAnalytics() {
  const [timeRange, setTimeRange] = useState<AnalyticsRange>("7d")
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<AdminAnalyticsResponse>(() => emptyMetrics())

  const topPerformingIds = useMemo(
    () => metrics.topPerformingUsers.map((u) => u.id),
    [metrics.topPerformingUsers],
  )
  const topPerformingLivePresence = useAdminTradingPresenceStream(
    topPerformingIds,
    topPerformingIds.length > 0,
  )

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await fetch(`/api/admin/analytics?range=${timeRange}`).catch(() => null)

      if (!response || !response.ok) {
        const message = await parseAdminFetchError(response)
        setLoadError(message)
        setMetrics(emptyMetrics())
        toast({
          title: "Analytics unavailable",
          description: message,
          variant: "destructive",
        })
        return
      }

      const data = await response.json()
      setLoadError(null)
      setMetrics(parseAnalyticsJson(data))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load analytics data"
      setLoadError(message)
      setMetrics(emptyMetrics())
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    void fetchAnalytics()
  }, [fetchAnalytics])

  const revenueGrowthUi = growthDisplay(metrics.revenueGrowth)
  const userGrowthUi = growthDisplay(metrics.userGrowth)

  const volumeMax = useMemo(() => {
    const v = metrics.tradingVolume
    if (!v.length) return 1
    return Math.max(...v.map((x) => x.volume), 1)
  }, [metrics.tradingVolume])

  const showEmptyRangeHint =
    !loadError &&
    !loading &&
    metrics.totalRevenue === 0 &&
    metrics.totalTrades === 0 &&
    metrics.activeUsers === 0 &&
    metrics.avgOrderValue === 0

  const granularityLabel =
    metrics.revenueBucketGranularity === "hour"
      ? "Hourly buckets"
      : metrics.revenueBucketGranularity === "week"
        ? "7-day buckets"
        : "Daily buckets"

  const onExport = () => {
    const csv = buildAnalyticsCsv(metrics, timeRange)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    downloadCsv(csv, `admin-analytics-${timeRange}-${stamp}.csv`)
    toast({ title: "Export ready", description: "CSV file download started." })
  }

  const revenueChartData = metrics.revenueByPeriod.map((item, i) => ({
    ...item,
    i,
  }))

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Advanced Analytics"
        description="Comprehensive insights and performance metrics"
        icon={<BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as AnalyticsRange)}>
              <SelectTrigger className="w-full sm:w-32 bg-background border-border text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            <RefreshButton onClick={() => void fetchAnalytics()} loading={loading} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-primary/50 text-primary hover:bg-primary/10 text-xs sm:text-sm"
              onClick={onExport}
              disabled={loading || !!loadError}
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </>
        }
      />

      {loadError ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load analytics</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {showEmptyRangeHint ? (
        <Alert variant="default" className="border-border bg-muted/30">
          <Calendar className="size-4 text-muted-foreground" />
          <AlertTitle className="text-foreground">No activity in this range</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Revenue, trades, and active users are zero for the selected period. Try a longer range or
            verify data in the admin tools.
          </AlertDescription>
        </Alert>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6"
      >
        <MetricCard
          title="Total Revenue (credits)"
          value={formatRevenueCr(metrics.totalRevenue)}
          change={revenueGrowthUi?.text}
          trend={revenueGrowthUi?.trend}
          icon={DollarSign}
          color="text-green-400"
          description="Sum of CREDIT transactions in range"
          loading={loading}
        />
        <MetricCard
          title="Total Trades"
          value={metrics.totalTrades.toLocaleString()}
          icon={Activity}
          color="text-blue-400"
          description="Executed orders in range"
          loading={loading}
        />
        <MetricCard
          title="Active Users"
          value={metrics.activeUsers.toLocaleString()}
          change={userGrowthUi?.text}
          trend={userGrowthUi?.trend}
          icon={Users}
          color="text-purple-400"
          description="Headcount per active-user policy"
          loading={loading}
        />
        <MetricCard
          title="Avg Order Value"
          value={`₹${metrics.avgOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          icon={Target}
          color="text-yellow-400"
          description="Mean across sampled orders (up to 1000)"
          loading={loading}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <MetricCard
          title="KYC conversion"
          value={
            metrics.conversionRate === null ? "N/A" : `${metrics.conversionRate}%`
          }
          icon={TrendingUp}
          color="text-emerald-400"
          description="Approved KYC / signups in range"
          loading={loading}
        />
        <MetricCard
          title="Churn rate"
          value={metrics.churnRate === null ? "N/A" : `${metrics.churnRate}%`}
          icon={TrendingDown}
          color="text-red-400"
          description="Not yet defined — reserved"
          loading={loading}
        />
        <MetricCard
          title="User signups (Δ vs prior)"
          value={metrics.userGrowth === null ? "N/A" : `${metrics.userGrowth > 0 ? "+" : ""}${metrics.userGrowth}%`}
          icon={Users}
          color="text-blue-400"
          description="New users vs equal prior window"
          loading={loading}
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-primary shrink-0" />
                  Revenue trend
                </span>
                <span className="text-xs font-normal text-muted-foreground">{granularityLabel}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-h-[280px] w-full" aria-busy={loading}>
                {loading ? (
                  <div className="h-[280px] w-full rounded-md bg-muted/40 animate-pulse" />
                ) : revenueChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    No revenue buckets for this range.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                        tickFmatter={(v) =>
                          typeof v === "number"
                            ? `₹${(v / 1000).toFixed(0)}k`
                            : String(v)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number | undefined) =>
                          value !== undefined
                            ? [`₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, "Credits"]
                            : []
                        }
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Revenue">
                        {revenueChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={REVENUE_CHART_COL} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Top instruments (executed qty)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-muted/50 animate-pulse rounded" />
                  ))}
                </div>
              ) : metrics.tradingVolume.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No executed order volume in this range.
                </p>
              ) : (
                <div className="space-y-4">
                  {metrics.tradingVolume.map((item) => (
                    <div key={item.symbol} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{item.symbol}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {item.volume.toLocaleString("en-IN")} units
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(item.volume / volumeMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-primary" />
              Top performing users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : metrics.topPerformingUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No credit or trade activity in this range.
              </p>
            ) : (
              <div className="space-y-4">
                {metrics.topPerformingUsers.map((user, index) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                          {(() => {
                            const live = topPerformingLivePresence[user.id]
                            const on =
                              live !== undefined ? live : Boolean(user.isTradingDashboardOnline)
                            return on ? <TradingDashboardOnlineDot /> : null
                          })()}
                          {user.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{user.clientId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Credits (range)</p>
                        <p className="font-bold text-green-400 tabular-nums">
                          ₹{user.profit.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Trades</p>
                        <p className="font-bold text-foreground tabular-nums">{user.trades}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
