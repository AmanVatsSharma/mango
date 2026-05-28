"use client"

/**
 * @file trade-management.tsx
 * @module components/admin-console
 * @description World-class admin ledger monitor — stats bar (Credits/Debits/Net), filter chips,
 *   linked order/position column, export-all (not just current page).
 *   Inline edit flow now routes through a confirmation dialog that previews the wallet delta and
 *   blocks paise-granular edits client-side; the server still enforces the same invariants.
 * @author StockTrade
 * @created 2025 (legacy)
 * @updated 2026-05-08 — fix URL-sync redirecting to /advanced (Trades Command); add edit-confirm
 *                        dialog with explicit fund-delta preview ("verify-before-mutate" UX).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Calendar,
  Download,
  Edit3,
  Hash,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { PageHeader, RefreshButton, Pagination, StatusBadge } from "./shared"
import {
  formatLedgerAmountRupeeLabel,
  formatLedgerSignedAmountForCsv,
  ledgerAmountDisplayClass,
  normalizeTradeManagementAmount,
  normalizeTradeManagementEditableAmount,
  normalizeTradeManagementLimit,
  normalizeTradeManagementPage,
} from "@/components/admin-console/trade-management-number-utils"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"
import { useToast } from "@/hooks/use-toast"

const DEBOUNCE_MS = 400

const SORT_OPTIONS = [
  { value: "createdAt", label: "Time (created)" },
  { value: "amount", label: "Amount" },
  { value: "type", label: "Type" },
  { value: "id", label: "Transaction ID" },
] as const

interface TxnRow {
  id: string
  userId?: string
  createdAt: string
  createdAtIso: string
  clientId?: string
  userName?: string
  type: "CREDIT" | "DEBIT"
  description?: string
  amount: number
  balanceAfter: number | null
  orderId?: string
  orderSymbol?: string
  positionId?: string
  positionSymbol?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  return `"${(value || "").replace(/"/g, '""')}"`
}

async function parseFetchErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json().catch(() => ({}))
    return body.error || body.message || fallback
  } catch {
    return fallback
  }
}

function formatRupeeCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  colorClass: string
}) {
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={colorClass}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${colorClass}`}>{value}</div>
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-destructive transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TradeManagement() {
  const router = useRouter()
  const sp = useSearchParams()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TxnRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState<number>(normalizeTradeManagementPage(sp.get("page")))
  const [pages, setPages] = useState<number>(1)

  // ── Filter state ───────────────────────────────────────────────────────────
  const [userFilter, setUserFilter] = useState<string>(sp.get("user") || "")
  const [q, setQ] = useState<string>(sp.get("q") || "")
  const [debouncedUser, setDebouncedUser] = useState<string>(sp.get("user") || "")
  const [debouncedQ, setDebouncedQ] = useState<string>(sp.get("q") || "")
  const [type, setType] = useState<string>(sp.get("type") || "")
  const [from, setFrom] = useState<string>(sp.get("from") || "")
  const [to, setTo] = useState<string>(sp.get("to") || "")
  const [limit, setLimit] = useState<number>(() => normalizeTradeManagementLimit(sp.get("limit")))
  const [minAmount, setMinAmount] = useState<string>(sp.get("minAmount") || "")
  const [maxAmount, setMaxAmount] = useState<string>(sp.get("maxAmount") || "")
  const [sortBy, setSortBy] = useState<string>(sp.get("sortBy") || "createdAt")
  const [order, setOrder] = useState<string>(sp.get("order") === "asc" ? "asc" : "desc")

  // ── Debounce user/q ────────────────────────────────────────────────────────
  const filterBaseline = useRef<string | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedUser(userFilter), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [userFilter])
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [q])
  useEffect(() => {
    const key = `${debouncedUser}\0${debouncedQ}`
    if (filterBaseline.current === null) {
      filterBaseline.current = key
      return
    }
    if (filterBaseline.current !== key) {
      filterBaseline.current = key
      setPage(1)
    }
  }, [debouncedUser, debouncedQ])

  // ── URL-synced params ──────────────────────────────────────────────────────
  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(limit))
    if (debouncedUser) p.set("user", debouncedUser)
    if (debouncedQ) p.set("q", debouncedQ)
    if (type === "CREDIT" || type === "DEBIT") p.set("type", type)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    const minT = minAmount.trim()
    const maxT = maxAmount.trim()
    if (minT) p.set("minAmount", minT)
    if (maxT) p.set("maxAmount", maxT)
    if (sortBy && ["createdAt", "amount", "type", "id"].includes(sortBy)) p.set("sortBy", sortBy)
    else p.set("sortBy", "createdAt")
    p.set("order", order)
    return p
  }, [page, limit, debouncedUser, debouncedQ, type, from, to, minAmount, maxAmount, sortBy, order])

  useEffect(() => {
    // Component is mounted at /admin-console/ledger (post-2026-04-15 split from /advanced).
    // Hardcoding "advanced" here previously bounced the user to Trades Command on every keystroke.
    const base = getAdminConsoleRoute("ledger")
    router.replace(`${base}?${params.toString()}`)
  }, [params, router])

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const mapRows = (transactions: any[]): TxnRow[] =>
    transactions.map((t: any) => ({
      id: t.id,
      userId: t.tradingAccount?.user?.id,
      createdAt: new Date(t.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      createdAtIso: typeof t.createdAt === "string" ? t.createdAt : new Date(t.createdAt).toISOString(),
      clientId: t.tradingAccount?.user?.clientId,
      userName: t.tradingAccount?.user?.name,
      type: t.type,
      description: t.description,
      amount: normalizeTradeManagementAmount(t.amount),
      balanceAfter:
        typeof t.balanceAfter === "number" && Number.isFinite(t.balanceAfter)
          ? t.balanceAfter
          : null,
      orderId: t.orderId || t.order?.id,
      orderSymbol: t.order?.symbol,
      positionId: t.positionId || t.position?.id,
      positionSymbol: t.position?.symbol,
    }))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions?${params.toString()}`)
      if (!res.ok) {
        const msg = await parseFetchErrorMessage(res, `Failed: ${res.status}`)
        throw new Error(msg)
      }
      const data = await res.json()
      setRows(mapRows(data.transactions || []))
      const total = typeof data.total === "number" ? data.total : 0
      setTotalCount(total)
      const pageCount = typeof data.pages === "number" ? data.pages : Math.ceil(total / limit)
      setPages(Math.max(1, pageCount))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }, [params, limit])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // ── Stats computed from loaded page ────────────────────────────────────────
  const stats = useMemo(() => {
    const credits = rows.filter((r) => r.type === "CREDIT").reduce((s, r) => s + r.amount, 0)
    const debits = rows.filter((r) => r.type === "DEBIT").reduce((s, r) => s + r.amount, 0)
    const net = credits - debits
    return { total: rows.length, credits, debits, net }
  }, [rows])

  // ── Inline edit ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [pendingEdit, setPendingEdit] = useState<{
    row: TxnRow
    newAmount: number
    newDescription: string
  } | null>(null)
  const [committing, setCommitting] = useState(false)

  const startEdit = (row: TxnRow) => {
    setEditingId(row.id)
    setEditAmount(String(Math.abs(row.amount)))
    setEditDescription(row.description || "")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditAmount("")
    setEditDescription("")
  }

  // Stage 1: validate inputs, then open confirmation dialog with delta preview.
  const requestEditConfirmation = (row: TxnRow) => {
    const amountNum = normalizeTradeManagementEditableAmount(editAmount)
    if (amountNum === null) {
      toast({ title: "Invalid amount", description: "Enter a non-negative number.", variant: "destructive" })
      return
    }
    if (!Number.isInteger(amountNum)) {
      toast({
        title: "Whole rupees only",
        description: "TradingAccount balance is integer-rupee. Enter a value without paise.",
        variant: "destructive",
      })
      return
    }
    if (editDescription && editDescription.length > 500) {
      toast({ title: "Invalid description", description: "Max 500 characters.", variant: "destructive" })
      return
    }
    setPendingEdit({ row, newAmount: amountNum, newDescription: editDescription })
  }

  // Stage 2: actually fire the PATCH after admin confirms the wallet delta.
  const commitPendingEdit = async () => {
    if (!pendingEdit) return
    const { row, newAmount, newDescription } = pendingEdit
    setCommitting(true)
    try {
      const res = await fetch("/api/admin/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: row.id,
          amount: newAmount,
          description: newDescription || undefined,
          reconcile: true,
        }),
      })
      if (!res.ok) {
        const msg = await parseFetchErrorMessage(res, `Save failed: ${res.status}`)
        throw new Error(msg)
      }
      const body = await res.json().catch(() => ({} as { walletEffect?: number }))
      const walletEffect = typeof body?.walletEffect === "number" ? body.walletEffect : null
      setPendingEdit(null)
      cancelEdit()
      void fetchData()
      const summary =
        walletEffect !== null && walletEffect !== 0
          ? `Wallet ${walletEffect > 0 ? "credited" : "debited"} ₹${Math.abs(walletEffect).toLocaleString("en-IN")} and margin reconciled.`
          : "Transaction updated; no wallet movement."
      toast({ title: "Saved", description: summary })
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      })
    } finally {
      setCommitting(false)
    }
  }

  // ── Export current page ────────────────────────────────────────────────────
  const exportCurrentPageCsv = () => {
    if (!rows.length) {
      toast({ title: "Nothing to export", description: "No rows on this page.", variant: "destructive" })
      return
    }
    const header =
      "CreatedAt(ISO),CreatedAt(IST display),UserId,ClientId,Name,Type,Description,SignedAmount,BalanceAfter,TransactionId\n"
    const lines = rows.map((r) =>
      [
        escapeCsvField(r.createdAtIso),
        escapeCsvField(r.createdAt),
        escapeCsvField(r.userId || ""),
        escapeCsvField(r.clientId || ""),
        escapeCsvField(r.userName || ""),
        r.type,
        escapeCsvField(r.description || ""),
        formatLedgerSignedAmountForCsv(r.type, r.amount),
        r.balanceAfter != null ? String(r.balanceAfter) : "",
        escapeCsvField(r.id),
      ].join(","),
    )
    const csv = header + lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `admin-transactions-page-${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Exported", description: `${rows.length} row(s) (current page).` })
  }

  // ── Export all (up to 1000 records matching current filters) ──────────────
  const [exportingAll, setExportingAll] = useState(false)
  const exportAllCsv = async () => {
    setExportingAll(true)
    try {
      const allParams = new URLSearchParams(params)
      allParams.set("limit", "1000")
      allParams.set("page", "1")
      const res = await fetch(`/api/admin/transactions?${allParams.toString()}`)
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const data = await res.json()
      const allRows = mapRows(data.transactions || [])
      if (!allRows.length) {
        toast({ title: "Nothing to export", variant: "destructive" })
        return
      }
      const header =
        "CreatedAt(ISO),CreatedAt(IST display),UserId,ClientId,Name,Type,Description,SignedAmount,BalanceAfter,TransactionId\n"
      const lines = allRows.map((r) =>
        [
          escapeCsvField(r.createdAtIso),
          escapeCsvField(r.createdAt),
          escapeCsvField(r.userId || ""),
          escapeCsvField(r.clientId || ""),
          escapeCsvField(r.userName || ""),
          r.type,
          escapeCsvField(r.description || ""),
          formatLedgerSignedAmountForCsv(r.type, r.amount),
          r.balanceAfter != null ? String(r.balanceAfter) : "",
          escapeCsvField(r.id),
        ].join(","),
      )
      const csv = header + lines.join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `admin-transactions-all-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Exported", description: `${allRows.length} row(s) (all matching).` })
    } catch (e: unknown) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Export failed", variant: "destructive" })
    } finally {
      setExportingAll(false)
    }
  }

  // ── Range label ────────────────────────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (totalCount === 0) return "No rows"
    const start = (page - 1) * limit + 1
    const end = Math.min(page * limit, totalCount)
    return `Showing ${start}–${end} of ${totalCount}`
  }, [page, limit, totalCount])

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = []
    if (type) chips.push({ label: `Type: ${type}`, clear: () => { setType(""); setPage(1) } })
    if (from) chips.push({ label: `From: ${from}`, clear: () => { setFrom(""); setPage(1) } })
    if (to) chips.push({ label: `To: ${to}`, clear: () => { setTo(""); setPage(1) } })
    if (minAmount) chips.push({ label: `Min: ₹${minAmount}`, clear: () => { setMinAmount(""); setPage(1) } })
    if (maxAmount) chips.push({ label: `Max: ₹${maxAmount}`, clear: () => { setMaxAmount(""); setPage(1) } })
    if (debouncedUser) chips.push({ label: `User: ${debouncedUser}`, clear: () => { setUserFilter(""); setPage(1) } })
    return chips
  }, [type, from, to, minAmount, maxAmount, debouncedUser])

  const clearAllFilters = () => {
    setType("")
    setFrom("")
    setTo("")
    setMinAmount("")
    setMaxAmount("")
    setUserFilter("")
    setQ("")
    setPage(1)
  }

  const usersBase = getAdminConsoleRoute("users")

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        description="Full ledger with balance-after per trading account"
        icon={<BarChart3 className="w-6 h-6 shrink-0" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportAllCsv}
              disabled={loading || exportingAll}
            >
              {exportingAll ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Export All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportCurrentPageCsv} disabled={loading}>
              <Download className="w-4 h-4 mr-1" />
              CSV (page)
            </Button>
            <RefreshButton onClick={() => void fetchData()} loading={loading} />
          </div>
        }
      />

      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Total (page)"
          value={String(stats.total)}
          icon={<BarChart3 className="w-4 h-4" />}
          colorClass="text-foreground"
        />
        <StatCard
          label="Credits"
          value={formatRupeeCompact(stats.credits)}
          icon={<ArrowDownCircle className="w-4 h-4" />}
          colorClass="text-emerald-500"
        />
        <StatCard
          label="Debits"
          value={formatRupeeCompact(stats.debits)}
          icon={<ArrowUpCircle className="w-4 h-4" />}
          colorClass="text-red-500"
        />
        <StatCard
          label="Net Flow"
          value={formatRupeeCompact(stats.net)}
          icon={<TrendingUp className="w-4 h-4" />}
          colorClass={stats.net >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

      {/* Command bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="User (clientId / name / id)…"
            className="text-sm flex-1 min-w-[180px] max-w-xs h-9"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Description search…"
            className="text-sm flex-1 min-w-[180px] max-w-xs h-9"
          />
          <Select value={type || "all"} onValueChange={(v) => { setType(v === "all" ? "" : v); setPage(1) }}>
            <SelectTrigger className="w-36 text-sm h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="CREDIT">Credit</SelectItem>
              <SelectItem value="DEBIT">Debit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1) }}>
            <SelectTrigger className="w-40 text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={order} onValueChange={(v) => { setOrder(v); setPage(1) }}>
            <SelectTrigger className="w-36 text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest first</SelectItem>
              <SelectItem value="asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(limit)}
            onValueChange={(v) => { setLimit(normalizeTradeManagementLimit(v)); setPage(1) }}
          >
            <SelectTrigger className="w-28 text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Min ₹</span>
            <Input
              value={minAmount}
              onChange={(e) => { setMinAmount(e.target.value); setPage(1) }}
              placeholder="0"
              className="text-sm w-24 h-9"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Max ₹</span>
            <Input
              value={maxAmount}
              onChange={(e) => { setMaxAmount(e.target.value); setPage(1) }}
              placeholder="∞"
              className="text-sm w-24 h-9"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">From</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              className="text-sm w-36 h-9"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">To</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              className="text-sm w-36 h-9"
            />
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map((chip) => (
              <FilterChip key={chip.label} label={chip.label} onRemove={chip.clear} />
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
          <AlertTitle className="text-red-500">Failed to load</AlertTitle>
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {/* Range info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{rangeLabel}</span>
        <span className="text-[11px]">
          Amount: credit/debit sign follows type · Balance after = ledger closing value
        </span>
      </div>

      {/* Mobile card view */}
      <div className="lg:hidden space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="text-center text-muted-foreground py-12 text-sm">No transactions</p>
        )}
        {!loading &&
          rows.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border/70 bg-card/80 p-2.5 sm:p-3 space-y-1.5 shadow-sm text-xs"
            >
              <div className="text-muted-foreground">{r.createdAt}</div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.type} />
                <span className={`font-semibold tabular-nums ${ledgerAmountDisplayClass(r.type)}`}>
                  {formatLedgerAmountRupeeLabel(r.type, r.amount)}
                </span>
              </div>
              {r.balanceAfter != null && (
                <div className="text-muted-foreground">
                  Balance after:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    ₹{r.balanceAfter.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <p className="line-clamp-2" title={r.description || undefined}>
                {r.description || "—"}
              </p>
              <div className="text-xs font-mono text-muted-foreground">
                {r.clientId || "—"} {r.userName ? `· ${r.userName}` : ""}
              </div>
              {(r.orderSymbol || r.positionSymbol) && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Link2 className="w-3 h-3" />
                  {r.orderSymbol && (
                    <span className="font-mono text-[10px]">→ {r.orderSymbol} BUY/SELL</span>
                  )}
                  {r.positionSymbol && !r.orderSymbol && (
                    <span className="font-mono text-[10px]">→ POS {r.positionSymbol}</span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {r.userId && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildRouteWithQuery(usersBase, { userId: r.userId })} prefetch={false}>
                        User
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={buildRouteWithQuery(usersBase, { userId: r.userId, openStatement: "1" })}
                        prefetch={false}
                      >
                        Statement
                      </Link>
                    </Button>
                  </>
                )}
                {editingId === r.id ? (
                  <div className="flex flex-col gap-2 w-full">
                    <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                    <Input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => requestEditConfirmation(r)}>
                        <Save className="w-4 h-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                    <Edit3 className="w-4 h-4 mr-1" /> Edit
                  </Button>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block rounded-xl border border-border/60 overflow-hidden">
        <div className="max-h-[min(70vh,720px)] overflow-y-auto overflow-x-hidden">
          <Table className="w-full text-xs table-auto">
            <TableHeader className="sticky top-0 z-10 bg-background/95 border-b">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground whitespace-nowrap py-2">Time</TableHead>
                <TableHead className="text-muted-foreground min-w-0 py-2">Client</TableHead>
                <TableHead className="text-muted-foreground py-2">Type</TableHead>
                <TableHead className="text-muted-foreground min-w-0 py-2">Details</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap text-right py-2">Amount</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap text-right py-2">Balance</TableHead>
                <TableHead className="text-muted-foreground py-2">Linked</TableHead>
                <TableHead className="text-muted-foreground py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    <p className="text-sm">No transactions</p>
                    {activeChips.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="mt-2 text-xs text-primary underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((r) => (
                  <TableRow key={r.id} className="border-border align-top">
                    <TableCell className="py-2 align-top">
                      <div className="flex items-start gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="leading-snug">{r.createdAt}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0 py-2 align-top">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <code className="text-primary font-mono text-[11px] leading-snug">
                          {r.clientId || "—"}
                        </code>
                        <span
                          className="text-muted-foreground leading-snug line-clamp-2"
                          title={r.userName || undefined}
                        >
                          {r.userName || ""}
                        </span>
                      </div>
                      {r.userId && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                            <Link href={buildRouteWithQuery(usersBase, { userId: r.userId })} prefetch={false}>
                              User
                            </Link>
                          </Button>
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                            <Link
                              href={buildRouteWithQuery(usersBase, { userId: r.userId, openStatement: "1" })}
                              prefetch={false}
                            >
                              Statement
                            </Link>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <StatusBadge status={r.type} />
                    </TableCell>
                    <TableCell className="max-w-56 min-w-0 py-2 align-top">
                      {editingId === r.id ? (
                        <Input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="text-xs h-8"
                        />
                      ) : (
                        <span
                          className="text-foreground line-clamp-2 leading-snug"
                          title={r.description || undefined}
                        >
                          {r.description || "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top text-right">
                      {editingId === r.id ? (
                        <Input
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="text-xs h-8"
                        />
                      ) : (
                        <span
                          className={`font-semibold tabular-nums whitespace-nowrap ${ledgerAmountDisplayClass(r.type)}`}
                        >
                          {formatLedgerAmountRupeeLabel(r.type, r.amount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top text-right tabular-nums text-muted-foreground">
                      {r.balanceAfter != null
                        ? `₹${r.balanceAfter.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                    {/* Linked column */}
                    <TableCell className="py-2 align-top max-w-[120px]">
                      {r.orderSymbol ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 border border-border/50">
                          <Link2 className="w-2.5 h-2.5 shrink-0" />
                          {r.orderSymbol}
                        </span>
                      ) : r.positionSymbol ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 border border-border/50">
                          <Link2 className="w-2.5 h-2.5 shrink-0" />
                          POS {r.positionSymbol}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      {editingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => requestEditConfirmation(r)}
                            className="bg-primary hover:bg-primary/90 text-white h-7 text-xs"
                          >
                            <Save className="w-3.5 h-3.5 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit} className="h-7 text-xs">
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(r)} className="h-7 text-xs">
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination currentPage={page} totalPages={pages} onPageChange={setPage} loading={loading} />

      <EditConfirmationDialog
        pending={pendingEdit}
        committing={committing}
        onCancel={() => {
          if (committing) return
          setPendingEdit(null)
        }}
        onConfirm={() => void commitPendingEdit()}
      />
    </div>
  )
}

// ─── Edit confirmation dialog ──────────────────────────────────────────────────
// Shown after admin clicks Save. Previews the wallet delta in plain rupees so the
// admin verifies the side-effect *before* the PATCH fires. Server enforces the
// same invariants (integer-rupee, non-negative resulting balance) — this dialog
// is the human-facing safety rail.

function EditConfirmationDialog({
  pending,
  committing,
  onCancel,
  onConfirm,
}: {
  pending: {
    row: TxnRow
    newAmount: number
    newDescription: string
  } | null
  committing: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!pending) {
    return (
      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent className="hidden" />
      </Dialog>
    )
  }
  const { row, newAmount, newDescription } = pending
  const oldAmount = Math.abs(row.amount)
  const delta = newAmount - oldAmount
  const walletEffect = row.type === "CREDIT" ? delta : -delta
  const descriptionChanged = (row.description || "") !== (newDescription || "")

  const walletLabel =
    walletEffect === 0
      ? "No wallet movement (description-only edit)"
      : walletEffect > 0
        ? `Wallet credit: +₹${walletEffect.toLocaleString("en-IN")}`
        : `Wallet debit: −₹${Math.abs(walletEffect).toLocaleString("en-IN")}`
  const walletTone =
    walletEffect === 0
      ? "text-muted-foreground"
      : walletEffect > 0
        ? "text-emerald-500"
        : "text-red-500"

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Confirm ledger edit
          </DialogTitle>
          <DialogDescription>
            Review the change. The wallet delta below is what will hit{" "}
            <span className="font-mono">{row.clientId || row.userName || row.userId || "user"}</span>'s
            balance and available margin atomically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Transaction</span>
              <span className="font-mono text-[11px]">{row.id.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className={ledgerAmountDisplayClass(row.type)}>{row.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono tabular-nums">
                ₹{oldAmount.toLocaleString("en-IN")} → ₹{newAmount.toLocaleString("en-IN")}
              </span>
            </div>
            {descriptionChanged && (
              <div className="pt-1.5 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                <div className="text-xs line-clamp-2 italic text-muted-foreground">
                  {row.description || "—"}
                </div>
                <div className="text-xs line-clamp-2 mt-1 font-medium">
                  → {newDescription || "—"}
                </div>
              </div>
            )}
          </div>

          <div
            className={`flex items-center justify-between rounded-lg border p-3 ${
              walletEffect === 0
                ? "border-border bg-muted/20"
                : walletEffect > 0
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-red-500/40 bg-red-500/10"
            }`}
          >
            <span className="text-xs font-medium">Net effect on user funds</span>
            <span className={`text-base font-bold tabular-nums ${walletTone}`}>{walletLabel}</span>
          </div>

          {walletEffect !== 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This atomically updates the ledger row, the user's balance, and their available
                margin in a single DB transaction. If available margin would go negative, the
                server will reject the change.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={committing}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={committing}
            className={
              walletEffect < 0
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-primary hover:bg-primary/90 text-white"
            }
          >
            {committing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Committing…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" />
                Confirm & save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
