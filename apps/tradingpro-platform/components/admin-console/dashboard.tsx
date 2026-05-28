/**
 * File:        components/admin-console/dashboard.tsx
 * Module:      admin-console · Home Dashboard
 * Purpose:     Platform command center — urgency-first information hierarchy for admins
 *
 * Exports:
 *   - Dashboard() — main home tab component for /admin-console
 *
 * Depends on:
 *   - @/lib/hooks/use-admin-trading-presence-sse — SSE stream for top-trader live status
 *   - @/lib/admin/data-source — multi-source status derivation
 *   - @/lib/branding-routes — getAdminConsoleRoute for navigation chips
 *
 * Side-effects:
 *   - Polls /api/admin/stats, /api/admin/activity, /api/admin/alerts,
 *     /api/admin/top-traders, /api/admin/users every 30 s
 *
 * Key invariants:
 *   - No hardcoded percentage deltas; all sub-metrics derive from real API data
 *   - Currency is always ₹; mock data uses ₹ too
 *   - Pending-action chips only render when count > 0
 *   - System Alerts card only renders when alerts.length > 0
 *
 * Read order:
 *   1. KpiState, DashboardPending — data shapes
 *   2. PendingActionsBar, KpiCard — inline sub-components
 *   3. Dashboard — main component with fetch logic and layout
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Gauge,
  FileCheck,
  Clock,
  LayoutDashboard,
  XCircle,
  Wallet,
  Zap,
} from "lucide-react"
import { RefreshButton, StatusBadge, TradingDashboardOnlineDot } from "@/components/admin-console/shared"
import { TradingChart } from "./trading-chart"
import { UserActivityChart } from "./user-activity-chart"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useEffect, useMemo, useState } from "react"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"
import { toast } from "@/hooks/use-toast"
import { deriveDataSourceStatus, type DataSourceStatus } from "@/lib/admin/data-source"
import { getAdminConsoleRoute } from "@/lib/branding-routes"
import {
  LatestOnboardedInsightWidget,
  mapApiUserToLatestOnboarded,
  type LatestOnboardedDashboardUser,
} from "@/components/admin-console/dashboard-latest-onboarded-widgets"

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardPending {
  kyc: number
  deposits: number
  withdrawals: number
}

interface KpiState {
  users: { total: string; active: string; inactive: string }
  aum: { totalCr: string; availableCr: string; usedCr: string; marginPct: number }
  positions: { active: string; totalOrders: string }
  pending: DashboardPending
  kycFunnel: { approved: number; rejected: number; pending: number }
  tradingAccounts: number
  ordersToday: number
}

// ─── Mock / Fallback Data ────────────────────────────────────────────────────

const MOCK_KPI: KpiState = {
  users: { total: "12,847", active: "9,201", inactive: "3,646" },
  aum: { totalCr: "₹2.40Cr", availableCr: "₹1.80Cr", usedCr: "₹0.60Cr", marginPct: 25 },
  positions: { active: "1,234", totalOrders: "84,201" },
  pending: { kyc: 5, deposits: 3, withdrawals: 1 },
  kycFunnel: { approved: 1840, rejected: 42, pending: 5 },
  tradingAccounts: 12847,
  ordersToday: 312,
}

const MOCK_LATEST_ONBOARDED: LatestOnboardedDashboardUser[] = [
  {
    id: "sample-user-1",
    name: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    phone: "+919876543210",
    clientId: "MP-ACL-1001",
    kycStatus: "PENDING",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    emailVerified: new Date().toISOString(),
    phoneVerified: null,
    tradingAccount: { balance: 25000, availableMargin: 20000, usedMargin: 5000 },
    isTradingDashboardOnline: true,
  },
  {
    id: "sample-user-2",
    name: "Sneha Krishnan",
    email: "sneha.k@example.org",
    phone: "+919811122233",
    clientId: "MP-ACL-1002",
    kycStatus: "APPROVED",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    emailVerified: new Date().toISOString(),
    phoneVerified: new Date().toISOString(),
    tradingAccount: { balance: 500000, availableMargin: 480000, usedMargin: 20000 },
    isTradingDashboardOnline: false,
  },
  {
    id: "sample-user-3",
    name: "Rahul Verma",
    email: "rahul.v@example.net",
    phone: "+919900011122",
    clientId: "MP-ACL-1003",
    kycStatus: "NOT_SUBMITTED",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    emailVerified: null,
    phoneVerified: null,
    tradingAccount: null,
    isTradingDashboardOnline: false,
  },
]

const MOCK_RECENT_ACTIVITY = [
  {
    id: "1",
    user: "USR_001234",
    clientId: "USR_001234",
    action: "Fund Deposit",
    amount: "₹5,000",
    time: "2 min ago",
    status: "completed",
    type: "deposit",
  },
  {
    id: "2",
    user: "USR_005678",
    clientId: "USR_005678",
    action: "Withdrawal Request",
    amount: "₹2,500",
    time: "5 min ago",
    status: "pending",
    type: "withdrawal",
  },
]

// ─── Inline Sub-Components ───────────────────────────────────────────────────

function pendingChipClasses(color: "blue" | "yellow" | "orange" | "red") {
  switch (color) {
    case "blue":   return "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
    case "yellow": return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
    case "orange": return "bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
    case "red":    return "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
  }
}

function pendingDotClass(color: "blue" | "yellow" | "orange" | "red") {
  switch (color) {
    case "blue":   return "bg-blue-400"
    case "yellow": return "bg-yellow-400"
    case "orange": return "bg-orange-400"
    case "red":    return "bg-red-400"
  }
}

function PendingActionsBar({ pending, alertCount }: { pending: DashboardPending; alertCount: number }) {
  const chips = [
    { count: pending.kyc,         label: "KYC Reviews",    href: getAdminConsoleRoute("kyc"),   color: "blue"   as const },
    { count: pending.deposits,    label: "Deposits",        href: getAdminConsoleRoute("funds"),  color: "yellow" as const },
    { count: pending.withdrawals, label: "Withdrawals",     href: getAdminConsoleRoute("funds"),  color: "orange" as const },
    { count: alertCount,          label: "Risk Alerts",     href: getAdminConsoleRoute("risk"),   color: "red"    as const },
  ].filter((c) => c.count > 0)

  if (chips.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 w-fit">
        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-sm text-green-400 font-medium">All clear — no pending actions</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mr-1">
        Needs Attention
      </span>
      {chips.map((chip) => (
        <Link key={chip.label} href={chip.href}>
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-all hover:scale-105 ${pendingChipClasses(chip.color)}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${pendingDotClass(chip.color)}`} />
            {chip.count} {chip.label}
            <ChevronRight className="w-3 h-3 opacity-60" />
          </div>
        </Link>
      ))}
    </div>
  )
}

interface KpiCardProps {
  icon: React.ElementType
  iconClass: string
  borderAccentClass: string
  value: string
  label: string
  sub: string
  children?: React.ReactNode
}

function KpiCard({ icon: Icon, iconClass, borderAccentClass, value, label, sub, children }: KpiCardProps) {
  return (
    <Card className={`bg-card border-border shadow-sm ${borderAccentClass} overflow-hidden`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <Icon className={`h-4 w-4 flex-shrink-0 ${iconClass}`} />
        </div>
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-0.5">{value}</div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
        {children}
      </CardContent>
    </Card>
  )
}

interface SecondaryMetricItemProps {
  icon: React.ElementType
  iconClass: string
  value: string
  label: string
  sub: string
}

function SecondaryMetricItem({ icon: Icon, iconClass, value, label, sub }: SecondaryMetricItemProps) {
  return (
    <div className="flex items-center gap-3 px-3 sm:px-4">
      <Icon className={`h-4 w-4 flex-shrink-0 ${iconClass}`} />
      <div className="min-w-0">
        <p className="text-base sm:text-lg font-bold tracking-tight text-foreground tabular-nums leading-none">
          {value}
        </p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground/70 truncate">{sub}</p>
      </div>
    </div>
  )
}

function SecondaryMetricsStrip({ kpi }: { kpi: KpiState }) {
  const total = kpi.kycFunnel.approved + kpi.kycFunnel.rejected + kpi.kycFunnel.pending
  const rejectionRate = kpi.kycFunnel.approved + kpi.kycFunnel.rejected > 0
    ? Math.round((kpi.kycFunnel.rejected / (kpi.kycFunnel.approved + kpi.kycFunnel.rejected)) * 100)
    : 0

  return (
    <div className="bg-muted/30 rounded-xl border border-border/40 py-3 overflow-x-auto">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/40 min-w-[400px] sm:min-w-0">
        <SecondaryMetricItem
          icon={FileCheck}
          iconClass="text-emerald-400"
          value={kpi.kycFunnel.approved.toLocaleString()}
          label="KYC Approved"
          sub={`of ${total.toLocaleString()} submitted`}
        />
        <SecondaryMetricItem
          icon={XCircle}
          iconClass="text-red-400"
          value={kpi.kycFunnel.rejected.toLocaleString()}
          label="KYC Rejected"
          sub={`${rejectionRate}% rejection rate`}
        />
        <SecondaryMetricItem
          icon={Wallet}
          iconClass="text-blue-400"
          value={kpi.tradingAccounts.toLocaleString()}
          label="Trading Accounts"
          sub="registered platforms"
        />
        <SecondaryMetricItem
          icon={Zap}
          iconClass="text-amber-400"
          value={kpi.ordersToday.toLocaleString()}
          label="Executed Today"
          sub="orders in last 24 h"
        />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function Dashboard() {
  const [kpi, setKpi] = useState<KpiState | null>(null)
  const [recentActivity, setRecentActivity] = useState<typeof MOCK_RECENT_ACTIVITY>([])
  const [alerts, setAlerts] = useState<Array<{ id: string; type: string; message: string; time: string }>>([])
  const [topTraders, setTopTraders] = useState<
    Array<{
      id: string
      name: string
      clientId: string
      profit: number
      trades: number
      winRate: number
      isTradingDashboardOnline?: boolean
    }>
  >([])
  const [latestOnboardedUsers, setLatestOnboardedUsers] = useState<LatestOnboardedDashboardUser[]>([])
  const [useSampleData, setUseSampleData] = useState(false)
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus>("loading")
  const [dataSourceErrors, setDataSourceErrors] = useState<string[]>([])
  const [dataSourceSummary, setDataSourceSummary] = useState<{ okCount: number; total: number } | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const topTraderIds = useMemo(() => topTraders.map((t) => t.id), [topTraders])
  const topTraderLivePresence = useAdminTradingPresenceStream(topTraderIds, topTraders.length > 0 && !useSampleData)

  const getIstTimestamp = () =>
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

  const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null)
    return data?.error || data?.message || fallback
  }

  const formatCr = (rupees: number) => `₹${(rupees / 10_000_000).toFixed(2)}Cr`

  const fetchRealData = async () => {
    setLoading(true)
    setDataSourceStatus("loading")

    const statsResult    = { name: "Stats API",           ok: false, error: "" }
    const activityResult = { name: "Activity API",        ok: false, error: "" }
    const alertsResult   = { name: "Alerts API",          ok: false, error: "" }
    const tradersResult  = { name: "Top Traders API",     ok: false, error: "" }
    const onboardedResult = { name: "Latest onboarded API", ok: false, error: "" }

    try {
      const [statsResp, activityResp, alertsResp, tradersResp, onboardedResp] = await Promise.all([
        fetch("/api/admin/stats").catch((e) => { statsResult.error = e?.message || "Stats request failed"; return null }),
        fetch("/api/admin/activity?limit=20").catch((e) => { activityResult.error = e?.message || "Activity request failed"; return null }),
        fetch("/api/admin/alerts?limit=10").catch((e) => { alertsResult.error = e?.message || "Alerts request failed"; return null }),
        fetch("/api/admin/top-traders?limit=5").catch((e) => { tradersResult.error = e?.message || "Top traders request failed"; return null }),
        fetch("/api/admin/users?page=1&limit=8&role=USER").catch((e) => { onboardedResult.error = e?.message || "Latest onboarded request failed"; return null }),
      ])

      // Stats → KPI state
      if (statsResp?.ok) {
        const data = await statsResp.json()
        if (data.success && data.stats) {
          const s = data.stats
          const usedMargin = s.tradingAccounts.totalUsedMargin as number
          const availMargin = s.tradingAccounts.totalAvailableMargin as number
          const totalMargin = usedMargin + availMargin
          const marginPct = totalMargin > 0 ? Math.round((usedMargin / totalMargin) * 100) : 0

          setKpi({
            users: {
              total: (s.users.total as number).toLocaleString(),
              active: (s.users.active as number).toLocaleString(),
              inactive: (s.users.inactive as number).toLocaleString(),
            },
            aum: {
              totalCr: formatCr(s.tradingAccounts.totalBalance as number),
              availableCr: formatCr(availMargin),
              usedCr: formatCr(usedMargin),
              marginPct,
            },
            positions: {
              active: (s.trading.activePositions as number).toLocaleString(),
              totalOrders: (s.trading.totalOrders as number).toLocaleString(),
            },
            pending: {
              kyc: (s.pending.kyc as number) ?? 0,
              deposits: s.pending.deposits as number,
              withdrawals: s.pending.withdrawals as number,
            },
            kycFunnel: {
              approved: (s.kyc?.approved as number) ?? 0,
              rejected: (s.kyc?.rejected as number) ?? 0,
              pending: (s.kyc?.pending as number) ?? (s.pending.kyc as number) ?? 0,
            },
            tradingAccounts: (s.tradingAccounts.total as number) ?? 0,
            ordersToday: (s.trading.executedOrdersToday as number) ?? 0,
          })
          statsResult.ok = true
        }
      } else if (statsResp) {
        statsResult.error = await getResponseErrorMessage(statsResp, "Failed to load stats")
        setKpi(null)
      } else {
        setKpi(null)
      }

      // Activity
      if (activityResp?.ok) {
        const data = await activityResp.json()
        if (data.success && data.activities) {
          setRecentActivity(
            data.activities.slice(0, 8).map((a: any) => ({
              id: a.id,
              user: a.user,
              clientId: a.clientId,
              action: a.action,
              amount: `₹${(a.amount as number).toLocaleString()}`,
              time: getTimeAgo(new Date(a.timestamp)),
              status: (a.status as string).toLowerCase(),
              type: (a.type as string).toLowerCase(),
            }))
          )
          activityResult.ok = true
        }
      } else if (activityResp) {
        activityResult.error = await getResponseErrorMessage(activityResp, "Failed to load activity")
        setRecentActivity([])
      } else {
        setRecentActivity([])
      }

      // Alerts
      if (alertsResp?.ok) {
        const data = await alertsResp.json()
        if (data.success && data.alerts) {
          setAlerts(data.alerts)
          alertsResult.ok = true
        }
      } else if (alertsResp) {
        alertsResult.error = await getResponseErrorMessage(alertsResp, "Failed to load alerts")
        setAlerts([])
      } else {
        setAlerts([])
      }

      // Top traders
      if (tradersResp?.ok) {
        const data = await tradersResp.json()
        if (data.success && data.traders) {
          setTopTraders(data.traders)
          tradersResult.ok = true
        }
      } else if (tradersResp) {
        tradersResult.error = await getResponseErrorMessage(tradersResp, "Failed to load top traders")
        setTopTraders([])
      } else {
        setTopTraders([])
      }

      // Latest onboarded
      if (onboardedResp?.ok) {
        const data = await onboardedResp.json()
        if (Array.isArray(data.users)) {
          setLatestOnboardedUsers(
            data.users
              .map((row: unknown) => mapApiUserToLatestOnboarded(row))
              .filter((row: LatestOnboardedDashboardUser | null): row is LatestOnboardedDashboardUser => row !== null)
          )
          onboardedResult.ok = true
        } else {
          setLatestOnboardedUsers([])
          onboardedResult.error = "Invalid latest onboarded response"
        }
      } else if (onboardedResp) {
        onboardedResult.error = await getResponseErrorMessage(onboardedResp, "Failed to load latest onboarded users")
        setLatestOnboardedUsers([])
      } else {
        setLatestOnboardedUsers([])
      }

      const summary = deriveDataSourceStatus([statsResult, activityResult, alertsResult, tradersResult, onboardedResult])
      setDataSourceStatus(summary.status)
      setDataSourceErrors(summary.errors)
      setDataSourceSummary({ okCount: summary.okCount, total: summary.total })
      setLastUpdatedAt(getIstTimestamp())
    } catch (error: any) {
      setKpi(null)
      setRecentActivity([])
      setAlerts([])
      setTopTraders([])
      setLatestOnboardedUsers([])
      setDataSourceStatus("error")
      setDataSourceErrors([error?.message || "Unable to fetch dashboard data"])
      setDataSourceSummary({ okCount: 0, total: 5 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (useSampleData) return
    fetchRealData()
    const interval = setInterval(fetchRealData, 30_000)
    return () => clearInterval(interval)
  }, [useSampleData])

  const handleUseSampleData = () => {
    setUseSampleData(true)
    setLoading(false)
    setKpi(MOCK_KPI)
    setRecentActivity(MOCK_RECENT_ACTIVITY)
    setAlerts([])
    setTopTraders([])
    setLatestOnboardedUsers(MOCK_LATEST_ONBOARDED)
    setDataSourceStatus("sample")
    setDataSourceErrors([])
    setDataSourceSummary({ okCount: 0, total: 5 })
    setLastUpdatedAt(getIstTimestamp())
    toast({ title: "Sample data loaded", description: "Dashboard is now showing sample data." })
  }

  const handleUseLiveData = () => setUseSampleData(false)

  function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const dataBadge = (() => {
    if (dataSourceStatus === "live")    return { status: "SUCCESS", label: "Live" }
    if (dataSourceStatus === "partial") {
      const suffix = dataSourceSummary ? ` ${dataSourceSummary.okCount}/${dataSourceSummary.total}` : ""
      return { status: "WARNING", label: `Partial${suffix}` }
    }
    if (dataSourceStatus === "error")  return { status: "ERROR",   label: "Error" }
    if (dataSourceStatus === "sample") return { status: "INFO",    label: "Sample" }
    return { status: "PENDING", label: "Loading" }
  })()

  const marginBarColor = (pct: number) => {
    if (pct >= 85) return "bg-red-400"
    if (pct >= 70) return "bg-orange-400"
    return "bg-emerald-400"
  }

  const activityStatusClasses = (status: string) => {
    const s = status.toLowerCase()
    if (s === "completed") return { dot: "bg-green-400", badge: "bg-green-400/20 text-green-400" }
    if (s === "pending")   return { dot: "bg-yellow-400", badge: "bg-yellow-400/20 text-yellow-400" }
    if (s === "alert")     return { dot: "bg-red-400", badge: "bg-red-400/20 text-red-400" }
    return { dot: "bg-blue-400", badge: "bg-blue-400/20 text-blue-400" }
  }

  return (
    <div className="space-y-4 md:space-y-5">

      {/* ── Data source error banners ─────────────────────────────── */}
      {dataSourceStatus === "error" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <AlertTitle className="text-red-500 text-sm">Live data unavailable</AlertTitle>
          <AlertDescription className="text-red-400 text-xs space-y-2">
            {dataSourceErrors.map((msg) => <p key={msg}>{msg}</p>)}
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={fetchRealData} disabled={loading}>Retry</Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleUseSampleData}>Use Sample Data</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "partial" && (
        <Alert className="bg-yellow-500/10 border-yellow-500/50">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <AlertTitle className="text-yellow-500 text-sm">Partial data loaded</AlertTitle>
          <AlertDescription className="text-yellow-500/80 text-xs space-y-2">
            {dataSourceErrors.map((msg) => <p key={msg}>{msg}</p>)}
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={fetchRealData} disabled={loading}>Retry</Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleUseSampleData}>Use Sample Data</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "sample" && (
        <Alert className="bg-blue-500/10 border-blue-500/50">
          <Activity className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <AlertTitle className="text-blue-500 text-sm">Sample data mode</AlertTitle>
          <AlertDescription className="text-blue-500/80 text-xs space-y-2">
            <p>Sample data is active. Admin actions require live data.</p>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleUseLiveData}>Use Live Data</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Compact command header ────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <LayoutDashboard className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-tight">
              Platform Command Center
            </h1>
            {lastUpdatedAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Updated {lastUpdatedAt}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={dataBadge.status} type="general">{dataBadge.label}</StatusBadge>
          {!useSampleData && (
            <Button variant="ghost" size="sm" onClick={handleUseSampleData} className="text-xs text-muted-foreground h-7 px-2">
              Sample
            </Button>
          )}
          <RefreshButton onClick={() => (useSampleData ? handleUseLiveData() : fetchRealData())} loading={loading} />
        </div>
      </div>

      {/* ── Pending actions bar ───────────────────────────────────── */}
      {kpi && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <PendingActionsBar pending={kpi.pending} alertCount={alerts.length} />
        </motion.div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      {loading && !kpi ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-card border-border shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="h-4 w-4 bg-muted animate-pulse rounded mb-3" />
                <div className="h-8 w-28 bg-muted animate-pulse rounded mb-1.5" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded mb-1" />
                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpi ? (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          {/* Users */}
          <KpiCard
            icon={Users}
            iconClass="text-blue-400"
            borderAccentClass="border-l-2 border-l-blue-500"
            value={kpi.users.total}
            label="Platform Users"
            sub={`${kpi.users.active} active · ${kpi.users.inactive} inactive`}
          />

          {/* AUM */}
          <KpiCard
            icon={DollarSign}
            iconClass="text-emerald-400"
            borderAccentClass="border-l-2 border-l-emerald-500"
            value={kpi.aum.totalCr}
            label="Assets Under Management"
            sub={`${kpi.aum.availableCr} available · ${kpi.aum.usedCr} deployed`}
          />

          {/* Active Positions */}
          <KpiCard
            icon={TrendingUp}
            iconClass="text-amber-400"
            borderAccentClass="border-l-2 border-l-amber-500"
            value={kpi.positions.active}
            label="Live Positions"
            sub={`${kpi.positions.totalOrders} lifetime orders`}
          />

          {/* Margin Utilization */}
          <KpiCard
            icon={Gauge}
            iconClass={kpi.aum.marginPct >= 85 ? "text-red-400" : kpi.aum.marginPct >= 70 ? "text-orange-400" : "text-purple-400"}
            borderAccentClass={`border-l-2 ${kpi.aum.marginPct >= 85 ? "border-l-red-500" : kpi.aum.marginPct >= 70 ? "border-l-orange-500" : "border-l-purple-500"}`}
            value={`${kpi.aum.marginPct}%`}
            label="Margin Utilization"
            sub={`${kpi.aum.usedCr} of ${kpi.aum.totalCr} deployed`}
          >
            <div className="mt-3">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${marginBarColor(kpi.aum.marginPct)}`}
                  style={{ width: `${kpi.aum.marginPct}%` }}
                />
              </div>
            </div>
          </KpiCard>
        </motion.div>
      ) : null}

      {/* ── Secondary metrics strip ──────────────────────────────── */}
      {kpi && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <SecondaryMetricsStrip kpi={kpi} />
        </motion.div>
      )}

      {/* ── Activity feed + right sidebar ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* Recent Activity (2/3) */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Card className="bg-card border-border shadow-sm h-full">
            <CardHeader className="px-4 sm:px-5 pt-4 pb-3">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-5 pb-4">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recentActivity.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No recent activity</p>
                ) : (
                  recentActivity.map((activity, index) => {
                    const cls = activityStatusClasses(activity.status)
                    return (
                      <motion.div
                        key={activity.id}
                        className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg border border-border/40 hover:border-border transition-colors gap-3"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.04 }}
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cls.dot}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{activity.action}</p>
                            <p className="text-xs text-muted-foreground truncate">{activity.clientId || activity.user}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{activity.amount}</p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md ${cls.badge}`}>{activity.status}</span>
                            <span className="text-xs text-muted-foreground">{activity.time}</span>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right sidebar (1/3) */}
        <div className="space-y-3 sm:space-y-4">

          {/* System Alerts — only when there are alerts */}
          {alerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Card className="bg-card border-border shadow-sm border-l-2 border-l-red-500">
                <CardHeader className="px-4 sm:px-5 pt-4 pb-3">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    System Alerts
                    <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                      {alerts.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-5 pb-4">
                  <div className="space-y-2">
                    {alerts.map((alert, index) => (
                      <motion.div
                        key={alert.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          alert.type === "error"
                            ? "bg-red-400/8 border-red-400/20"
                            : alert.type === "warning"
                            ? "bg-yellow-400/8 border-yellow-400/20"
                            : "bg-blue-400/8 border-blue-400/20"
                        }`}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.08 }}
                      >
                        <p className="font-medium text-foreground break-words">{alert.message}</p>
                        <p className="text-muted-foreground mt-0.5">{alert.time}</p>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Top Traders */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="px-4 sm:px-5 pt-4 pb-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  Top Traders
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-5 pb-4">
                <div className="space-y-2">
                  {topTraders.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No trader data available</p>
                  ) : (
                    topTraders.map((trader, index) => (
                      <motion.div
                        key={trader.id}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded-lg gap-2"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.04 }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                            {(() => {
                              const live = topTraderLivePresence[trader.id]
                              const on = live !== undefined ? live : Boolean(trader.isTradingDashboardOnline)
                              return on ? <TradingDashboardOnlineDot /> : null
                            })()}
                            <span className="truncate">{trader.name}</span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{trader.clientId}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-emerald-400">₹{trader.profit.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">{trader.trades}t · {trader.winRate}%W</p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ── Latest onboarded ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <LatestOnboardedInsightWidget
          users={latestOnboardedUsers}
          loading={loading && !useSampleData}
          kycSummary={kpi?.kycFunnel}
        />
      </motion.div>

      {/* ── Charts (trending context, below the fold) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
        >
          <TradingChart />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <UserActivityChart />
        </motion.div>
      </div>

    </div>
  )
}
