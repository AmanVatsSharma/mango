"use client"

/**
 * File:        components/admin-console/trades-blotter/trades-table.tsx
 * Module:      admin-console/trades-blotter
 * Purpose:     High-density paginated trade table with inline expand accordion, filter chips,
 *              and a sticky bulk-close bar. Actions live inside the expanded row, not a dropdown.
 *
 * Exports:
 *   - TradesTable(props)      — main table component
 *   - TradesTableScope        — discriminated union: "all" | "user" | "symbol"
 *
 * Depends on:
 *   - ./trade-row-expanded    — accordion content (includes action buttons)
 *   - ./filter-slot-context   — portal target for the filter bar
 *   - @/app/api/admin/trades/types — TradeRow, TradesListResponse
 *
 * Side-effects: GET /api/admin/trades (polling every 3 s when open rows exist; paused while a dialog is open or the tab is backgrounded)
 *
 * Key invariants:
 *   - COLSPAN_ALL = 10 (includes Client col), COLSPAN_OTHER = 9 (no Client col)
 *   - Entry timestamp lives below Entry ₹; exit timestamp lives below Exit/LTP
 *   - Actions column removed — all actions are in TradeRowExpanded
 *   - Poll cadence (3s) is tuned to the backend live-price ladder on /api/admin/trades —
 *     the route overlays live mark + recomputed PnL on open rows, so faster polling shows
 *     real ticks (not just stale DB columns).
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 *   - Trading-3u3: tighten poll cadence 10s → 3s + visibility guard to surface live PnL ticks.
 */

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { TradesFilterSlotContext } from "./filter-slot-context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Ban, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react"
import { Pagination } from "../shared/pagination"
import { toast } from "@/hooks/use-toast"
import type {
  TradeRow,
  TradesListResponse,
  TradeStatus,
  TradeSide,
  ClosureReason,
} from "@/app/api/admin/trades/types"
import {
  formatTradesBlotterDuration,
  formatTradesBlotterRupees,
  tradesBlotterPnlClass,
  tradesBlotterSideClass,
  tradesBlotterStatusClass,
} from "@/components/admin-console/trades-blotter-number-utils"
import { TradeRowExpanded } from "./trade-row-expanded"

export type TradesTableScope =
  | { kind: "all" }
  | { kind: "user"; userId: string; clientId?: string | null }
  | { kind: "symbol"; symbol: string; segment: string | null }

const COLSPAN_ALL = 10
const COLSPAN_OTHER = 9

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-medium">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 hover:text-destructive transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return iso
  }
}

export function TradesTable({
  scope,
  onUserClick,
  pausedAutoRefresh,
  refreshKey = 0,
}: {
  scope: TradesTableScope
  onUserClick?: (userId: string, clientId: string | null, name: string | null) => void
  pausedAutoRefresh?: boolean
  refreshKey?: number
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TradeRow[]>([])
  const [total, setTotal] = useState<number>(0)
  const [page, setPage] = useState<number>(1)
  const [pages, setPages] = useState<number>(1)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sideFilter, setSideFilter] = useState<string>("ALL")
  const [symbolFilter, setSymbolFilter] = useState<string>(scope.kind === "symbol" ? scope.symbol : "")
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")

  // Row interaction
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)

  useEffect(() => {
    setPage(1)
    setExpandedIds(new Set())
    setSelectedIds(new Set())
    if (scope.kind === "symbol") setSymbolFilter(scope.symbol)
    else if (scope.kind === "all") setSymbolFilter("")
  }, [scope])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", "50")
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (sideFilter !== "ALL") p.set("side", sideFilter)
    if (symbolFilter) p.set("symbol", symbolFilter)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (scope.kind === "user") p.set("userId", scope.userId)
    if (scope.kind === "symbol" && scope.segment) p.set("segment", scope.segment)
    return p
  }, [page, statusFilter, sideFilter, symbolFilter, from, to, scope])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/trades?${query.toString()}`)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data: TradesListResponse = await res.json()
      setRows(data.trades || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load trades")
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void fetchData() }, [fetchData, refreshKey])

  useEffect(() => {
    if (pausedAutoRefresh || actionDialogOpen || bulkOpen) return
    const hasOpen = rows.some((r) => r.status !== "CLOSED")
    if (!hasOpen) return
    // 3s cadence matches the positions tab — backend overlays live price + recomputed PnL on
    // open rows from the Redis market-quote ladder, so faster polling actually shows live ticks.
    // Pauses while a dialog is open so we don't yank the user's row mid-edit.
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void fetchData()
    }, 3_000)
    return () => window.clearInterval(id)
  }, [pausedAutoRefresh, actionDialogOpen, bulkOpen, rows, fetchData])

  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = []
    if (statusFilter !== "all") chips.push({ label: `Status: ${statusFilter}`, clear: () => { setStatusFilter("all"); setPage(1) } })
    if (sideFilter !== "ALL") chips.push({ label: `Side: ${sideFilter}`, clear: () => { setSideFilter("ALL"); setPage(1) } })
    if (symbolFilter && scope.kind !== "symbol")
      chips.push({ label: `Symbol: ${symbolFilter}`, clear: () => { setSymbolFilter(""); setPage(1) } })
    if (from) chips.push({ label: `From: ${from}`, clear: () => { setFrom(""); setPage(1) } })
    if (to) chips.push({ label: `To: ${to}`, clear: () => { setTo(""); setPage(1) } })
    return chips
  }, [statusFilter, sideFilter, symbolFilter, from, to, scope.kind])

  const clearAll = () => {
    setStatusFilter("all"); setSideFilter("ALL")
    if (scope.kind !== "symbol") setSymbolFilter("")
    setFrom(""); setTo(""); setPage(1)
  }

  const toggleExpand = (id: string) => setExpandedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    return next
  })

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    return next
  })

  const filterSlotEl = useContext(TradesFilterSlotContext)
  const openSelectable = rows.filter((r) => r.status !== "CLOSED")

  const selectAllOpen = () => {
    if (openSelectable.length > 0 && openSelectable.every((r) => selectedIds.has(r.positionId))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(openSelectable.map((r) => r.positionId)))
    }
  }

  const COLSPAN = scope.kind === "all" ? COLSPAN_ALL : COLSPAN_OTHER

  const filterBar = (
    <div className="flex flex-wrap items-center gap-1.5 justify-end">
      <span className="text-[11px] text-muted-foreground tabular-nums mr-1">
        {total.toLocaleString("en-IN")} trades
      </span>
      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
        <SelectTrigger className="w-[104px] h-7 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sideFilter} onValueChange={(v) => { setSideFilter(v); setPage(1) }}>
        <SelectTrigger className="w-[88px] h-7 text-xs"><SelectValue placeholder="Side" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All sides</SelectItem>
          <SelectItem value="LONG">Long</SelectItem>
          <SelectItem value="SHORT">Short</SelectItem>
        </SelectContent>
      </Select>
      {scope.kind !== "symbol" && (
        <Input
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value.toUpperCase()); setPage(1) }}
          placeholder="Symbol"
          className="w-[96px] h-7 text-xs"
        />
      )}
      <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="w-[128px] h-7 text-xs" aria-label="From date" />
      <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="w-[128px] h-7 text-xs" aria-label="To date" />
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void fetchData()} disabled={loading}>
        <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-1.5">
      {filterSlotEl ? createPortal(filterBar, filterSlotEl) : <div className="shrink-0">{filterBar}</div>}

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          {activeChips.map((chip) => <FilterChip key={chip.label} label={chip.label} onRemove={chip.clear} />)}
          <button type="button" onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
            Clear all
          </button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 py-2">
          <AlertTitle className="text-red-500 text-xs">Failed to load</AlertTitle>
          <AlertDescription className="text-red-400 text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 min-h-0 rounded-lg border border-border/60 overflow-hidden bg-card">
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="w-9 pl-3">
                  <Checkbox
                    checked={openSelectable.length > 0 && openSelectable.every((r) => selectedIds.has(r.positionId))}
                    onCheckedChange={selectAllOpen}
                    aria-label="Select all open"
                  />
                </TableHead>
                {scope.kind === "all" && (
                  <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Client</TableHead>
                )}
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider min-w-[160px]">Instrument</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Side</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Qty</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Entry ₹</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Exit / LTP</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Held</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">P&amp;L</TableHead>
                <TableHead className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center py-14">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center py-14">
                    <p className="text-sm text-muted-foreground">No trades found</p>
                    {activeChips.length > 0 && (
                      <button type="button" onClick={clearAll} className="mt-2 text-xs text-primary underline underline-offset-2">
                        Clear filters
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const isExpanded = expandedIds.has(r.positionId)
                const isSelected = selectedIds.has(r.positionId)
                const displayPnl = r.status === "CLOSED" ? r.realizedPnL : r.unrealizedPnL + r.realizedPnL

                // Exit/LTP cell value
                const exitDisplay = r.averageExitPrice != null
                  ? { price: r.averageExitPrice, label: null, isLtp: false }
                  : r.ltp != null
                    ? { price: r.ltp, label: "LTP", isLtp: true }
                    : null

                return (
                  <React.Fragment key={r.positionId}>
                    <TableRow
                      className={[
                        "border-border/40 cursor-pointer transition-colors group",
                        isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                        isExpanded ? "border-b-0 bg-muted/20" : "",
                      ].join(" ")}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,input,a,[role=checkbox],[data-radix-select-trigger]")) return
                        toggleExpand(r.positionId)
                      }}
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          disabled={r.status === "CLOSED"}
                          onCheckedChange={() => toggleSelect(r.positionId)}
                          aria-label={`Select trade ${r.positionId}`}
                        />
                      </TableCell>

                      {/* Client (all scope only) */}
                      {scope.kind === "all" && (
                        <TableCell
                          onClick={(e) => { e.stopPropagation(); if (r.userId && onUserClick) onUserClick(r.userId, r.clientId, r.userName) }}
                          className="cursor-pointer hover:text-primary"
                        >
                          <div className="text-xs">
                            <code className="text-primary font-mono text-[11px]">{r.clientId || "—"}</code>
                            {r.userName && <div className="text-muted-foreground text-[10px] leading-tight truncate max-w-[90px]">{r.userName}</div>}
                          </div>
                        </TableCell>
                      )}

                      {/* Instrument — chevron lives here */}
                      <TableCell>
                        <div className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-bold font-mono text-foreground text-xs">{r.symbol}</span>
                              {r.segment && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/50 leading-tight h-3.5">
                                  {r.segment}
                                </Badge>
                              )}
                            </div>
                            {r.instrumentLabel && r.instrumentLabel !== r.symbol && (
                              <div className="text-muted-foreground text-[10px] leading-tight truncate max-w-[180px] mt-0.5">
                                {r.instrumentLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Side */}
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold ${tradesBlotterSideClass(r.side)}`}>
                          {r.side}
                        </Badge>
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-xs tabular-nums">
                        <div className="font-semibold text-foreground">{r.totalQuantity}</div>
                        {r.lotSize > 1 && (
                          <div className="text-[10px] text-muted-foreground">
                            {Math.round(r.totalQuantity / r.lotSize)}L
                          </div>
                        )}
                      </TableCell>

                      {/* Entry ₹ + entry datetime below */}
                      <TableCell className="tabular-nums">
                        <div className="text-xs font-semibold text-foreground">
                          ₹{r.averageEntryPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[9px] text-muted-foreground leading-tight font-mono mt-0.5">
                          {fmtDateTime(r.entryAt)}
                        </div>
                      </TableCell>

                      {/* Exit / LTP + exit datetime below */}
                      <TableCell className="tabular-nums">
                        {exitDisplay ? (
                          <>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xs font-semibold text-foreground">
                                ₹{exitDisplay.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </span>
                              {exitDisplay.label && (
                                <span className="text-[9px] text-sky-500 font-semibold">{exitDisplay.label}</span>
                              )}
                            </div>
                            <div className="text-[9px] text-muted-foreground leading-tight font-mono mt-0.5">
                              {exitDisplay.isLtp ? "live" : fmtDateTime(r.exitAt)}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Held */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTradesBlotterDuration(r.heldMs)}
                      </TableCell>

                      {/* P&L */}
                      <TableCell
                        className={`text-xs font-bold tabular-nums ${tradesBlotterPnlClass(displayPnl)}`}
                        title={`Gross ${formatTradesBlotterRupees(r.grossPnL)} · Charges ${formatTradesBlotterRupees(r.charges)}`}
                      >
                        {formatTradesBlotterRupees(displayPnl)}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${tradesBlotterStatusClass(r.status)}`}>
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow key={`${r.positionId}-detail`} className="border-border/40 bg-muted/5">
                        <TableCell colSpan={COLSPAN} className="p-0">
                          <TradeRowExpanded
                            trade={r}
                            onChanged={() => void fetchData()}
                            onPauseAutoRefresh={setActionDialogOpen}
                          />
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

      <div className="shrink-0">
        <Pagination currentPage={page} totalPages={pages} onPageChange={setPage} loading={loading} />
      </div>

      {/* Bulk-ops sticky bar */}
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
              {selectedIds.size} open trade{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white text-xs" onClick={() => setBulkOpen(true)}>
              <Ban className="w-3.5 h-3.5 mr-1.5" />
              Bulk force-close
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground">
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkCloseDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        positionIds={Array.from(selectedIds)}
        onDone={() => { setSelectedIds(new Set()); void fetchData() }}
      />
    </div>
  )
}

// ─── Bulk close dialog ───────────────────────────────────────────────────────

function BulkCloseDialog({
  open,
  onOpenChange,
  positionIds,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  positionIds: string[]
  onDone: () => void
}) {
  const [reason, setReason] = useState<ClosureReason>("ADMIN_CLOSED")
  const [note, setNote] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (positionIds.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/trades/bulk-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionIds, reason, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `Bulk close failed: ${res.status}`)
      toast({ title: `Closed ${data.successes} / ${data.total}`, description: data.failures > 0 ? `${data.failures} failed` : "All positions closed" })
      onOpenChange(false)
      onDone()
    } catch (e: unknown) {
      toast({ title: "Bulk close failed", description: e instanceof Error ? e.message : "Bulk close failed", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk force-close {positionIds.length} position(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Each position uses its last known market price for exit. Margin is refunded and realized P&L booked per position. Partial failures are reported.
          </p>
          <div>
            <Label htmlFor="bulk-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ClosureReason)}>
              <SelectTrigger id="bulk-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN_CLOSED">Admin closed</SelectItem>
                <SelectItem value="AUTO_LIQUIDATED">Auto liquidated (risk)</SelectItem>
                <SelectItem value="EXPIRY_SQUAREOFF">Expiry square-off</SelectItem>
                <SelectItem value="MANUAL_OTHER">Manual (other)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bulk-note">Note (optional)</Label>
            <Input id="bulk-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={submit} disabled={submitting}>
            {submitting ? "Closing…" : `Close ${positionIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { TradeStatus, TradeSide }
