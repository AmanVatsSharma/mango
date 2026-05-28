"use client"

/**
 * @file user-statement-dialog.tsx
 * @module components/admin-console
 * @description Admin dialog: user statement via dedicated API, summaries, filters, IST columns, CSV export of filtered rows, running balances.
 * @author StockTrade
 * @created 2026-02-01
 * @updated 2026-04-01 — Activity tab (grouped events), funds snapshot, manifest warnings, trade→ledger search link; trade register shows `instrumentLabel`.
 *
 * Notes:
 * - Below `lg`, ledger and trade register render as stacked cards (no horizontal scroll). Table layout from `lg` up.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Download, TrendingUp, TrendingDown, DollarSign, Activity, Search, Filter, ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AdminUserStatementPayload } from "@/lib/services/admin/AdminUserService"

interface UserStatementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
}

type StatementRow = AdminUserStatementPayload["rows"][number]

const IST: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" }

function formatStatementDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    ...IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatStatementTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    ...IST,
    hour: "2-digit",
    minute: "2-digit",
  })
}

function escapeCsvField(value: string): string {
  return `"${(value || "").replace(/"/g, '""')}"`
}

type TypeFilter = "all" | StatementRow["type"]

function summarizeRows(rows: StatementRow[]) {
  let deposits = 0
  let withdrawals = 0
  let credits = 0
  let debits = 0
  let tradeBuyNotional = 0
  let tradeSellNotional = 0
  let tradeRows = 0
  for (const r of rows) {
    switch (r.type) {
      case "deposit":
        deposits += Math.max(0, r.amount)
        break
      case "withdrawal":
        withdrawals += Math.abs(r.amount)
        break
      case "credit":
        credits += Math.max(0, r.amount)
        break
      case "debit":
        debits += Math.abs(r.amount)
        break
      case "trade":
        tradeRows += 1
        if (r.amount < 0) {
          tradeBuyNotional += Math.abs(r.amount)
        } else {
          tradeSellNotional += r.amount
        }
        break
      default:
        break
    }
  }
  const netFunds = deposits - withdrawals + credits - debits
  return {
    deposits,
    withdrawals,
    credits,
    debits,
    tradeRows,
    tradeBuyNotional,
    tradeSellNotional,
    netFunds,
    rowCount: rows.length,
  }
}

export function UserStatementDialog({ open, onOpenChange, user }: UserStatementDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<AdminUserStatementPayload | null>(null)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [dateFromInput, setDateFromInput] = useState("")
  const [dateToInput, setDateToInput] = useState("")
  const [appliedFrom, setAppliedFrom] = useState<string | undefined>(undefined)
  const [appliedTo, setAppliedTo] = useState<string | undefined>(undefined)
  const [mainTab, setMainTab] = useState<"activity" | "cash" | "trades">("activity")

  const fetchStatement = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (appliedFrom) {
        qs.set("dateFrom", appliedFrom)
      }
      if (appliedTo) {
        qs.set("dateTo", appliedTo)
      }
      const res = await fetch(`/api/admin/users/${user.id}/statement?${qs.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || `Failed to load statement (${res.status})`)
      }
      setPayload(data.statement as AdminUserStatementPayload)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load statement"
      setError(msg)
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id, appliedFrom, appliedTo])

  useEffect(() => {
    if (!open || !user?.id) return
    void fetchStatement()
  }, [open, user?.id, fetchStatement])

  useEffect(() => {
    if (open) return
    setPayload(null)
    setSearch("")
    setTypeFilter("all")
    setError(null)
    setDateFromInput("")
    setDateToInput("")
    setAppliedFrom(undefined)
    setAppliedTo(undefined)
    setMainTab("activity")
  }, [open])

  const allRows = payload?.rows ?? []
  const cashBaseRows = useMemo(() => allRows.filter((r) => r.type !== "trade"), [allRows])

  const filteredCashRows = useMemo(() => {
    let list = cashBaseRows
    if (typeFilter !== "all" && typeFilter !== "trade") {
      list = list.filter((r) => r.type === typeFilter)
    }
    if (typeFilter === "trade") {
      list = []
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.description.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.status && r.status.toLowerCase().includes(q)),
      )
    }
    return list
  }, [cashBaseRows, typeFilter, search])

  const filteredEvents = useMemo(() => {
    const ev = payload?.events ?? []
    if (!search.trim()) return ev
    const q = search.trim().toLowerCase()
    return ev.filter((e) => {
      const parts = [e.id, e.kind, e.primary.description, ...e.children.map((c) => c.description)].join(" ").toLowerCase()
      return parts.includes(q)
    })
  }, [payload?.events, search])

  const filteredTradeAnnex = useMemo(() => {
    const annex = payload?.tradeRegisterAnnex ?? []
    if (!search.trim()) return annex
    const q = search.trim().toLowerCase()
    return annex.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        (r.instrumentLabel && r.instrumentLabel.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q) ||
        r.orderSide.toLowerCase().includes(q),
    )
  }, [payload?.tradeRegisterAnnex, search])

  const summaryAll = useMemo(() => summarizeRows(allRows), [allRows])
  const summaryFiltered = useMemo(() => summarizeRows(filteredCashRows), [filteredCashRows])

  const exportCsv = useCallback(() => {
    if (mainTab === "activity") {
      if (!filteredEvents.length) {
        toast({
          title: "Nothing to export",
          description: "No activity groups match the current search.",
          variant: "destructive",
        })
        return
      }
      const header = "Date (IST),Time (IST),Kind,Type,Description,Amount,CashDelta,Balance,Status,ID\n"
      const lines: string[] = []
      for (const e of filteredEvents) {
        const rows = [e.primary, ...e.children]
        for (const r of rows) {
          const cashD = r.cashAmount !== undefined && r.cashAmount !== null ? String(r.cashAmount) : ""
          const bal = r.balance !== undefined ? String(r.balance) : ""
          lines.push(
            [
              escapeCsvField(formatStatementDate(r.dateIso)),
              escapeCsvField(formatStatementTime(r.dateIso)),
              escapeCsvField(e.kind),
              r.type,
              escapeCsvField(r.description),
              String(r.amount),
              cashD,
              bal,
              escapeCsvField(r.status ?? ""),
              escapeCsvField(r.id),
            ].join(","),
          )
        }
      }
      const csv = header + lines.join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safe = (user?.clientId || user?.id || "user").toString().replace(/[^\w-]+/g, "_")
      a.download = `statement-activity-${safe}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Exported", description: `Activity CSV with ${filteredEvents.length} group(s).` })
      return
    }
    if (mainTab === "cash") {
      if (!filteredCashRows.length) {
        toast({
          title: "Nothing to export",
          description: "No cash/ledger rows match the current filters.",
          variant: "destructive",
        })
        return
      }
    } else if (!filteredTradeAnnex.length) {
      toast({
        title: "Nothing to export",
        description: "No executed orders match the current search.",
        variant: "destructive",
      })
      return
    }

    if (mainTab === "trades") {
      const header = "Date (IST),Time (IST),Symbol,Instrument,Side,Qty,Filled,AvgPrice,Status,OrderId\n"
      const lines = filteredTradeAnnex.map((r) => {
        const iso = r.executedAt || r.createdAt
        const datePart = formatStatementDate(iso)
        const timePart = formatStatementTime(iso)
        return [
          escapeCsvField(datePart),
          escapeCsvField(timePart),
          escapeCsvField(r.symbol),
          escapeCsvField(r.instrumentLabel ?? ""),
          r.orderSide,
          String(r.quantity),
          String(r.filledQuantity),
          r.averagePrice != null ? String(r.averagePrice) : "",
          escapeCsvField(r.status),
          escapeCsvField(r.id),
        ].join(",")
      })
      const csv = header + lines.join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safe = (user?.clientId || user?.id || "user").toString().replace(/[^\w-]+/g, "_")
      a.download = `statement-trades-${safe}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Exported", description: `Trade register CSV with ${filteredTradeAnnex.length} row(s).` })
      return
    }

    const header = "Date (IST),Time (IST),Type,Description,Amount,Balance,Status,ID\n"
    const lines = filteredCashRows.map((r) => {
      const datePart = formatStatementDate(r.dateIso)
      const timePart = formatStatementTime(r.dateIso)
      const bal = r.balance !== undefined ? String(r.balance) : ""
      const statusStr = r.status ?? ""
      return [
        escapeCsvField(datePart),
        escapeCsvField(timePart),
        r.type,
        escapeCsvField(r.description),
        String(r.amount),
        bal,
        escapeCsvField(statusStr),
        escapeCsvField(r.id),
      ].join(",")
    })
    const csv = header + lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const safe = (user?.clientId || user?.id || "user").toString().replace(/[^\w-]+/g, "_")
    a.download = `statement-${safe}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Exported", description: `CSV with ${filteredCashRows.length} row(s) downloaded.` })
  }, [filteredCashRows, filteredEvents, filteredTradeAnnex, mainTab, toast, user?.clientId, user?.id])

  const applyDateFilters = () => {
    const from = dateFromInput ? new Date(dateFromInput).toISOString() : undefined
    const to = dateToInput ? new Date(dateToInput).toISOString() : undefined
    setAppliedFrom(from)
    setAppliedTo(to)
  }

  const clearDateFilters = () => {
    setDateFromInput("")
    setDateToInput("")
    setAppliedFrom(undefined)
    setAppliedTo(undefined)
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return <TrendingUp className="w-4 h-4 shrink-0 text-green-400" />
      case "withdrawal":
        return <TrendingDown className="w-4 h-4 shrink-0 text-red-400" />
      case "trade":
        return <Activity className="w-4 h-4 shrink-0 text-blue-400" />
      case "credit":
        return <TrendingUp className="w-4 h-4 shrink-0 text-emerald-400" />
      case "debit":
        return <TrendingDown className="w-4 h-4 shrink-0 text-rose-400" />
      default:
        return <DollarSign className="w-4 h-4 shrink-0 text-muted-foreground" />
    }
  }

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case "deposit":
        return <Badge className="bg-green-400/20 text-green-400 border-green-400/30">Deposit</Badge>
      case "withdrawal":
        return <Badge className="bg-red-400/20 text-red-400 border-red-400/30">Withdrawal</Badge>
      case "trade":
        return <Badge className="bg-blue-400/20 text-blue-400 border-blue-400/30">Trade</Badge>
      case "credit":
        return <Badge className="bg-emerald-400/20 text-emerald-400 border-emerald-400/30">Credit</Badge>
      case "debit":
        return <Badge className="bg-rose-400/20 text-rose-400 border-rose-400/30">Debit</Badge>
      default:
        return <Badge className="bg-gray-400/20 text-gray-400 border-gray-400/30">{type}</Badge>
    }
  }

  const displayName = payload?.user?.name ?? user?.name
  const balance = payload?.tradingAccount?.balance ?? user?.balance ?? 0
  const availableMargin = payload?.tradingAccount?.availableMargin
  const usedMargin = payload?.tradingAccount?.usedMargin
  const executedInView = payload?.counts.orders ?? 0
  const executedLifetime = payload?.executedOrdersTotal ?? 0
  const hasDateRange = Boolean(appliedFrom || appliedTo)

  const joinLabel = payload?.user?.createdAt
    ? formatStatementDate(payload.user.createdAt)
    : user?.joinDate ?? "—"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[min(100vw-1rem,72rem)] sm:w-full sm:max-w-6xl bg-card border-border max-h-[92vh] overflow-hidden overflow-x-hidden flex flex-col mx-auto sm:mx-4 rounded-2xl shadow-xl p-0 gap-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0 border-b border-border/60">
          <DialogTitle className="text-lg sm:text-xl font-bold text-primary tracking-tight">User Statement</DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Ledger, trades, deposits, and withdrawals for {displayName}
            {payload?.truncated ? " — loaded slice may be capped per category; use date range to narrow." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 max-h-[calc(92vh-6rem)] overflow-y-auto overflow-x-hidden overscroll-contain">
          <motion.div
            className="space-y-5 px-3 sm:px-6 py-4 max-w-full min-w-0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {payload?.balanceDisclaimer === "partial" && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTitle className="text-amber-200 text-sm">Running balance note</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  History is capped or date-filtered. The <strong>Balance</strong> column tracks{" "}
                  <strong>cash</strong> only (margin reserve/release lines show 0 cash delta). Totals reconcile to current
                  account balance for visible rows.
                </AlertDescription>
              </Alert>
            )}

            {payload?.manifestWarnings && payload.manifestWarnings.length > 0 && (
              <Alert className="border-blue-500/35 bg-blue-500/10">
                <AlertTitle className="text-blue-200 text-sm">Statement notices</AlertTitle>
                <AlertDescription asChild>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1 mt-1">
                    {payload.manifestWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {payload?.funds && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Funds (window)</span> — Opening cash (derived): ₹
                  {payload.funds.opening.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · Net cash
                  movement in view: ₹
                  {payload.funds.cashStreamTotals.netCashInWindow.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                  · Closing cash: ₹
                  {payload.funds.closing.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
                <p>
                  Avail / used margin shown on cards are <strong>end-of-period</strong> (opening margin requires
                  snapshots).
                </p>
              </div>
            )}

            {payload?.truncated && (
              <Alert variant="default" className="border-primary/30">
                <AlertTitle className="text-sm text-primary">Partial load</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  At least one category hit the row cap. Narrow the date range or export in chunks. Totals below reflect
                  loaded rows only (
                  <span className="font-mono">
                    orders {payload.returned.orders}/{payload.counts.orders}, tx {payload.returned.transactions}/
                    {payload.counts.transactions}, dep {payload.returned.deposits}/{payload.counts.deposits}, wd{" "}
                    {payload.returned.withdrawals}/{payload.counts.withdrawals}
                  </span>
                  ).
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="bg-muted/30 border-border/80 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Cash balance (ledger)</p>
                      <p className="text-xl font-bold text-green-400 tabular-nums">
                        ₹{Number(balance).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-400 opacity-90" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 border-border/80 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Executed orders</p>
                      <p className="text-xl font-bold text-foreground tabular-nums">
                        {hasDateRange ? (
                          <>
                            {executedInView.toLocaleString("en-IN")}
                            <span className="text-sm font-normal text-muted-foreground">
                              {" "}
                              in range · {executedLifetime.toLocaleString("en-IN")} lifetime
                            </span>
                          </>
                        ) : (
                          <>
                            {executedLifetime.toLocaleString("en-IN")}
                            <span className="text-sm font-normal text-muted-foreground"> executed</span>
                          </>
                        )}
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-400 opacity-90" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 border-border/80 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Margin (avail / used)</p>
                      <p className="text-lg font-bold text-foreground tabular-nums">
                        {availableMargin !== undefined && usedMargin !== undefined ? (
                          <>
                            ₹{availableMargin.toLocaleString("en-IN")}{" "}
                            <span className="text-muted-foreground font-medium">/</span> ₹
                            {usedMargin.toLocaleString("en-IN")}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-primary opacity-90" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-muted/30 border-border/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-primary">Account information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">Client ID</span>
                      <code className="text-primary font-mono text-xs bg-primary/10 px-2 py-1 rounded text-right break-all">
                        {payload?.user?.clientId ?? user?.clientId}
                      </code>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Name</span>
                      <span className="text-foreground font-medium text-right wrap-break-word">{displayName}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">Email</span>
                      <span className="text-foreground text-right break-all">{payload?.user?.email ?? user?.email}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="text-foreground text-right">{payload?.user?.phone ?? user?.phone}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Active</span>
                      <Badge
                        className={
                          (payload?.user?.isActive ?? user?.isActive ?? user?.status === "Active")
                            ? "bg-green-400/20 text-green-400 border-green-400/30"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {(payload?.user?.isActive ?? user?.isActive ?? user?.status === "Active") ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">KYC</span>
                      <Badge className="bg-green-400/20 text-green-400 border-green-400/30">
                        {payload?.user?.kycStatus ?? user?.kycStatus ?? "—"}
                      </Badge>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Joined (IST date)</span>
                      <span className="text-foreground text-right">{joinLabel}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Last login</span>
                      <span className="text-foreground text-right">{user?.lastLogin ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30 border-border/80 shadow-sm overflow-hidden">
              <CardHeader className="pb-2 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <CardTitle className="text-lg font-bold text-primary">Activity summary (loaded rows)</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-primary/50 text-primary hover:bg-primary/10 bg-transparent shrink-0"
                    onClick={exportCsv}
                    disabled={
                      loading ||
                      !!error ||
                      (mainTab === "activity"
                        ? filteredEvents.length === 0
                        : mainTab === "cash"
                          ? filteredCashRows.length === 0
                          : filteredTradeAnnex.length === 0)
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV (filtered)
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs sm:text-sm">
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Rows</div>
                    <div className="font-semibold tabular-nums">{summaryFiltered.rowCount}</div>
                    <div className="text-[10px] text-muted-foreground">of {summaryAll.rowCount} loaded</div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Deposits +</div>
                    <div className="font-semibold tabular-nums text-green-400">
                      ₹{summaryFiltered.deposits.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Withdrawals −</div>
                    <div className="font-semibold tabular-nums text-red-400">
                      ₹{summaryFiltered.withdrawals.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Credits / Debits</div>
                    <div className="font-semibold tabular-nums">
                      +₹{summaryFiltered.credits.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                      <span className="text-muted-foreground">/</span> −₹
                      {summaryFiltered.debits.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Executions (range)</div>
                    <div className="font-semibold tabular-nums">{payload?.tradeRegisterAnnex?.length ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground truncate" title="Executed orders tab">
                      Register tab · no cash column
                    </div>
                  </div>
                  <div className="rounded-lg bg-background/50 border border-border/60 p-2">
                    <div className="text-muted-foreground">Net funds (excl. trade)</div>
                    <div
                      className={`font-semibold tabular-nums ${summaryFiltered.netFunds >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      ₹{summaryFiltered.netFunds.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:flex-wrap gap-3 pt-1">
                  <div className="flex items-end gap-2 flex-1 min-w-[140px]">
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs text-muted-foreground">From (local)</Label>
                      <Input
                        type="datetime-local"
                        value={dateFromInput}
                        onChange={(e) => setDateFromInput(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs text-muted-foreground">To (local)</Label>
                      <Input
                        type="datetime-local"
                        value={dateToInput}
                        onChange={(e) => setDateToInput(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <Button type="button" size="sm" onClick={applyDateFilters} disabled={loading}>
                      Apply range
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={clearDateFilters} disabled={loading}>
                      Clear
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Search description, id, status…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                      <SelectTrigger className="h-9 w-full min-w-0 sm:w-[160px] text-sm">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="deposit">Deposit</SelectItem>
                        <SelectItem value="withdrawal">Withdrawal</SelectItem>
                        <SelectItem value="trade">Trade</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                        <SelectItem value="debit">Debit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-4 pt-0">
                <Tabs
                  value={mainTab}
                  onValueChange={(v) => setMainTab(v as "activity" | "cash" | "trades")}
                  className="w-full"
                >
                  <div className="px-2 sm:px-4 pb-3">
                    <TabsList className="grid w-full max-w-3xl grid-cols-3 h-auto">
                      <TabsTrigger value="activity" className="text-xs sm:text-sm py-2">
                        Activity ({payload?.events?.length ?? 0})
                      </TabsTrigger>
                      <TabsTrigger value="cash" className="text-xs sm:text-sm py-2">
                        Cash ledger
                      </TabsTrigger>
                      <TabsTrigger value="trades" className="text-xs sm:text-sm py-2">
                        Orders ({payload?.tradeRegisterAnnex?.length ?? 0})
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="activity" className="mt-0 px-2 sm:px-4 min-w-0 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Grouped by order when linked. Expand for related margin, fees, and P&amp;L lines. Cash balance in rows
                      matches the <strong>Cash ledger</strong> tab.
                    </p>
                    {loading && <p className="text-center text-muted-foreground py-8">Loading statement…</p>}
                    {error && !loading && <p className="text-center text-red-400 py-8">{error}</p>}
                    {!loading && !error && filteredEvents.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">No activity matches the current search.</p>
                    )}
                    {!loading &&
                      !error &&
                      filteredEvents.map((evt) => (
                        <Collapsible key={evt.id} className="rounded-xl border border-border/70 bg-card/80">
                          <CollapsibleTrigger className="flex w-full items-start gap-2 p-3 sm:p-4 text-left hover:bg-muted/30 rounded-t-xl">
                            <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground [[data-state=open]_&]:rotate-180 transition-transform" />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] uppercase">
                                  {evt.kind}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatStatementDate(evt.dateIso)} · {formatStatementTime(evt.dateIso)}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground wrap-break-word">{evt.primary.description}</p>
                              <div className="flex flex-wrap gap-3 text-xs tabular-nums">
                                <span className={evt.primary.amount >= 0 ? "text-green-400" : "text-red-400"}>
                                  Amount {evt.primary.amount >= 0 ? "+" : ""}₹
                                  {Math.abs(evt.primary.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                </span>
                                {evt.primary.balance !== undefined && (
                                  <span className="text-muted-foreground">
                                    Cash balance ₹
                                    {evt.primary.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-border/60 px-3 sm:px-4 pb-3 space-y-2">
                              {evt.children.map((row) => (
                                <div
                                  key={row.id}
                                  className="text-xs sm:text-sm pl-6 border-l-2 border-border py-2 space-y-1 bg-muted/20 rounded-r"
                                >
                                  <div className="flex flex-wrap gap-2 text-muted-foreground">
                                    <span>
                                      {formatStatementDate(row.dateIso)} {formatStatementTime(row.dateIso)}
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">
                                      {row.type}
                                    </Badge>
                                  </div>
                                  <p className="text-foreground wrap-break-word">{row.description}</p>
                                  <div className="tabular-nums font-medium">
                                    <span className={row.amount >= 0 ? "text-green-400" : "text-red-400"}>
                                      {row.amount >= 0 ? "+" : ""}₹
                                      {Math.abs(row.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </span>
                                    {row.marginOnly ? (
                                      <span className="text-muted-foreground ml-2">(margin mechanics · 0 cash)</span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                              {evt.children.length === 0 && (
                                <p className="text-xs text-muted-foreground pl-6 py-2">No related lines in this window.</p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                  </TabsContent>

                  <TabsContent value="cash" className="mt-0 px-0 min-w-0">
                    <div className="rounded-xl border border-border/60 overflow-hidden min-w-0">
                      <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden">
                        {/* Cards: no horizontal scroll on small / medium viewports */}
                        <div className="lg:hidden space-y-3 p-3 sm:p-4">
                          {loading && (
                            <p className="text-center text-muted-foreground py-10">Loading statement…</p>
                          )}
                          {error && !loading && <p className="text-center text-red-400 py-10">{error}</p>}
                          {!loading && !error && filteredCashRows.length === 0 && (
                            <p className="text-center text-muted-foreground py-10">
                              No cash / ledger rows match filters (executions are on the other tab).
                            </p>
                          )}
                          {!loading &&
                            !error &&
                            filteredCashRows.map((transaction) => (
                              <div
                                key={transaction.id}
                                className="rounded-xl border border-border/70 bg-card/80 p-3 sm:p-4 space-y-2 shadow-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {formatStatementDate(transaction.dateIso)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatStatementTime(transaction.dateIso)}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                    {getTransactionIcon(transaction.type)}
                                    {getTransactionBadge(transaction.type)}
                                  </div>
                                </div>
                                <p className="text-sm text-foreground whitespace-normal wrap-break-word leading-relaxed">
                                  {transaction.description}
                                </p>
                                <p className="text-xs font-mono text-muted-foreground wrap-break-word">ID: {transaction.id}</p>
                                <div className="flex flex-wrap justify-between gap-2 pt-1 border-t border-border/50">
                                  <span className="text-xs text-muted-foreground">Amount / Cash Δ</span>
                                  <span
                                    className={`font-bold tabular-nums text-sm ${transaction.amount > 0 ? "text-green-400" : "text-red-400"}`}
                                  >
                                    {transaction.amount > 0 ? "+" : ""}₹
                                    {Math.abs(transaction.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    {transaction.cashAmount !== undefined &&
                                    transaction.cashAmount !== null &&
                                    transaction.cashAmount !== transaction.amount ? (
                                      <span className="block text-[10px] text-muted-foreground font-normal">
                                        Cash{" "}
                                        {transaction.cashAmount > 0 ? "+" : ""}
                                        ₹
                                        {Math.abs(transaction.cashAmount).toLocaleString("en-IN", {
                                          maximumFractionDigits: 2,
                                        })}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2">
                                  <span className="text-xs text-muted-foreground">Balance</span>
                                  <span className="text-sm font-medium tabular-nums">
                                    {transaction.balance !== undefined
                                      ? `₹${transaction.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                      : "—"}
                                  </span>
                                </div>
                                {transaction.status ? (
                                  <Badge className="bg-green-400/15 text-green-400 border-green-400/30 text-xs wrap-break-word whitespace-normal max-w-full justify-start">
                                    {transaction.status}
                                  </Badge>
                                ) : null}
                              </div>
                            ))}
                        </div>

                        <div className="hidden lg:block min-w-0">
                          <Table className="w-full text-sm table-auto">
                            <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/80 shadow-sm">
                              <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground font-semibold w-[12%]">Date</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[8%]">Time</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[14%]">Type</TableHead>
                                <TableHead className="text-muted-foreground min-w-0 font-semibold">Description</TableHead>
                                <TableHead className="text-muted-foreground text-right font-semibold w-[11%]">Amount</TableHead>
                                <TableHead className="text-muted-foreground text-right font-semibold w-[9%]">Cash Δ</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[11%]">Cash bal</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[10%]">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {loading && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                                    Loading statement…
                                  </TableCell>
                                </TableRow>
                              )}
                              {error && !loading && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center text-red-400 py-10">
                                    {error}
                                  </TableCell>
                                </TableRow>
                              )}
                              {!loading && !error && filteredCashRows.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                                    No cash / ledger rows match filters (executions are on the other tab).
                                  </TableCell>
                                </TableRow>
                              )}
                              {!loading &&
                                !error &&
                                filteredCashRows.map((transaction) => (
                                  <TableRow key={transaction.id} className="border-border align-top">
                                    <TableCell className="text-foreground align-top py-3">
                                      <span className="font-medium">{formatStatementDate(transaction.dateIso)}</span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs align-top py-3">
                                      {formatStatementTime(transaction.dateIso)}
                                    </TableCell>
                                    <TableCell className="align-top py-3">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {getTransactionIcon(transaction.type)}
                                        {getTransactionBadge(transaction.type)}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-foreground align-top py-3 min-w-0 max-w-md">
                                      <p className="text-sm whitespace-normal wrap-break-word leading-relaxed">
                                        {transaction.description}
                                      </p>
                                      <p className="text-xs font-mono text-muted-foreground mt-1 wrap-break-word">
                                        ID: {transaction.id}
                                      </p>
                                    </TableCell>
                                    <TableCell className="text-right align-top py-3">
                                      <span
                                        className={`font-bold tabular-nums ${transaction.amount > 0 ? "text-green-400" : "text-red-400"}`}
                                      >
                                        {transaction.amount > 0 ? "+" : ""}₹
                                        {Math.abs(transaction.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right align-top py-3 text-xs tabular-nums text-muted-foreground">
                                      {transaction.cashAmount !== undefined && transaction.cashAmount !== null
                                        ? `${transaction.cashAmount > 0 ? "+" : ""}₹${Math.abs(transaction.cashAmount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-foreground font-medium align-top py-3 text-sm tabular-nums">
                                      {transaction.balance !== undefined
                                        ? `₹${transaction.balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="align-top py-3">
                                      {transaction.status ? (
                                        <Badge className="bg-green-400/15 text-green-400 border-green-400/30 text-xs whitespace-normal wrap-break-word text-left max-w-full">
                                          {transaction.status}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="trades" className="mt-0 px-0 min-w-0">
                    <p className="text-xs text-muted-foreground px-2 sm:px-4 pb-2">
                      Execution facts for the same date range. Amounts belong in the cash ledger tab (margin, charges, P&amp;L).
                    </p>
                    <div className="rounded-xl border border-border/60 overflow-hidden min-w-0">
                      <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden">
                        <div className="lg:hidden space-y-3 p-3 sm:p-4">
                          {loading && <p className="text-center text-muted-foreground py-10">Loading…</p>}
                          {error && !loading && <p className="text-center text-red-400 py-10">{error}</p>}
                          {!loading && !error && filteredTradeAnnex.length === 0 && (
                            <p className="text-center text-muted-foreground py-10">
                              No executed orders in range (or none match search).
                            </p>
                          )}
                          {!loading &&
                            !error &&
                            filteredTradeAnnex.map((r) => {
                              const iso = r.executedAt || r.createdAt
                              return (
                                <div
                                  key={r.id}
                                  className="rounded-xl border border-border/70 bg-card/80 p-3 sm:p-4 space-y-2 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-lg font-semibold">{r.symbol}</span>
                                    <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">{r.orderSide}</Badge>
                                  </div>
                                  {r.instrumentLabel ? (
                                    <p className="text-xs text-muted-foreground wrap-break-word leading-snug">{r.instrumentLabel}</p>
                                  ) : null}
                                  <div className="text-sm text-muted-foreground">
                                    {formatStatementDate(iso)} · {formatStatementTime(iso)}
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                                    <span className="text-muted-foreground">Qty / Filled</span>
                                    <span className="tabular-nums text-right">
                                      {r.quantity} / {r.filledQuantity}
                                    </span>
                                    <span className="text-muted-foreground">Avg</span>
                                    <span className="tabular-nums text-right">
                                      {r.averagePrice != null
                                        ? `₹${r.averagePrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                        : "—"}
                                    </span>
                                    <span className="text-muted-foreground">Status</span>
                                    <span className="text-right">{r.status}</span>
                                  </div>
                                  <p className="text-xs font-mono text-muted-foreground wrap-break-word pt-1 border-t border-border/50">
                                    {r.id}
                                  </p>
                                </div>
                              )
                            })}
                        </div>

                        <div className="hidden lg:block min-w-0">
                          <Table className="w-full text-sm table-auto">
                            <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/80 shadow-sm">
                              <TableRow>
                                <TableHead className="text-muted-foreground font-semibold w-[11%]">Date</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[8%]">Time</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[9%]">Symbol</TableHead>
                                <TableHead className="text-muted-foreground font-semibold min-w-[140px]">Instrument</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[8%]">Side</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[7%]">Qty</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[7%]">Filled</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[11%]">Avg</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[10%]">Status</TableHead>
                                <TableHead className="text-muted-foreground min-w-0 font-semibold">Order ID</TableHead>
                                <TableHead className="text-muted-foreground font-semibold w-[8%]">Ledger</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {loading && (
                                <TableRow>
                                  <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                                    Loading…
                                  </TableCell>
                                </TableRow>
                              )}
                              {error && !loading && (
                                <TableRow>
                                  <TableCell colSpan={11} className="text-center text-red-400 py-10">
                                    {error}
                                  </TableCell>
                                </TableRow>
                              )}
                              {!loading && !error && filteredTradeAnnex.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                                    No executed orders in range (or none match search).
                                  </TableCell>
                                </TableRow>
                              )}
                              {!loading &&
                                !error &&
                                filteredTradeAnnex.map((r) => {
                                  const iso = r.executedAt || r.createdAt
                                  return (
                                    <TableRow key={r.id} className="border-border align-top">
                                      <TableCell className="text-sm py-3">{formatStatementDate(iso)}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground py-3">{formatStatementTime(iso)}</TableCell>
                                      <TableCell className="font-medium py-3">{r.symbol}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground py-3 max-w-xs wrap-break-word">
                                        {r.instrumentLabel ?? "—"}
                                      </TableCell>
                                      <TableCell className="py-3">{r.orderSide}</TableCell>
                                      <TableCell className="tabular-nums py-3">{r.quantity}</TableCell>
                                      <TableCell className="tabular-nums py-3">{r.filledQuantity}</TableCell>
                                      <TableCell className="tabular-nums py-3">
                                        {r.averagePrice != null
                                          ? `₹${r.averagePrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="py-3">
                                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs whitespace-normal wrap-break-word max-w-full">
                                          {r.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="font-mono text-xs py-3 min-w-0 max-w-56 wrap-break-word">
                                        {r.id}
                                      </TableCell>
                                      <TableCell className="py-3">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-[10px] px-2"
                                          onClick={() => {
                                            setMainTab("cash")
                                            setSearch(r.id.length > 8 ? r.id.slice(-8) : r.id)
                                          }}
                                        >
                                          Match cash
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
