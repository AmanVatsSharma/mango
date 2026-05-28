"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

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
 * File:        components/admin-console/financial-overview.tsx
 * Module:      admin-console · Financial Overview
 * Purpose:     Super-admin financial audit: deposit and withdrawal approval/rejection trails
 *              with date-range totals strip and branded PDF/CSV export.
 *
 * Exports:
 *   - FinancialOverview()  — the main component rendered on the Financial Overview tab
 *
 * Depends on:
 *   - @/components/admin-console/financial-export-modal — export dialog
 *   - /api/super-admin/deposits/audit                  — deposit audit trail
 *   - /api/super-admin/withdrawals/audit               — withdrawal audit trail
 *   - /api/super-admin/finance/summary                 — totals for the active date range
 *
 * Side-effects:
 *   - Fetches audit data on tab change and filter apply
 *   - Fetches summary totals when date filters are active
 *
 * Key invariants:
 *   - Totals strip only renders when at least one date filter (from or to) is active
 *   - Export modal forwards the active filters verbatim to the export utils
 *
 * Read order:
 *   1. TotalsStrip — the date-range summary KPI bar
 *   2. FinancialOverview — main component
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FilterX, Search, DollarSign, Download, TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react"
import { PageHeader, RefreshButton, Pagination } from "./shared"
import { FinancialExportModal } from "./financial-export-modal"
import type { FinancialSummaryData } from "./financial-export-utils"

type TrailTab = "deposits" | "withdrawals"

type AuditStatus = "APPROVED" | "REJECTED"

interface AuditUser {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
}

interface DepositAuditRecord {
  id: string
  depositId: string | null
  status: AuditStatus
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  remarks: string | null
  user?: AuditUser
  createdAt: string
}

interface WithdrawalAuditRecord {
  id: string
  withdrawalId: string | null
  status: AuditStatus
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  bankReference: string | null
  beneficiaryMask: string | null
  remarks: string | null
  user?: AuditUser
  createdAt: string
}

interface FilterState {
  status: "ALL" | AuditStatus
  search: string
  adminId: string
  adminName: string
  from: string
  to: string
}

const DEPOSIT_STATUS_OPTIONS: { label: string; value: FilterState["status"] }[] = [
  { value: "ALL", label: "All actions" },
  { value: "APPROVED", label: "Approved deposits" },
  { value: "REJECTED", label: "Rejected deposits" },
]

const WITHDRAWAL_STATUS_OPTIONS: { label: string; value: FilterState["status"] }[] = [
  { value: "ALL", label: "All actions" },
  { value: "APPROVED", label: "Approved withdrawals" },
  { value: "REJECTED", label: "Rejected withdrawals" },
]

const formatCurrency = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value)
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", { hour12: false })
}

const initialFilters: FilterState = {
  status: "ALL",
  search: "",
  adminId: "",
  adminName: "",
  from: "",
  to: "",
}

function buildQueryParams(filters: FilterState, page: number, pageSize: number) {
  const params = new URLSearchParams()
  if (filters.status !== "ALL") params.set("status", filters.status)
  if (filters.search) params.set("search", filters.search.trim())
  if (filters.adminId) params.set("adminId", filters.adminId.trim())
  if (filters.adminName) params.set("adminName", filters.adminName.trim())
  if (filters.from) {
    const fromDate = new Date(`${filters.from}T00:00:00Z`)
    if (!Number.isNaN(fromDate.getTime())) {
      params.set("from", fromDate.toISOString())
    }
  }
  if (filters.to) {
    const toDate = new Date(`${filters.to}T23:59:59Z`)
    if (!Number.isNaN(toDate.getTime())) {
      params.set("to", toDate.toISOString())
    }
  }
  params.set("page", String(page))
  params.set("pageSize", String(pageSize))
  return params
}

// ─── Totals strip sub-component ───────────────────────────────────────────────

interface TotalsStripProps {
  summary: FinancialSummaryData | null
  loading: boolean
  dateFrom: string
  dateTo: string
}

function TotalsStrip({ summary, loading, dateFrom, dateTo }: TotalsStripProps) {
  const hasDateFilter = Boolean(dateFrom || dateTo)

  if (!hasDateFilter) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
        Set a date range to see totals for the selected period.
      </div>
    )
  }

  const fmt = (v: number | undefined) => {
    if (v === undefined) return "—"
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v)
  }

  const net = summary?.netFlow ?? 0
  const netPositive = net >= 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card className="border-green-500/20 bg-green-50/30 shadow-none dark:bg-green-950/10">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10">
            <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total Deposits In
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-green-700 dark:text-green-400">
              {loading ? <span className="text-muted-foreground">…</span> : fmt(summary?.totalDeposits)}
            </p>
            <p className="text-[10px] text-muted-foreground">completed · in period</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-500/20 bg-red-50/30 shadow-none dark:bg-red-950/10">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
            <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total Withdrawals Out
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-red-700 dark:text-red-400">
              {loading ? <span className="text-muted-foreground">…</span> : fmt(summary?.totalWithdrawals)}
            </p>
            <p className="text-[10px] text-muted-foreground">completed · in period</p>
          </div>
        </CardContent>
      </Card>

      <Card
        className={
          netPositive
            ? "border-blue-500/20 bg-blue-50/30 shadow-none dark:bg-blue-950/10"
            : "border-orange-500/20 bg-orange-50/30 shadow-none dark:bg-orange-950/10"
        }
      >
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${netPositive ? "bg-blue-500/10" : "bg-orange-500/10"}`}
          >
            <ArrowLeftRight
              className={`h-4 w-4 ${netPositive ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Net Flow (In − Out)
            </p>
            <p
              className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${netPositive ? "text-blue-700 dark:text-blue-400" : "text-orange-700 dark:text-orange-400"}`}
            >
              {loading ? <span className="text-muted-foreground">…</span> : fmt(summary?.netFlow)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {summary
                ? `${summary.pendingDeposits} pending dep · ${summary.pendingWithdrawals} pending wd`
                : "loading…"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function FinancialOverview() {
  const [tab, setTab] = useState<TrailTab>("deposits")
  const [pageSize] = useState(20)

  const [depFilters, setDepFilters] = useState<FilterState>(initialFilters)
  const [depPage, setDepPage] = useState(1)
  const [depRecords, setDepRecords] = useState<DepositAuditRecord[]>([])
  const [depTotal, setDepTotal] = useState(0)
  const [depLoading, setDepLoading] = useState(false)
  const [depError, setDepError] = useState<string | null>(null)

  const [wdFilters, setWdFilters] = useState<FilterState>(initialFilters)
  const [wdPage, setWdPage] = useState(1)
  const [wdRecords, setWdRecords] = useState<WithdrawalAuditRecord[]>([])
  const [wdTotal, setWdTotal] = useState(0)
  const [wdLoading, setWdLoading] = useState(false)
  const [wdError, setWdError] = useState<string | null>(null)

  // Totals strip state
  const [summary, setSummary] = useState<FinancialSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false)

  const depTotalPages = useMemo(() => Math.max(1, Math.ceil(depTotal / pageSize)), [depTotal, pageSize])
  const wdTotalPages = useMemo(() => Math.max(1, Math.ceil(wdTotal / pageSize)), [wdTotal, pageSize])

  const fetchDeposits = useCallback(async () => {
    const params = buildQueryParams(depFilters, depPage, pageSize)
    setDepLoading(true)
    setDepError(null)
    try {
      const res = await fetch(`/api/super-admin/deposits/audit?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Failed to fetch deposit audit")
      }
      const payload = await res.json()
      const data = payload?.data
      if (!data) throw new Error("Malformed response from deposit audit API")
      setDepRecords(data.records || [])
      setDepTotal(data.total || 0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error while fetching deposit audit"
      setDepError(message)
      setDepRecords([])
      setDepTotal(0)
    } finally {
      setDepLoading(false)
    }
  }, [depFilters, depPage, pageSize])

  const fetchWithdrawals = useCallback(async () => {
    const params = buildQueryParams(wdFilters, wdPage, pageSize)
    setWdLoading(true)
    setWdError(null)
    try {
      const res = await fetch(`/api/super-admin/withdrawals/audit?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Failed to fetch withdrawal audit")
      }
      const payload = await res.json()
      const data = payload?.data
      if (!data) throw new Error("Malformed response from withdrawal audit API")
      setWdRecords(data.records || [])
      setWdTotal(data.total || 0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error while fetching withdrawal audit"
      setWdError(message)
      setWdRecords([])
      setWdTotal(0)
    } finally {
      setWdLoading(false)
    }
  }, [wdFilters, wdPage, pageSize])

  useEffect(() => {
    if (tab === "deposits") void fetchDeposits()
  }, [tab, fetchDeposits])

  useEffect(() => {
    if (tab === "withdrawals") void fetchWithdrawals()
  }, [tab, fetchWithdrawals])

  // Fetch totals whenever the deposit date filters change (deposit/withdrawal share the same range)
  const fetchSummary = useCallback(async (from: string, to: string) => {
    if (!from && !to) { setSummary(null); return }
    setSummaryLoading(true)
    try {
      const p = new URLSearchParams()
      if (from) p.set("from", new Date(`${from}T00:00:00Z`).toISOString())
      if (to) p.set("to", new Date(`${to}T23:59:59Z`).toISOString())
      const res = await fetch(`/api/super-admin/finance/summary?${p.toString()}`)
      if (!res.ok) return
      const payload = await res.json() as { success: boolean; data: FinancialSummaryData }
      setSummary(payload.data ?? null)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSummary(depFilters.from, depFilters.to)
  }, [depFilters.from, depFilters.to, fetchSummary])

  const handleDepFilterChange = <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
    setDepFilters((prev) => ({ ...prev, [key]: value }))
    setDepPage(1)
  }

  const handleWdFilterChange = <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
    setWdFilters((prev) => ({ ...prev, [key]: value }))
    setWdPage(1)
  }

  const handleResetDeposits = () => {
    setDepFilters(initialFilters)
    setDepPage(1)
  }

  const handleResetWithdrawals = () => {
    setWdFilters(initialFilters)
    setWdPage(1)
  }

  const loading = tab === "deposits" ? depLoading : wdLoading

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Financial audit"
        description="Deposit and withdrawal approval/rejection trails for super-admins"
        icon={<DollarSign className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              className="gap-1.5 text-xs sm:text-sm"
            >
              <Download className="h-3 w-3 sm:h-4 sm:w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={tab === "deposits" ? handleResetDeposits : handleResetWithdrawals}
              className="text-xs sm:text-sm"
            >
              <FilterX className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Reset
            </Button>
            <RefreshButton
              onClick={tab === "deposits" ? fetchDeposits : fetchWithdrawals}
              loading={loading}
            />
          </>
        }
      />

      <TotalsStrip
        summary={summary}
        loading={summaryLoading}
        dateFrom={depFilters.from}
        dateTo={depFilters.to}
      />

      <FinancialExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        depositFilters={{
          status: depFilters.status !== "ALL" ? depFilters.status : undefined,
          search: depFilters.search || undefined,
          adminId: depFilters.adminId || undefined,
          adminName: depFilters.adminName || undefined,
          from: depFilters.from || undefined,
          to: depFilters.to || undefined,
        }}
        withdrawalFilters={{
          status: wdFilters.status !== "ALL" ? wdFilters.status : undefined,
          search: wdFilters.search || undefined,
          adminId: wdFilters.adminId || undefined,
          adminName: wdFilters.adminName || undefined,
          from: wdFilters.from || undefined,
          to: wdFilters.to || undefined,
        }}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TrailTab)} className="w-full">
        <TabsList className="mb-2 w-full max-w-md">
          <TabsTrigger value="deposits" className="flex-1">
            Deposits
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1">
            Withdrawals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposits" className="mt-0 space-y-3 sm:space-y-4">
          <Card>
            <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6 pt-3 sm:pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                  <Select
                    value={depFilters.status}
                    onValueChange={(value) => handleDepFilterChange("status", value as FilterState["status"])}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPOSIT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 sm:left-3 top-1/2 h-3 w-3 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-7 sm:pl-9 text-sm"
                      placeholder="Deposit ID or keyword"
                      value={depFilters.search}
                      onChange={(e) => handleDepFilterChange("search", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Admin ID</label>
                  <Input
                    placeholder="admin uuid"
                    value={depFilters.adminId}
                    onChange={(e) => handleDepFilterChange("adminId", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Admin Name</label>
                  <Input
                    placeholder="name search"
                    value={depFilters.adminName}
                    onChange={(e) => handleDepFilterChange("adminName", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">From (IST)</label>
                  <Input
                    type="date"
                    value={depFilters.from}
                    onChange={(e) => handleDepFilterChange("from", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">To (IST)</label>
                  <Input
                    type="date"
                    value={depFilters.to}
                    onChange={(e) => handleDepFilterChange("to", e.target.value)}
                  />
                </div>
              </div>

              {depError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {depError}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-lg sm:text-xl font-semibold break-words">Deposit decisions</CardTitle>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                Showing page {depPage} of {depTotalPages} ({depTotal} total actions)
              </div>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-0 sm:px-6 pb-3 sm:pb-6">
              <div className="overflow-x-auto -mx-3 sm:mx-0 rounded-lg border">
                <div className="min-w-[1000px] sm:min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Timestamp (IST)</TableHead>
                        <TableHead className="whitespace-nowrap">Deposit ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Reason / Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {depRecords.length === 0 && !depLoading && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                            No audit records found for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {depLoading && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                            Loading audit records...
                          </TableCell>
                        </TableRow>
                      )}
                      {!depLoading &&
                        depRecords.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {formatDateTime(record.createdAt)}
                            </TableCell>
                            <TableCell className="align-top font-mono text-xs">
                              {record.depositId ?? "—"}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="text-sm font-medium">{record.user?.name ?? "Unknown user"}</div>
                              <div className="text-xs text-muted-foreground">
                                {record.user?.clientId ?? "N/A"} · {record.user?.email ?? "N/A"}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-right text-sm font-semibold">
                              {formatCurrency(record.amount)}
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge
                                variant={record.status === "APPROVED" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {record.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="text-sm font-medium">{record.adminName ?? "Unknown admin"}</div>
                              <div className="font-mono text-xs text-muted-foreground">{record.adminId ?? "—"}</div>
                            </TableCell>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {record.adminRole ?? "—"}
                            </TableCell>
                            <TableCell className="align-top text-xs">
                              {record.reason ? (
                                <span className="text-red-600" title={escapeHtml(record.reason)}>
                                  {truncateText(record.reason)}
                                </span>
                              ) : (
                                truncateText(record.remarks) || "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {depRecords.length} record{depRecords.length === 1 ? "" : "s"} on this page
                </div>
                <Pagination
                  currentPage={depPage}
                  totalPages={depTotalPages}
                  onPageChange={setDepPage}
                  loading={depLoading}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-0 space-y-3 sm:space-y-4">
          <Card>
            <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6 pt-3 sm:pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                  <Select
                    value={wdFilters.status}
                    onValueChange={(value) => handleWdFilterChange("status", value as FilterState["status"])}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      {WITHDRAWAL_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 sm:left-3 top-1/2 h-3 w-3 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-7 sm:pl-9 text-sm"
                      placeholder="Withdrawal ID or keyword"
                      value={wdFilters.search}
                      onChange={(e) => handleWdFilterChange("search", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Admin ID</label>
                  <Input
                    placeholder="admin uuid"
                    value={wdFilters.adminId}
                    onChange={(e) => handleWdFilterChange("adminId", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Admin Name</label>
                  <Input
                    placeholder="name search"
                    value={wdFilters.adminName}
                    onChange={(e) => handleWdFilterChange("adminName", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">From (IST)</label>
                  <Input
                    type="date"
                    value={wdFilters.from}
                    onChange={(e) => handleWdFilterChange("from", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">To (IST)</label>
                  <Input
                    type="date"
                    value={wdFilters.to}
                    onChange={(e) => handleWdFilterChange("to", e.target.value)}
                  />
                </div>
              </div>

              {wdError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{wdError}</div>
              )}
              <p className="text-xs text-muted-foreground">
                Amount shown is gross withdrawal plus fees (total debited on approve).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-lg sm:text-xl font-semibold break-words">Withdrawal decisions</CardTitle>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                Showing page {wdPage} of {wdTotalPages} ({wdTotal} total actions)
              </div>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-0 sm:px-6 pb-3 sm:pb-6">
              <div className="overflow-x-auto -mx-3 sm:mx-0 rounded-lg border">
                <div className="min-w-[1080px] sm:min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Timestamp (IST)</TableHead>
                        <TableHead className="whitespace-nowrap">Withdrawal ID</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                        <TableHead className="whitespace-nowrap">Bank ref</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Reason / Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wdRecords.length === 0 && !wdLoading && (
                        <TableRow>
                          <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                            No audit records found for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {wdLoading && (
                        <TableRow>
                          <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                            Loading audit records...
                          </TableCell>
                        </TableRow>
                      )}
                      {!wdLoading &&
                        wdRecords.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {formatDateTime(record.createdAt)}
                            </TableCell>
                            <TableCell className="align-top font-mono text-xs">
                              {record.withdrawalId ?? "—"}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="text-sm font-medium">{record.user?.name ?? "Unknown user"}</div>
                              <div className="text-xs text-muted-foreground">
                                {record.user?.clientId ?? "N/A"} · {record.user?.email ?? "N/A"}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-right text-sm font-semibold">
                              {formatCurrency(record.amount)}
                            </TableCell>
                            <TableCell className="align-top font-mono text-xs">{record.bankReference ?? "—"}</TableCell>
                            <TableCell className="align-top text-xs max-w-[280px] break-words">
                              {record.beneficiaryMask ?? "—"}
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge
                                variant={record.status === "APPROVED" ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {record.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="text-sm font-medium">{record.adminName ?? "Unknown admin"}</div>
                              <div className="font-mono text-xs text-muted-foreground">{record.adminId ?? "—"}</div>
                            </TableCell>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {record.adminRole ?? "—"}
                            </TableCell>
                            <TableCell className="align-top text-xs">
                              {record.reason ? (
                                <span className="text-red-600" title={escapeHtml(record.reason)}>
                                  {truncateText(record.reason)}
                                </span>
                              ) : (
                                truncateText(record.remarks) || "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {wdRecords.length} record{wdRecords.length === 1 ? "" : "s"} on this page
                </div>
                <Pagination
                  currentPage={wdPage}
                  totalPages={wdTotalPages}
                  onPageChange={setWdPage}
                  loading={wdLoading}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
