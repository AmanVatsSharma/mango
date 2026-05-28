/**
 * File:        components/admin-console/risk-management/exposure-tab.tsx
 * Module:      Admin Console · Risk Management · Live Exposure
 * Purpose:     Auto-refreshing live exposure dashboard with bulk liquidation controls.
 *
 * Exports:
 *   - ExposureTab({ refreshKey }) — live risk exposure table with KPI cards and bulk actions
 *
 * Depends on:
 *   - @/lib/utils/format-ist — IST date/time formatting for "Last Refreshed" display
 *   - /api/admin/risk/exposure-preview — live exposure data (single endpoint, no parallel fetch)
 *   - /api/admin/risk/liquidate-account — per-account and bulk liquidation
 *
 * Side-effects:
 *   - HTTP GET /api/admin/risk/exposure-preview on mount, external refreshKey, and auto-refresh tick
 *   - HTTP POST /api/admin/risk/liquidate-account on liquidation actions
 *   - document visibilitychange listener to pause/resume auto-refresh
 *
 * Key invariants:
 *   - Auto-refresh pauses automatically when the browser tab is hidden (visibilitychange);
 *     hiddenRef is separate from the user-toggle pausedRef to avoid clobbering user intent
 *   - Every fetch in loadExposure is cancelled via AbortController on cleanup / re-call
 *   - Promise.allSettled: n/a — this tab fetches a single endpoint; no parallel fetch to handle
 *   - refreshKey prop from parent triggers an immediate reload
 *
 * Read order:
 *   1. ExposureTab — state and effects
 *   2. loadExposure — fetch + abort logic
 *   3. handleBulkLiquidate — bulk action handler
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatIstDateTime } from "@/lib/utils/format-ist"
import type { ExposurePreviewResponse, ExposurePreviewRow } from "./risk-types"
import { PnlModeBadge } from "./pnl-mode-badge"

const REFRESH_INTERVAL_SEC = 30

type SortField = "lossUtilizationPercent" | "totalFunds" | "totalUnrealizedPnL" | "openPositions"
type SortDir = "asc" | "desc"

function SortIcon({
  field,
  active,
  dir,
}: {
  field: SortField
  active: SortField | null
  dir: SortDir
}) {
  if (active !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 inline opacity-40" />
  if (dir === "asc") return <ChevronUp className="w-3 h-3 ml-1 inline text-primary" />
  return <ChevronDown className="w-3 h-3 ml-1 inline text-primary" />
}

function KpiCard({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  loading: boolean
}) {
  return (
    <Card className="bg-card border-border shadow-sm neon-border">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            )}
          </div>
          <div className={`flex-shrink-0 ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ExposureTabProps {
  refreshKey: number
}

export function ExposureTab({ refreshKey }: ExposureTabProps) {
  const [exposure, setExposure] = useState<ExposurePreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL_SEC)
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage] = useState(0)
  const [liquidatingId, setLiquidatingId] = useState<string | null>(null)
  const [bulkDialog, setBulkDialog] = useState<{ scope: "losers_only" | "all_open" } | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [singleCloseAllTarget, setSingleCloseAllTarget] = useState<{ tradingAccountId: string; userName: string } | null>(null)
  const [pnlBannerDismissed, setPnlBannerDismissed] = useState<boolean>(() => {
    if (typeof sessionStorage === "undefined") return true
    return sessionStorage.getItem("risk_pnl_banner_dismissed") === "1"
  })

  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  /** Tracks whether the browser tab is hidden — kept separate from user-toggle pausedRef */
  const hiddenRef = useRef(false)

  /** Ref to the current in-flight AbortController so we can cancel on re-call or unmount */
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadExposure = useCallback(async () => {
    // Cancel any in-flight request before starting a new one
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    try {
      const res = await fetch("/api/admin/risk/exposure-preview?limit=150", {
        signal: controller.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Failed to load exposure")
      }
      const data = (await res.json()) as ExposurePreviewResponse
      setExposure(data)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return
      const message = error instanceof Error ? error.message : "Failed to load exposure"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount and on external refreshKey change
  useEffect(() => {
    void loadExposure()
    setSecondsLeft(REFRESH_INTERVAL_SEC)
  }, [loadExposure, refreshKey])

  // Pause auto-refresh when the browser tab is hidden; resume + immediate refresh when visible
  useEffect(() => {
    const onVisibility = () => {
      hiddenRef.current = document.visibilityState === "hidden"
      if (!hiddenRef.current) {
        void loadExposure()
        setSecondsLeft(REFRESH_INTERVAL_SEC)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [loadExposure])

  // Cancel any pending request on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [])

  // Auto-refresh countdown
  useEffect(() => {
    if (paused) return
    const tick = setInterval(() => {
      if (hiddenRef.current) return
      setSecondsLeft((s) => {
        if (s <= 1) {
          void loadExposure()
          return REFRESH_INTERVAL_SEC
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [paused, loadExposure])

  // Reset page when search changes
  useEffect(() => {
    setPage(0)
  }, [search, pageSize])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
    setPage(0)
  }

  const sortedRows = useMemo<ExposurePreviewRow[]>(() => {
    if (!exposure?.rows) return []
    const rows = [...exposure.rows]
    if (!sortField) {
      return rows.sort((a, b) => {
        if (a.wouldAutoClose !== b.wouldAutoClose) return a.wouldAutoClose ? -1 : 1
        if (a.wouldWarn !== b.wouldWarn) return a.wouldWarn ? -1 : 1
        return b.lossUtilizationPercent - a.lossUtilizationPercent
      })
    }
    return rows.sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1
      return (a[sortField] - b[sortField]) * mult
    })
  }, [exposure?.rows, sortField, sortDir])

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return sortedRows
    return sortedRows.filter(
      (r) =>
        r.userName.toLowerCase().includes(needle) ||
        (r.clientId ?? "").toLowerCase().includes(needle) ||
        r.userId.toLowerCase().includes(needle),
    )
  }, [sortedRows, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize)

  const warningCount = exposure?.rows.filter((r) => r.wouldWarn && !r.wouldAutoClose).length ?? 0
  const autoCloseCount = exposure?.rows.filter((r) => r.wouldAutoClose).length ?? 0
  const totalCount = exposure?.rows.length ?? 0

  const allPageSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selected.has(r.tradingAccountId))
  const somePageSelected = paginatedRows.some((r) => selected.has(r.tradingAccountId))

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        paginatedRows.forEach((r) => next.delete(r.tradingAccountId))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        paginatedRows.forEach((r) => next.add(r.tradingAccountId))
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const liquidateSingle = async (tradingAccountId: string, scope: "losers_only" | "all_open") => {
    setLiquidatingId(tradingAccountId)
    try {
      const res = await fetch("/api/admin/risk/liquidate-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradingAccountId, scope }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Liquidation failed")
      }
      const data = (await res.json()) as { closed?: number; attempted?: number; errors?: string[] }
      toast({
        title: "Liquidation complete",
        description: `Closed ${data.closed ?? 0} / ${data.attempted ?? 0} positions.${(data.errors?.length ?? 0) > 0 ? " Some errors — check logs." : ""}`,
      })
      void loadExposure()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Liquidation failed"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLiquidatingId(null)
    }
  }

  const handleBulkLiquidate = async () => {
    if (!bulkDialog) return
    setBulkLoading(true)
    const ids = Array.from(selected)
    let totalClosed = 0
    let totalAttempted = 0
    for (const tradingAccountId of ids) {
      try {
        const res = await fetch("/api/admin/risk/liquidate-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradingAccountId, scope: bulkDialog.scope }),
        })
        if (res.ok) {
          const data = (await res.json()) as { closed?: number; attempted?: number }
          totalClosed += data.closed ?? 0
          totalAttempted += data.attempted ?? 0
        }
      } catch {
        // continue with remaining accounts
      }
    }
    toast({
      title: "Bulk liquidation complete",
      description: `Closed ${totalClosed} / ${totalAttempted} positions across ${ids.length} account${ids.length !== 1 ? "s" : ""}.`,
    })
    setSelected(new Set())
    setBulkDialog(null)
    void loadExposure()
    setBulkLoading(false)
  }

  const dismissPnlBanner = () => {
    sessionStorage.setItem("risk_pnl_banner_dismissed", "1")
    setPnlBannerDismissed(true)
  }

  const showPnlBanner = !pnlBannerDismissed && new Date() < new Date("2026-04-27T00:00:00+05:30")

  const lastRefreshedLabel = formatIstDateTime(exposure?.generatedAt ?? null)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* P&L upgrade banner */}
      {showPnlBanner && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
          <span>
            P&amp;L now uses live market ladder (matches Positions tab).
            {" "}Use <code className="font-mono text-xs">?pnl=legacy</code> to revert temporarily (expires 2026-04-27).
          </span>
          <button
            type="button"
            className="flex-shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 font-medium leading-none"
            aria-label="Dismiss banner"
            onClick={dismissPnlBanner}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="Accounts Scanned"
          value={totalCount}
          icon={<Users className="w-7 h-7" />}
          color="text-foreground"
          loading={loading && !exposure}
        />
        <KpiCard
          label="In Warning Zone"
          value={warningCount}
          icon={<AlertTriangle className="w-7 h-7" />}
          color={warningCount > 0 ? "text-amber-400" : "text-muted-foreground"}
          loading={loading && !exposure}
        />
        <KpiCard
          label="In Auto-Close Zone"
          value={autoCloseCount}
          icon={<ShieldAlert className="w-7 h-7" />}
          color={autoCloseCount > 0 ? "text-red-400" : "text-muted-foreground"}
          loading={loading && !exposure}
        />
        <KpiCard
          label="Last Refreshed"
          value={lastRefreshedLabel}
          icon={<Activity className="w-7 h-7" />}
          color="text-muted-foreground"
          loading={loading && !exposure}
        />
      </div>

      {/* Toolbar */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex-1 min-w-0">
              <Input
                placeholder="Search by name, client ID, user ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-background border-border h-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Countdown pill */}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border ${
                  paused
                    ? "bg-muted text-muted-foreground border-border"
                    : secondsLeft <= 5
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-primary/10 text-primary border-primary/30"
                }`}
              >
                <Activity className="w-3 h-3" />
                {paused ? "Paused" : `${secondsLeft}s`}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3"
                onClick={() => setPaused((p) => !p)}
                title={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
              >
                {paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  void loadExposure()
                  setSecondsLeft(REFRESH_INTERVAL_SEC)
                }}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>

              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v))
                  setPage(0)
                }}
              >
                <SelectTrigger className="w-[80px] h-9 bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {exposure?.note && (
            <p className="text-xs text-muted-foreground mt-2 italic">{exposure.note}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Uses live market ladder (matches Positions tab). Shows who would be in warning vs auto-close bands and data gaps that can block square-off.
          </p>
        </CardContent>
      </Card>

      {/* Exposure Table */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Risk Exposure
              {filteredRows.length !== totalCount && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  ({filteredRows.length} of {totalCount})
                </span>
              )}
            </CardTitle>
            {filteredRows.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/40" />
                  Warning
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40" />
                  Auto-close
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading && !exposure ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="w-10 px-4">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all on this page"
                          data-state={somePageSelected && !allPageSelected ? "indeterminate" : undefined}
                        />
                      </TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center hover:text-foreground transition-colors"
                          onClick={() => handleSort("totalFunds")}
                        >
                          Funds <SortIcon field="totalFunds" active={sortField} dir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center hover:text-foreground transition-colors"
                          onClick={() => handleSort("totalUnrealizedPnL")}
                        >
                          Unrl. PnL <SortIcon field="totalUnrealizedPnL" active={sortField} dir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>P&amp;L Mode</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center hover:text-foreground transition-colors"
                          onClick={() => handleSort("lossUtilizationPercent")}
                        >
                          Loss Util. <SortIcon field="lossUtilizationPercent" active={sortField} dir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center hover:text-foreground transition-colors"
                          onClick={() => handleSort("openPositions")}
                        >
                          Positions <SortIcon field="openPositions" active={sortField} dir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          {exposure
                            ? search
                              ? "No accounts match your search."
                              : "No accounts with open risk positions."
                            : "Click Refresh to load risk exposure data."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((row) => {
                        const rowClass = row.wouldAutoClose
                          ? "bg-red-500/8 hover:bg-red-500/12"
                          : row.wouldWarn
                            ? "bg-amber-500/8 hover:bg-amber-500/12"
                            : "hover:bg-muted/30"
                        return (
                          <TableRow key={row.tradingAccountId} className={`border-border ${rowClass}`}>
                            <TableCell className="px-4">
                              <Checkbox
                                checked={selected.has(row.tradingAccountId)}
                                onCheckedChange={() => toggleSelect(row.tradingAccountId)}
                                aria-label={`Select ${row.userName}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm text-foreground">{row.userName}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {row.clientId ?? row.userId.slice(0, 8)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums text-sm">
                              ₹{row.totalFunds.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell
                              className={`tabular-nums text-sm font-medium ${row.totalUnrealizedPnL < 0 ? "text-red-400" : row.totalUnrealizedPnL > 0 ? "text-green-400" : "text-muted-foreground"}`}
                            >
                              {row.totalUnrealizedPnL >= 0 ? "+" : ""}
                              {row.totalUnrealizedPnL.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <PnlModeBadge mode={row.pnlMode} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      row.wouldAutoClose
                                        ? "bg-red-400"
                                        : row.wouldWarn
                                          ? "bg-amber-400"
                                          : "bg-green-400"
                                    }`}
                                    style={{
                                      width: `${Math.min(100, row.lossUtilizationPercent * 100).toFixed(1)}%`,
                                    }}
                                  />
                                </div>
                                <span
                                  className={`text-sm font-mono font-semibold tabular-nums ${
                                    row.wouldAutoClose
                                      ? "text-red-400"
                                      : row.wouldWarn
                                        ? "text-amber-400"
                                        : "text-foreground"
                                  }`}
                                >
                                  {(row.lossUtilizationPercent * 100).toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">{row.openPositions}</TableCell>
                            <TableCell>
                              {row.wouldAutoClose ? (
                                <Badge variant="destructive" className="text-xs">Auto-close</Badge>
                              ) : row.wouldWarn ? (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Warning</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground">Safe</Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[160px]">
                              {row.skipReasons.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-amber-400 underline decoration-dotted cursor-help">
                                      {row.skipReasons.length} issue{row.skipReasons.length !== 1 ? "s" : ""}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    {row.skipReasons.join(" • ")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px] px-2"
                                  disabled={liquidatingId === row.tradingAccountId}
                                  onClick={() => void liquidateSingle(row.tradingAccountId, "losers_only")}
                                >
                                  {liquidatingId === row.tradingAccountId ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    "Close losers"
                                  )}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-[11px] px-2"
                                  disabled={liquidatingId === row.tradingAccountId}
                                  onClick={() =>
                                    setSingleCloseAllTarget({ tradingAccountId: row.tradingAccountId, userName: row.userName })
                                  }
                                >
                                  Close all
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} — {filteredRows.length} row{filteredRows.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-5 py-3 text-sm font-medium">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-foreground">
            {selected.size} account{selected.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setBulkDialog({ scope: "losers_only" })}
          >
            Close losers
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => setBulkDialog({ scope: "all_open" })}
          >
            Liquidate all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Single account "Close all" confirmation */}
      <Dialog open={!!singleCloseAllTarget} onOpenChange={(open) => { if (!open) setSingleCloseAllTarget(null) }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Close all positions?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will close every open position for{" "}
            <span className="font-semibold text-foreground">{singleCloseAllTarget?.userName}</span>. This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setSingleCloseAllTarget(null)} disabled={!!liquidatingId}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!liquidatingId}
              onClick={async () => {
                if (!singleCloseAllTarget) return
                const target = singleCloseAllTarget
                setSingleCloseAllTarget(null)
                await liquidateSingle(target.tradingAccountId, "all_open")
              }}
            >
              {liquidatingId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Close all positions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk confirmation dialog */}
      <Dialog open={!!bulkDialog} onOpenChange={(open) => { if (!open) setBulkDialog(null) }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {bulkDialog?.scope === "all_open" ? "Liquidate all positions?" : "Close losing positions?"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {bulkDialog?.scope === "all_open"
                ? `This will close every open position for ${selected.size > 0 ? `${selected.size} selected account${selected.size !== 1 ? "s" : ""}` : "this account"}. This action cannot be undone.`
                : `This will close all losing positions for ${selected.size > 0 ? `${selected.size} selected account${selected.size !== 1 ? "s" : ""}` : "this account"}.`}
            </p>
            {selected.size > 0 && (
              <div className="bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                {Array.from(selected).map((id) => {
                  const row = exposure?.rows.find((r) => r.tradingAccountId === id)
                  return (
                    <p key={id} className="text-xs text-foreground font-mono">
                      {row ? `${row.userName} (${(row.lossUtilizationPercent * 100).toFixed(1)}% loss util.)` : id.slice(0, 16) + "…"}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button
              variant={bulkDialog?.scope === "all_open" ? "destructive" : "default"}
              onClick={() => void handleBulkLiquidate()}
              disabled={bulkLoading}
            >
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {bulkDialog?.scope === "all_open" ? "Liquidate all" : "Close losers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
