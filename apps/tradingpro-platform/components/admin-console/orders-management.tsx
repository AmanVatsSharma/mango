"use client"

/**
 * @file orders-management.tsx
 * @module admin-console
 * @description World-class admin orders monitor — stats bar, Select filter dropdowns,
 *   date-range filter, expandable rows, bulk cancel/execute sticky bar, toast notifications.
 *   All existing saveEdit / cancelOrder / executeOrder logic preserved.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-14 — full UI overhaul; logic preserved
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  Ban,
  PlayCircle,
  Edit3,
  X,
  RefreshCw,
} from "lucide-react"
import { StatusBadge, PageHeader, RefreshButton, Pagination } from "./shared"
import {
  normalizeOrdersManagementEditPrice,
  normalizeOrdersManagementEditQuantity,
  normalizeOrdersManagementNonNegative,
  normalizeOrdersManagementNullableNonNegative,
  normalizeOrdersManagementPage,
} from "@/components/admin-console/orders-management-number-utils"
import { getAdminConsoleRoute } from "@/lib/branding-routes"
import { OrdersManagementOrderChargesTab } from "@/components/admin-console/orders-management-order-charges-tab"
import { toast } from "@/hooks/use-toast"

interface OrderRow {
  id: string
  createdAt: string
  clientId?: string
  userId?: string
  userName?: string
  symbol: string
  exchange: string
  instrumentLabel: string
  quantity: number
  orderType: string
  orderSide: string
  price?: number | null
  filledQuantity: number
  averagePrice?: number | null
  status: string
  failureReason?: string
  positionId?: string
  blockedMargin?: number | null
  placementCharges?: number | null
  executedAt?: string
  ltp?: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  colorClass,
  active,
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  colorClass: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 min-w-[130px] rounded-xl border p-3 text-left transition-all",
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/20",
        onClick ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={colorClass}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </button>
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

function formatRupeeCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

// ─── Main component ────────────────────────────────────────────────────────────

export function OrdersManagement() {
  const router = useRouter()
  const sp = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OrderRow[]>([])
  const [page, setPage] = useState<number>(normalizeOrdersManagementPage(sp.get("page")))
  const [pages, setPages] = useState<number>(1)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [userFilter, setUserFilter] = useState<string>(sp.get("user") || "")
  const [q, setQ] = useState<string>(sp.get("q") || "")
  const [symbol, setSymbol] = useState<string>(sp.get("symbol") || "")
  const [status, setStatus] = useState<string>(sp.get("status") || "")
  const [type, setType] = useState<string>(sp.get("type") || "")
  const [side, setSide] = useState<string>(sp.get("side") || "")
  const [from, setFrom] = useState<string>(sp.get("from") || "")
  const [to, setTo] = useState<string>(sp.get("to") || "")

  // ── Row interaction state ──────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editType, setEditType] = useState("")
  const [editSide, setEditSide] = useState("")
  const [editStatus, setEditStatus] = useState("")

  // ── URL-synced params ──────────────────────────────────────────────────────
  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    if (userFilter) p.set("user", userFilter)
    if (q) p.set("q", q)
    if (symbol) p.set("symbol", symbol)
    if (status) p.set("status", status)
    if (type) p.set("type", type)
    if (side) p.set("side", side)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    return p
  }, [page, userFilter, q, symbol, status, type, side, from, to])

  useEffect(() => {
    const base = getAdminConsoleRoute("orders")
    router.replace(`${base}?${params.toString()}`)
  }, [params, router])

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}&limit=50`)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      const mapped: OrderRow[] = (data.orders || []).map((o: any) => ({
        id: o.id,
        createdAt: new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        clientId: o.tradingAccount?.user?.clientId,
        userId: o.tradingAccount?.user?.id,
        userName: o.tradingAccount?.user?.name,
        symbol: o.symbol,
        exchange: o.exchange || "NSE",
        instrumentLabel:
          typeof o.instrumentLabel === "string" ? o.instrumentLabel : String(o.symbol || ""),
        quantity: normalizeOrdersManagementNonNegative(o.quantity),
        orderType: o.orderType,
        orderSide: o.orderSide,
        price: normalizeOrdersManagementNullableNonNegative(o.price),
        filledQuantity: normalizeOrdersManagementNonNegative(o.filledQuantity),
        averagePrice: normalizeOrdersManagementNullableNonNegative(o.averagePrice),
        status: o.status,
        failureReason: o.failureReason,
        positionId: o.positionId,
        blockedMargin: normalizeOrdersManagementNullableNonNegative(o.blockedMargin),
        placementCharges: normalizeOrdersManagementNullableNonNegative(o.placementCharges),
        executedAt: o.executedAt
          ? new Date(o.executedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          : undefined,
        ltp: normalizeOrdersManagementNullableNonNegative(o.ltp ?? o.currentPrice),
      }))
      setRows(mapped)
      setPages(data.pages || 1)
    } catch (e: any) {
      setError(e.message || "Failed to load orders")
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // ── Stats computed from loaded page ────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === "PENDING").length
    const executed = rows.filter((r) => r.status === "EXECUTED")
    const cancelled = rows.filter((r) => r.status === "CANCELLED").length
    const totalFilled = executed.reduce((s, r) => s + r.filledQuantity, 0)
    const totalOrdered = executed.reduce((s, r) => s + r.quantity, 0)
    const fillRate = totalOrdered > 0 ? Math.round((totalFilled / totalOrdered) * 100) : 0
    const volume = rows.reduce(
      (s, r) => s + (r.averagePrice ?? r.price ?? 0) * r.filledQuantity,
      0,
    )
    return { pending, executed: executed.length, cancelled, fillRate, volume }
  }, [rows])

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = []
    if (status) chips.push({ label: `Status: ${status}`, clear: () => { setStatus(""); setPage(1) } })
    if (side) chips.push({ label: `Side: ${side}`, clear: () => { setSide(""); setPage(1) } })
    if (type) chips.push({ label: `Type: ${type}`, clear: () => { setType(""); setPage(1) } })
    if (symbol) chips.push({ label: `Symbol: ${symbol}`, clear: () => { setSymbol(""); setPage(1) } })
    if (from) chips.push({ label: `From: ${from}`, clear: () => { setFrom(""); setPage(1) } })
    if (to) chips.push({ label: `To: ${to}`, clear: () => { setTo(""); setPage(1) } })
    if (userFilter)
      chips.push({ label: `User: ${userFilter}`, clear: () => { setUserFilter(""); setPage(1) } })
    return chips
  }, [status, side, type, symbol, from, to, userFilter])

  const clearAllFilters = () => {
    setStatus("")
    setSide("")
    setType("")
    setSymbol("")
    setFrom("")
    setTo("")
    setUserFilter("")
    setQ("")
    setPage(1)
  }

  // ── Inline edit handlers ───────────────────────────────────────────────────
  const startEdit = (row: OrderRow) => {
    setEditingId(row.id)
    setEditQty(String(row.quantity))
    setEditPrice(row.price != null ? String(row.price) : "")
    setEditType(row.orderType)
    setEditSide(row.orderSide)
    setEditStatus(row.status)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditQty("")
    setEditPrice("")
    setEditType("")
    setEditSide("")
    setEditStatus("")
  }

  const saveEdit = async (row: OrderRow) => {
    try {
      const normalizedQuantity =
        editQty !== "" ? normalizeOrdersManagementEditQuantity(editQty) : null
      const normalizedPrice =
        editPrice !== "" ? normalizeOrdersManagementEditPrice(editPrice) : null

      if (editQty !== "" && normalizedQuantity === null) {
        toast({ title: "Invalid quantity", description: "Must be a non-negative number.", variant: "destructive" })
        return
      }
      if (editPrice !== "" && normalizedPrice === null) {
        toast({ title: "Invalid price", description: "Must be a non-negative number.", variant: "destructive" })
        return
      }

      const payload: any = { orderId: row.id, updates: {} }
      if (editQty !== "" && normalizedQuantity !== null) payload.updates.quantity = normalizedQuantity
      payload.updates.price = editPrice === "" ? null : normalizedPrice
      if (editType) payload.updates.orderType = editType.toUpperCase() as any
      if (editSide) payload.updates.orderSide = editSide.toUpperCase() as any
      if (editStatus) payload.updates.status = editStatus.toUpperCase() as any

      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Save failed: ${res.status}` }))
        throw new Error(err.error || "Failed to save order")
      }

      cancelEdit()
      void fetchData()
      toast({ title: "Saved", description: "Order updated successfully." })
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message || "Save failed", variant: "destructive" })
    }
  }

  // ── Order actions ──────────────────────────────────────────────────────────
  const cancelOrder = async (row: OrderRow) => {
    if (!confirm(`Cancel order ${row.symbol} for ${row.clientId || row.id}?`)) return
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: row.id, action: "cancel" }),
      })
      if (!res.ok) throw new Error(`Cancel failed: ${res.status}`)
      toast({ title: "Order cancelled", description: `${row.symbol} order cancelled.` })
      void fetchData()
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message || "Cancel failed", variant: "destructive" })
    }
  }

  const executeOrder = async (row: OrderRow) => {
    if (!confirm(`Execute order ${row.symbol} for ${row.clientId || row.id}?`)) return
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: row.id, action: "execute" }),
      })
      if (!res.ok) throw new Error(`Execute failed: ${res.status}`)
      toast({ title: "Order executed", description: `${row.symbol} order executed.` })
      void fetchData()
    } catch (e: any) {
      toast({ title: "Execute failed", description: e?.message || "Execute failed", variant: "destructive" })
    }
  }

  // ── Bulk operations ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }

  const bulkCancel = async () => {
    if (!selectedIds.size) return
    if (!confirm(`Cancel ${selectedIds.size} selected order(s)?`)) return
    setBulkLoading(true)
    let success = 0
    let failed = 0
    const ids = Array.from(selectedIds)
    const total = ids.length
    for (const id of ids) {
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, action: "cancel" }),
        })
        if (res.ok) {
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    setBulkLoading(false)
    setSelectedIds(new Set())
    if (failed > 0) {
      toast({
        title: "Partial success",
        description: `${success} succeeded, ${failed} failed`,
        variant: "destructive"
      })
    } else {
      toast({ title: "Success", description: `${success} orders cancelled` })
    }
    void fetchData()
  }

  const bulkExecute = async () => {
    if (!selectedIds.size) return
    if (!confirm(`Execute ${selectedIds.size} selected order(s)?`)) return
    setBulkLoading(true)
    let success = 0
    let failed = 0
    const ids = Array.from(selectedIds)
    const total = ids.length
    for (const id of ids) {
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, action: "execute" }),
        })
        if (res.ok) {
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    setBulkLoading(false)
    setSelectedIds(new Set())
    if (failed > 0) {
      toast({
        title: "Partial success",
        description: `${success} succeeded, ${failed} failed`,
        variant: "destructive"
      })
    } else {
      toast({ title: "Success", description: `${success} orders executed` })
    }
    void fetchData()
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Monitor, filter, and manage all client orders"
        icon={<ListOrdered className="w-6 h-6 flex-shrink-0" />}
        actions={<RefreshButton onClick={fetchData} loading={loading} />}
      />

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="orders" className="text-xs sm:text-sm">
            All orders
          </TabsTrigger>
          <TabsTrigger value="charges" className="text-xs sm:text-sm">
            Order charges
          </TabsTrigger>
        </TabsList>

        {/* ── Orders tab ──────────────────────────────────────────────────── */}
        <TabsContent value="orders" className="mt-4 space-y-4">

          {/* Stats bar */}
          <div className="flex flex-wrap gap-3">
            <StatCard
              label="Pending"
              value={stats.pending}
              icon={<Clock className="w-4 h-4" />}
              colorClass="text-amber-500"
              active={status === "PENDING"}
              onClick={() => { setStatus(status === "PENDING" ? "" : "PENDING"); setPage(1) }}
            />
            <StatCard
              label="Executed"
              value={stats.executed}
              sub={`${stats.fillRate}% fill rate`}
              icon={<CheckCircle2 className="w-4 h-4" />}
              colorClass="text-emerald-500"
              active={status === "EXECUTED"}
              onClick={() => { setStatus(status === "EXECUTED" ? "" : "EXECUTED"); setPage(1) }}
            />
            <StatCard
              label="Cancelled"
              value={stats.cancelled}
              icon={<XCircle className="w-4 h-4" />}
              colorClass="text-red-500"
              active={status === "CANCELLED"}
              onClick={() => { setStatus(status === "CANCELLED" ? "" : "CANCELLED"); setPage(1) }}
            />
            <StatCard
              label="Volume (page)"
              value={formatRupeeCompact(stats.volume)}
              icon={<TrendingUp className="w-4 h-4" />}
              colorClass="text-blue-500"
            />
          </div>

          {/* Command bar */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                placeholder="Search symbol / user / instrument…"
                className="text-sm flex-1 min-w-[180px] max-w-xs h-9"
              />
              <Input
                value={userFilter}
                onChange={(e) => { setUserFilter(e.target.value); setPage(1) }}
                placeholder="Client ID or name…"
                className="text-sm w-44 h-9"
              />
              <Select
                value={status || "all"}
                onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1) }}
              >
                <SelectTrigger className="w-36 text-sm h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="EXECUTED">Executed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={side || "all"}
                onValueChange={(v) => { setSide(v === "all" ? "" : v); setPage(1) }}
              >
                <SelectTrigger className="w-28 text-sm h-9">
                  <SelectValue placeholder="Side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sides</SelectItem>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={type || "all"}
                onValueChange={(v) => { setType(v === "all" ? "" : v); setPage(1) }}
              >
                <SelectTrigger className="w-32 text-sm h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="MARKET">Market</SelectItem>
                  <SelectItem value="LIMIT">Limit</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setPage(1) }}
                placeholder="Symbol"
                className="text-sm w-28 h-9"
              />
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

          {/* Error */}
          {error && (
            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
              <AlertTitle className="text-red-500">Failed to load</AlertTitle>
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          {/* Table */}
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 pl-3">
                      <Checkbox
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onCheckedChange={selectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="text-muted-foreground text-xs whitespace-nowrap">Time</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Client</TableHead>
                    <TableHead className="text-muted-foreground text-xs min-w-[160px]">Instrument</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Order</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Qty</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Price</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Loading state */}
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-14">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Empty state */}
                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-14">
                        <p className="text-sm text-muted-foreground">No orders found</p>
                        {activeChips.length > 0 && (
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="mt-2 text-xs text-primary underline underline-offset-2"
                          >
                            Clear filters
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Data rows */}
                  {!loading &&
                    rows.map((r) => {
                      const isExpanded = expandedIds.has(r.id)
                      const isSelected = selectedIds.has(r.id)
                      const remaining = Math.max(0, r.quantity - r.filledQuantity)

                      return (
                        <React.Fragment key={r.id}>
                          <TableRow
                            className={[
                              "border-border cursor-pointer transition-colors",
                              isSelected ? "bg-primary/5" : "hover:bg-muted/20",
                              isExpanded ? "border-b-0" : "",
                            ].join(" ")}
                            onClick={(e) => {
                              const target = e.target as HTMLElement
                              if (target.closest("button,input,a,[role=checkbox],[data-radix-select-trigger]")) return
                              toggleExpand(r.id)
                            }}
                          >
                            {/* Checkbox */}
                            <TableCell
                              className="pl-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(r.id)}
                                aria-label={`Select order ${r.id}`}
                              />
                            </TableCell>

                            {/* Time */}
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {isExpanded ? (
                                  <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                                )}
                                {r.createdAt}
                              </div>
                            </TableCell>

                            {/* Client */}
                            <TableCell>
                              <div className="text-xs">
                                <code className="text-primary font-mono">{r.clientId || "—"}</code>
                                {r.userName && (
                                  <div className="text-muted-foreground text-[11px]">{r.userName}</div>
                                )}
                              </div>
                            </TableCell>

                            {/* Instrument */}
                            <TableCell>
                              <div className="text-xs">
                                <span className="font-bold font-mono text-foreground">{r.symbol}</span>
                                <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 border-border/60">
                                  {r.exchange}
                                </Badge>
                                {r.instrumentLabel && r.instrumentLabel !== r.symbol && (
                                  <div className="text-muted-foreground text-[11px] line-clamp-1 mt-0.5">
                                    {r.instrumentLabel}
                                  </div>
                                )}
                              </div>
                            </TableCell>

                            {/* Order (side + type) */}
                            <TableCell>
                              {editingId === r.id ? (
                                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Select value={editSide} onValueChange={setEditSide}>
                                    <SelectTrigger className="h-7 text-xs w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="BUY">BUY</SelectItem>
                                      <SelectItem value="SELL">SELL</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Select value={editType} onValueChange={setEditType}>
                                    <SelectTrigger className="h-7 text-xs w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="MARKET">MARKET</SelectItem>
                                      <SelectItem value="LIMIT">LIMIT</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <div className="text-xs">
                                  <Badge
                                    variant="outline"
                                    className={[
                                      "text-[10px] px-1.5 py-0 font-semibold",
                                      r.orderSide === "BUY"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                        : "bg-red-500/10 text-red-400 border-red-500/30",
                                    ].join(" ")}
                                  >
                                    {r.orderSide}
                                  </Badge>
                                  <div className="text-muted-foreground text-[11px] mt-0.5">{r.orderType}</div>
                                </div>
                              )}
                            </TableCell>

                            {/* Qty */}
                            <TableCell className="text-xs">
                              {editingId === r.id ? (
                                <Input
                                  value={editQty}
                                  onChange={(e) => setEditQty(e.target.value)}
                                  className="w-20 h-7 text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <div>
                                  <span className="font-semibold">{r.quantity}</span>
                                  {r.filledQuantity > 0 && (
                                    <div className="text-muted-foreground text-[11px]">
                                      {r.filledQuantity} filled / {remaining} left
                                    </div>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* Price */}
                            <TableCell className="text-xs">
                              {editingId === r.id ? (
                                <Input
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  className="w-24 h-7 text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <div>
                                  {r.price != null && (
                                    <div>₹{r.price.toLocaleString("en-IN")}</div>
                                  )}
                                  {r.averagePrice != null && (
                                    <div className="text-muted-foreground text-[11px]">
                                      Avg ₹{r.averagePrice.toLocaleString("en-IN")}
                                    </div>
                                  )}
                                  {r.ltp != null && (
                                    <div className="text-muted-foreground text-[11px]">
                                      LTP ₹{r.ltp.toLocaleString("en-IN")}
                                    </div>
                                  )}
                                  {r.price == null && r.averagePrice == null && "—"}
                                </div>
                              )}
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              {editingId === r.id ? (
                                <Select
                                  value={editStatus}
                                  onValueChange={setEditStatus}
                                >
                                  <SelectTrigger className="h-7 text-xs w-32" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PENDING">PENDING</SelectItem>
                                    <SelectItem value="EXECUTED">EXECUTED</SelectItem>
                                    <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <StatusBadge status={r.status} type="order" />
                                  {r.failureReason && (
                                    <span className="text-[10px] text-red-400 line-clamp-1">
                                      {r.failureReason}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* Actions */}
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {editingId === r.id ? (
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => saveEdit(r)}
                                    className="h-7 text-xs bg-primary hover:bg-primary/90 text-white px-2"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEdit}
                                    className="h-7 text-xs px-2"
                                  >
                                    Discard
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {r.status === "PENDING" && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2"
                                      onClick={() => executeOrder(r)}
                                    >
                                      <PlayCircle className="w-3 h-3 mr-1" />
                                      Execute
                                    </Button>
                                  )}
                                  {r.status === "PENDING" && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white px-2"
                                      onClick={() => cancelOrder(r)}
                                    >
                                      <Ban className="w-3 h-3 mr-1" />
                                      Cancel
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => startEdit(r)}
                                    className="h-7 text-xs px-2"
                                  >
                                    <Edit3 className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Expandable detail row */}
                          {isExpanded && (
                            <TableRow key={`${r.id}-detail`} className="border-border bg-muted/10">
                              <TableCell colSpan={9} className="py-0 px-0">
                                <div className="px-10 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-border/40">
                                  <div>
                                    <div className="text-muted-foreground mb-0.5">Blocked Margin</div>
                                    <div className="font-medium">
                                      {r.blockedMargin != null
                                        ? `₹${r.blockedMargin.toLocaleString("en-IN")}`
                                        : "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground mb-0.5">Placement Charges</div>
                                    <div className="font-medium">
                                      {r.placementCharges != null
                                        ? `₹${r.placementCharges.toLocaleString("en-IN")}`
                                        : "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground mb-0.5">Linked Position</div>
                                    <div className="font-mono text-primary text-[11px]">
                                      {r.positionId || "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground mb-0.5">Executed At</div>
                                    <div>{r.executedAt || "—"}</div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                </TableBody>
              </Table>
            </div>
          </div>

          <Pagination
            currentPage={page}
            totalPages={pages}
            onPageChange={setPage}
            loading={loading}
          />
        </TabsContent>

        {/* ── Charges tab ────────────────────────────────────────────────── */}
        <TabsContent value="charges" className="mt-4">
          <OrdersManagementOrderChargesTab />
        </TabsContent>
      </Tabs>

      {/* ── Sticky bulk-ops bar ────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-sm px-5 py-3 shadow-xl"
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
              onClick={bulkCancel}
              disabled={bulkLoading}
            >
              <Ban className="w-3.5 h-3.5 mr-1.5" />
              Cancel Selected
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              onClick={bulkExecute}
              disabled={bulkLoading}
            >
              <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
              Execute Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
