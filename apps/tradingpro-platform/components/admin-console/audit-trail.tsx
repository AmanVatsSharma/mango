/**
 * @file audit-trail.tsx
 * @module admin-console
 * @description Admin audit trail: authentication events and platform trading logs with filters, summary metrics, detail dialog, and CSV export.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-20 — Tabs, debounced search, summary strip, detail dialog, functional export.
 */

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
function truncateText(str: string | null | undefined, maxLen = 500): string {
  if (!str) return ""
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str
}

/**
 * @file audit-trail.tsx
 * @module admin-console
 * @description Admin audit trail: authentication events and platform trading logs with filters, summary metrics, detail dialog, and CSV export.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-05-14 — XSS protection for userAgent and message fields
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Shield,
  Download,
  Calendar,
  User,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Copy,
  LayoutList,
  Server,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { StatusBadge, PageHeader, RefreshButton, FilterBar, Pagination, type FilterField } from "./shared"
import {
  AUTH_EVENT_TYPE_VALUES,
  LOG_CATEGORY_VALUES,
  LOG_LEVEL_VALUES,
  formatEnumLabel,
} from "@/lib/admin/audit-trail-filter-options"

type AuditSource = "auth" | "trading"

interface AuditSummary {
  authEvents24h: number
  authFailed24h: number
  authCritical24h: number
  tradingErrors24h: number
  authEvents7d: number
  tradingErrors7d: number
}

interface AuditLog {
  id: string
  source: AuditSource
  timestamp: string
  userId: string | null
  userName: string
  clientId: string | null
  action: string
  resource: string
  resourceId: string | null
  message: string
  details: string
  summary: string
  ipAddress: string
  userAgent: string
  severity: string
  level: string | null
  category: string | null
  status: "SUCCESS" | "FAILED" | "PENDING"
  rawMetadata: unknown
  rawDetails: unknown
  error: string | null
  stackTrace: string | null
}

function formatIdPreview(id: string | null | undefined): string {
  if (!id || id.length === 0) return "—"
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`
}

function formatIst(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  })
}

function escapeCsvCell(value: string): string {
  const dq = '"'
  if (value.includes(dq) || value.includes(",") || value.includes("\n")) {
    return dq + value.replace(/"/g, dq + dq) + dq
  }
  return value
}

function downloadAuditCsv(rows: AuditLog[], source: AuditSource): void {
  const headers = [
    "timestamp_ist",
    "source",
    "status",
    "severity",
    "userName",
    "clientId",
    "action",
    "resource",
    "message",
    "ipAddress",
  ]
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(formatIst(r.timestamp)),
        r.source,
        r.status,
        r.severity,
        escapeCsvCell(r.userName),
        r.clientId ?? "",
        r.action,
        r.resource,
        escapeCsvCell((r.message || "").slice(0, 500)),
        r.ipAddress,
      ].join(",")
    ),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "audit-" + source + "-" + new Date().toISOString().slice(0, 19) + ".csv"
  a.click()
  URL.revokeObjectURL(url)
}

export function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [sourceTab, setSourceTab] = useState<AuditSource>("auth")
  const [searchDraft, setSearchDraft] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filters, setFilters] = useState({
    severity: "all",
    status: "all",
    action: "all",
    dateFrom: "",
    dateTo: "",
    category: "all",
    level: "all",
    clientId: "",
    userId: "",
  })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [selected, setSelected] = useState<AuditLog | null>(null)

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(searchDraft.trim()), 400)
    return () => clearTimeout(h)
  }, [searchDraft])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, sourceTab])

  const authActionOptions = useMemo(
    () => [
      { label: "All event types", value: "all" },
      ...AUTH_EVENT_TYPE_VALUES.map((v) => ({
        label: formatEnumLabel(v),
        value: v,
      })),
    ],
    []
  )

  const tradingCategoryOptions = useMemo(
    () => [
      { label: "All categories", value: "all" },
      ...LOG_CATEGORY_VALUES.map((v) => ({ label: v, value: v })),
    ],
    []
  )

  const tradingLevelOptions = useMemo(
    () => [
      { label: "All levels", value: "all" },
      ...LOG_LEVEL_VALUES.map((v) => ({ label: v, value: v })),
    ],
    []
  )

  const authFilterFields: FilterField[] = useMemo(
    () => [
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: [
          { label: "All severities", value: "all" },
          { label: "Low", value: "LOW" },
          { label: "Medium", value: "MEDIUM" },
          { label: "High", value: "HIGH" },
          { label: "Critical", value: "CRITICAL" },
        ],
      },
      {
        key: "status",
        label: "Outcome",
        type: "select",
        options: [
          { label: "All outcomes", value: "all" },
          { label: "Success", value: "SUCCESS" },
          { label: "Failed", value: "FAILED" },
          { label: "Pending / attempt", value: "PENDING" },
        ],
      },
      {
        key: "action",
        label: "Event type",
        type: "select",
        options: authActionOptions,
        span: 2,
        className: "min-w-[200px]",
      },
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
    ],
    [authActionOptions]
  )

  const tradingFilterFields: FilterField[] = useMemo(
    () => [
      {
        key: "category",
        label: "Category",
        type: "select",
        options: tradingCategoryOptions,
      },
      {
        key: "level",
        label: "Log level",
        type: "select",
        options: tradingLevelOptions,
      },
      {
        key: "severity",
        label: "Severity (mapped)",
        type: "select",
        options: [
          { label: "All", value: "all" },
          { label: "Low", value: "LOW" },
          { label: "Medium", value: "MEDIUM" },
          { label: "High", value: "HIGH" },
          { label: "Critical", value: "CRITICAL" },
        ],
      },
      {
        key: "status",
        label: "Outcome",
        type: "select",
        options: [
          { label: "All outcomes", value: "all" },
          { label: "Success (info/debug)", value: "SUCCESS" },
          { label: "Failed (error)", value: "FAILED" },
          { label: "Warning", value: "PENDING" },
        ],
      },
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
    ],
    [tradingCategoryOptions, tradingLevelOptions]
  )

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", page.toString())
      params.set("limit", "50")
      params.set("source", sourceTab)
      params.set("summary", "true")
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (filters.severity !== "all") params.set("severity", filters.severity)
      if (filters.status !== "all") params.set("status", filters.status)
      if (sourceTab === "auth" && filters.action !== "all") {
        params.set("action", filters.action)
      }
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.set("dateTo", filters.dateTo)
      if (sourceTab === "trading") {
        if (filters.category !== "all") params.set("category", filters.category)
        if (filters.level !== "all") params.set("level", filters.level)
        if (filters.clientId.trim()) params.set("clientId", filters.clientId.trim())
        if (filters.userId.trim()) params.set("userId", filters.userId.trim())
      }

      const response = await fetch("/api/admin/audit?" + params.toString())

      if (!response.ok) {
        setLogs([])
        setTotalPages(1)
        setSummary(null)
        toast({
          title: "Could not load audit",
          description: "Check permissions (admin.audit.read) or try again.",
          variant: "destructive",
        })
        return
      }

      const data = await response.json()
      const formattedLogs = (data.logs || []).map((log: Record<string, unknown>) => ({
        ...log,
        timestamp:
          log.timestamp instanceof Date
            ? (log.timestamp as Date).toISOString()
            : String(log.timestamp),
        userId: (log.userId as string | null | undefined) ?? null,
        resourceId: (log.resourceId as string | null | undefined) ?? null,
        clientId: (log.clientId as string | null | undefined) ?? null,
        level: (log.level as string | null | undefined) ?? null,
        category: (log.category as string | null | undefined) ?? null,
        error: (log.error as string | null | undefined) ?? null,
        stackTrace: (log.stackTrace as string | null | undefined) ?? null,
      })) as AuditLog[]

      setLogs(formattedLogs)
      setTotalPages(typeof data.pages === "number" ? data.pages : 1)
      if (data.summary && typeof data.summary === "object") {
        setSummary(data.summary as AuditSummary)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load audit logs",
        variant: "destructive",
      })
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page, sourceTab, debouncedSearch, filters])

  useEffect(() => {
    void fetchAuditLogs()
  }, [fetchAuditLogs])

  const onFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters({
      severity: "all",
      status: "all",
      action: "all",
      dateFrom: "",
      dateTo: "",
      category: "all",
      level: "all",
      clientId: "",
      userId: "",
    })
    setSearchDraft("")
    setDebouncedSearch("")
    setPage(1)
  }

  const onTabChange = (v: string) => {
    setSourceTab(v === "trading" ? "trading" : "auth")
    setPage(1)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-400" />
      case "PENDING":
        return <Clock className="w-4 h-4 text-yellow-400" />
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />
    }
  }

  const copyDetailJson = async () => {
    if (!selected) return
    const payload = {
      ...selected,
      rawMetadata: selected.rawMetadata,
      rawDetails: selected.rawDetails,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      toast({ title: "Copied", description: "Event payload copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", variant: "destructive" })
    }
  }

  const detailJson = selected
    ? JSON.stringify(
        {
          ...selected,
        },
        null,
        2
      )
    : ""

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Authentication activity and platform trading logs (IST)"
        icon={<Shield className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <RefreshButton onClick={() => void fetchAuditLogs()} loading={loading} />
            <Button
              variant="outline"
              size="sm"
              disabled={logs.length === 0}
              className="border-primary/50 text-primary hover:bg-primary/10 text-xs sm:text-sm"
              onClick={() => {
                downloadAuditCsv(logs, sourceTab)
                toast({
                  title: "Export ready",
                  description: "CSV includes " + String(logs.length) + " row(s) on this page.",
                })
              }}
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export page (CSV)</span>
            </Button>
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium">Auth events (24h)</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 text-xl font-bold text-foreground">
              {summary.authEvents24h}
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium">Failed auth (24h)</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 text-xl font-bold text-destructive">
              {summary.authFailed24h}
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium">Critical auth (24h)</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 text-xl font-bold text-orange-400">
              {summary.authCritical24h}
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium">Trading errors (24h)</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 text-xl font-bold text-destructive">
              {summary.tradingErrors24h}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={sourceTab} onValueChange={onTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="auth" className="gap-2">
            <LayoutList className="w-4 h-4" />
            Authentication
          </TabsTrigger>
          <TabsTrigger value="trading" className="gap-2">
            <Server className="w-4 h-4" />
            Platform &amp; trading
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auth" className="mt-4 space-y-4">
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardContent className="p-3 sm:p-4">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search message, metadata, user email, name, client ID…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="pl-10 bg-background border-border"
                />
              </div>
            </CardContent>
          </Card>
          <FilterBar
            filters={filters}
            fields={authFilterFields}
            onFilterChange={onFilterChange}
            onReset={resetFilters}
          />
        </TabsContent>

        <TabsContent value="trading" className="mt-4 space-y-4">
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardContent className="p-3 sm:p-4">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search action, message, client ID, error text…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  className="pl-10 bg-background border-border"
                />
              </div>
            </CardContent>
          </Card>
          <FilterBar
            filters={filters}
            fields={tradingFilterFields}
            onFilterChange={onFilterChange}
            onReset={resetFilters}
            customFields={
              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Client ID contains"
                  value={filters.clientId}
                  onChange={(e) => onFilterChange("clientId", e.target.value)}
                  className="bg-background border-border"
                />
                <Input
                  placeholder="User ID (exact)"
                  value={filters.userId}
                  onChange={(e) => onFilterChange("userId", e.target.value)}
                  className="bg-background border-border"
                />
              </div>
            }
          />
        </TabsContent>
      </Tabs>

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl font-bold text-primary">
            {sourceTab === "auth" ? "Authentication events" : "Trading & platform logs"} (
            {loading ? "…" : logs.length}
            )
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <div className="min-w-[1000px] sm:min-w-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Time (IST)</TableHead>
                    <TableHead className="text-muted-foreground">Actor</TableHead>
                    <TableHead className="text-muted-foreground">Action</TableHead>
                    <TableHead className="text-muted-foreground">Resource</TableHead>
                    <TableHead className="text-muted-foreground">Summary</TableHead>
                    <TableHead className="text-muted-foreground">Severity</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        Loading audit logs…
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        No audit logs found. Adjust filters or try the other tab.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow
                        key={log.id}
                        role="button"
                        tabIndex={0}
                        className="border-border hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => setSelected(log)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelected(log)
                          }
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm text-foreground whitespace-nowrap">
                              {formatIst(log.timestamp)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{log.userName}</p>
                              <p className="text-xs text-muted-foreground">
                                {log.clientId
                                  ? "Client " + formatIdPreview(log.clientId)
                                  : formatIdPreview(log.userId)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-primary/10 text-primary px-2 py-1 rounded break-all">
                            {log.action}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{log.resource}</p>
                            <p className="text-xs text-muted-foreground">{formatIdPreview(log.resourceId)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm text-foreground truncate">{log.summary}</p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={log.severity} type="risk" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(log.status)}
                            <span className="text-sm text-foreground">{log.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground break-all max-w-[120px] inline-block">
                            {log.ipAddress}
                          </code>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            loading={loading}
          />
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center justify-between gap-2 pr-8">
              Event detail
              <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => void copyDetailJson()}>
                <Copy className="w-4 h-4 mr-1" />
                Copy JSON
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground text-xs">Time (IST)</p>
                  <p className="font-medium">{formatIst(selected.timestamp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Source</p>
                  <p className="font-medium">{selected.source}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">User agent</p>
                  <p className="font-medium break-all text-xs" title={escapeHtml(selected.userAgent)}>
                    {truncateText(selected.userAgent)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">IP</p>
                  <p className="font-medium">{selected.ipAddress}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Message</p>
                <p className="font-medium whitespace-pre-wrap">{selected.message}</p>
              </div>
              {selected.error && (
                <div>
                  <p className="text-muted-foreground text-xs">Error</p>
                  <p className="text-destructive whitespace-pre-wrap">{selected.error}</p>
                </div>
              )}
              {selected.stackTrace && (
                <div>
                  <p className="text-muted-foreground text-xs">Stack trace</p>
                  <pre className="text-xs bg-muted/50 p-2 rounded-md overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {selected.stackTrace}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs mb-1">Full payload</p>
                <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto max-h-64 border border-border">
                  {detailJson}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
