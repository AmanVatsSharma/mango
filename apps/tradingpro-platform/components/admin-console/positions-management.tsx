/**
 * @file positions-management.tsx
 * @module admin-console
 * @description Enhanced positions management with professional editing dialog
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06 — 7-column grid: merged Pos/Price/P&L cells; client Hover Card + copy; hover-card UI primitive.
 *
 * Notes:
 * - Positions table shows LTP from API `currentPrice` (worker/Redis) with `Stock.ltp` fallback.
 * - SSE PnL patches apply `ltp` from `currentPrice` only with `quoteReceivedAtMs` when MTM mode is live-quote-preferred (avoids stale-mark flashes).
 */

"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Copy, Edit, Boxes, Info, X, TrendingUp, TrendingDown, AlertTriangle, ChevronUp, ChevronDown as ChevronDownIcon, ChevronsUpDown, MoreHorizontal, RefreshCw, ChevronRight } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { PositionEditDialog } from "./position-edit-dialog"
import { PageHeader, RefreshButton, Pagination } from "./shared"
import { useSession } from "next-auth/react"
import { useSharedSSE } from "@/lib/hooks/use-shared-sse"
import { useAdminPnLSSE, type AdminPnlBatch } from "@/hooks/admin/use-admin-pnl-sse"
import { toast } from "@/hooks/use-toast"
import {
  normalizeCreatePositionLotSize,
  normalizeCreatePositionPrice,
  normalizeCreatePositionQuantity,
  normalizePositionsManagementFinite,
  normalizePositionsManagementNonNegative,
  normalizePositionsManagementNullableNonNegative,
  normalizePositionsManagementPage,
} from "@/components/admin-console/positions-management-number-utils"
import { getAdminConsoleRoute } from "@/lib/branding-routes"
import {
  resolveAdminPositionPnLForDisplay,
  sumAdminClosedBookedPnL,
  sumAdminOpenDayPnL,
  sumAdminOpenUnrealizedPnL,
} from "@/components/admin-console/positions-management-pnl-display"
import { cn } from "@/lib/utils"
import {
  formatCompactExpiry,
  formatStrikePrice,
  getExchangeBadge,
  isEquitySegment,
  isMCXInstrument,
  isSegmentFuturesOrCommodity,
  isSegmentOption,
} from "@/lib/market-data/instrument-summary"

function createAdminRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `adm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseAdminApiError(
  payload: unknown,
  status: number,
  requestIdHeader: string | null,
): { title: string; description: string } {
  const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const code = typeof rec.code === "string" ? rec.code : `HTTP_${status}`
  const msg =
    (typeof rec.message === "string" && rec.message) ||
    (typeof rec.error === "string" && rec.error) ||
    `Request failed (${status})`
  const bodyRid = typeof rec.requestId === "string" ? rec.requestId : null
  const rid = bodyRid || requestIdHeader
  return {
    title: code,
    description: rid ? `${msg} • ref ${rid}` : msg,
  }
}

/** Mark / LTP: prefer merged `currentPrice` from server PnL snapshot, else persisted stock LTP. */
function resolveAdminPositionLtpFromApiPayload(p: Record<string, unknown>): number | null {
  const fromMark = normalizePositionsManagementFinite((p as { currentPrice?: unknown }).currentPrice)
  if (fromMark !== null && fromMark > 0) {
    return fromMark
  }
  const stock = (p as { Stock?: { ltp?: unknown } }).Stock
  const fromStock = normalizePositionsManagementFinite(stock?.ltp)
  if (fromStock !== null && fromStock > 0) {
    return fromStock
  }
  return null
}

/** Compact IST-friendly time for dense admin grid (full timestamp via cell title). */
function formatAdminPositionTableTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    })
  } catch {
    return "—"
  }
}

function AdminPositionStatusDot({ status }: { status: "OPEN" | "CLOSED" }) {
  const isOpen = status === "OPEN"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={isOpen ? "Open" : "Closed"}
          className={cn(
            "inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background cursor-default transition-opacity hover:opacity-90",
            isOpen ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{isOpen ? "Open" : "Closed"}</TooltipContent>
    </Tooltip>
  )
}

interface PositionRow {
  id: string
  createdAtLabel: string
  createdAtIso: string
  clientId?: string
  userName?: string
  symbol: string
  stockId: string
  tradingAccountId: string
  productType: string
  instrumentId: string | null
  quantity: number
  side: "LONG" | "SHORT" | "FLAT"
  status: "OPEN" | "CLOSED"
  segment: string | null
  lotSize: number
  openLots: number | null
  averagePrice: number
  stopLoss?: number | null
  target?: number | null
  unrealizedPnL?: number
  dayPnL?: number
  /** Last traded / mark price for open rows (server snapshot or stock LTP). */
  ltp: number | null
  exchange: string | null
  stockName: string | null
  optionType: string | null
  expiry: string | null
  strikePrice: number | null
}

function AdminPositionSymbolStack(
  r: Pick<
    PositionRow,
    | "symbol"
    | "status"
    | "quantity"
    | "segment"
    | "exchange"
    | "optionType"
    | "productType"
    | "stockName"
    | "expiry"
    | "strikePrice"
    | "lotSize"
  >,
) {
  const opt = r.optionType
  const isFutures = isSegmentFuturesOrCommodity(r.segment, opt)
  const isOption = isSegmentOption(r.segment, opt)
  const isEquity = isEquitySegment(r.segment, r.exchange, opt)
  const isMCX = isMCXInstrument(r.exchange, r.segment)
  const exchangeBadge = getExchangeBadge(r.exchange, r.segment)
  const expiryCompact = r.expiry ? formatCompactExpiry(r.expiry) : ""
  const strikeStr = formatStrikePrice(r.strikePrice)
  const isOpen = r.status === "OPEN"
  const showName =
    Boolean(r.stockName?.trim()) &&
    r.stockName!.toUpperCase() !== (r.symbol || "").toUpperCase()
  const showFoMeta = isFutures || isOption

  return (
    <div className="flex flex-col gap-1 min-w-0 max-w-[280px] align-top">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="font-mono font-bold text-[13px] text-zinc-950 dark:text-[#f4f4f5] truncate max-w-[200px]"
          title={r.symbol}
        >
          {r.symbol}
        </span>
        {isOpen ? (
          <span
            className={cn(
              "text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none",
              r.quantity > 0
                ? "text-green-700 bg-green-100 dark:text-[#4ade80] dark:bg-[#052e16]"
                : r.quantity < 0
                  ? "text-red-700 bg-red-100 dark:text-red-500 dark:text-[#f87171] dark:bg-[#2d0707]"
                  : "text-zinc-500 dark:text-[#52525b] bg-zinc-200 dark:bg-[#1a1a22]",
            )}
          >
            {r.quantity > 0 ? "L" : r.quantity < 0 ? "S" : "—"}
          </span>
        ) : (
          <span className="text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none text-zinc-500 dark:text-[#52525b] bg-zinc-200 dark:bg-[#1a1a22]">
            CLO
          </span>
        )}
        <span className="text-[9px] font-mono font-bold px-1 py-px rounded-[2px] leading-none text-indigo-700 bg-indigo-100 dark:text-[#818cf8] dark:bg-[#1e1b4b]">
          {exchangeBadge.label}
        </span>
        {isOpen ? (
          <span className="text-[9px] font-mono text-blue-700 bg-blue-100 dark:text-blue-600 dark:text-[#60a5fa] dark:bg-[#1e3a5f] px-1 py-px rounded-[2px]">
            {r.productType}
          </span>
        ) : null}
        {isFutures && isOpen ? (
          <span className="text-[9px] font-mono text-cyan-700 bg-cyan-100 dark:text-[#22d3ee] dark:bg-[#0a3342] px-1 py-px rounded-[2px]">
            FUT
          </span>
        ) : null}
        {isOption && isOpen ? (
          <span className="text-[9px] font-mono text-amber-800 bg-amber-100 dark:text-[#fbbf24] dark:bg-[#2d1f00] px-1 py-px rounded-[2px]">
            {opt || "OPT"}
          </span>
        ) : null}
        {isEquity && !isMCX && isOpen ? (
          <span className="text-[9px] font-mono text-zinc-700 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800 px-1 py-px rounded-[2px]">
            EQ
          </span>
        ) : null}
      </div>
      {showName ? (
        <span
          className="text-[10px] font-mono text-zinc-500 dark:text-[#52525b] truncate"
          title={r.stockName!}
        >
          {r.stockName}
        </span>
      ) : null}
      {showFoMeta && (expiryCompact || (strikeStr && isOption) || r.lotSize > 1) ? (
        <div className="flex flex-wrap gap-1">
          {expiryCompact ? (
            <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
              EXP {expiryCompact}
            </span>
          ) : null}
          {strikeStr && isOption ? (
            <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
              {strikeStr}
            </span>
          ) : null}
          {r.lotSize > 1 ? (
            <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
              Lot {r.lotSize}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AdminPositionMergedPosCell({
  status,
  quantity,
  openLots,
}: {
  status: PositionRow["status"]
  quantity: number
  openLots: number | null
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 text-center min-w-[3.25rem]">
      <div className="flex items-center justify-center gap-1.5">
        <AdminPositionStatusDot status={status} />
        <span
          className={cn(
            "text-[11px] font-medium tabular-nums",
            quantity > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : quantity < 0
                ? "text-red-600 dark:text-red-400"
                : "text-foreground",
          )}
        >
          {quantity > 0 ? "+" : ""}
          {quantity}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
        {openLots !== null ? `Lots ${openLots}` : "—"}
      </span>
    </div>
  )
}

function AdminPositionMergedPriceCell({
  averagePrice,
  ltpNode,
  stopLoss,
  target,
}: {
  averagePrice: number
  ltpNode: ReactNode
  stopLoss?: number | null
  target?: number | null
}) {
  const hasSl = stopLoss != null && Number.isFinite(stopLoss)
  const hasTp = target != null && Number.isFinite(target)
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-[11px] tabular-nums text-foreground">{averagePrice}</span>
      <div className="text-[11px] tabular-nums w-full flex justify-end">{ltpNode}</div>
      {hasSl ? (
        <span className="text-[10px] text-muted-foreground tabular-nums">SL {stopLoss}</span>
      ) : null}
      {hasTp ? (
        <span className="text-[10px] text-muted-foreground tabular-nums">TP {target}</span>
      ) : null}
    </div>
  )
}

function AdminPositionMergedPnlCell({
  status,
  openUnrealized,
  openDay,
  closedBooked,
}: {
  status: PositionRow["status"]
  openUnrealized: number | null
  openDay: number | null
  closedBooked: number | null
}) {
  if (status === "OPEN") {
    const primary =
      openUnrealized === null ? (
        <span className="text-[11px] text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            openUnrealized >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {openUnrealized >= 0 ? "+" : ""}
          {openUnrealized}
        </span>
      )
    const dayLine =
      openDay === null ? (
        <span className="text-[10px] text-muted-foreground tabular-nums">Day —</span>
      ) : (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Day {openDay >= 0 ? "+" : ""}
          {openDay}
        </span>
      )
    return (
      <div className="flex flex-col items-end gap-0.5 text-right">
        {primary}
        {dayLine}
      </div>
    )
  }
  if (closedBooked === null) {
    return <span className="text-[11px] text-muted-foreground">—</span>
  }
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span
        className={cn(
          "text-[11px] font-medium tabular-nums text-muted-foreground",
          closedBooked >= 0
            ? "text-emerald-600/75 dark:text-emerald-400/75"
            : "text-red-600/75 dark:text-red-400/75",
        )}
      >
        {closedBooked >= 0 ? "+" : ""}
        {closedBooked}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums leading-none">Booked</span>
    </div>
  )
}

async function copyAdminClipboardField(label: string, value: string): Promise<void> {
  const v = value.trim()
  if (!v) {
    toast({ title: "Nothing to copy", variant: "destructive" })
    return
  }
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    toast({ title: "Copy failed", description: "Clipboard not available.", variant: "destructive" })
    return
  }
  try {
    await navigator.clipboard.writeText(v)
    toast({ title: "Copied", description: `${label} copied to clipboard.` })
  } catch {
    toast({ title: "Copy failed", description: "Clipboard permission denied.", variant: "destructive" })
  }
}

function AdminClientHoverCell(
  row: Pick<PositionRow, "clientId" | "userName" | "tradingAccountId">,
) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="min-w-0 w-full max-w-[6.5rem] rounded-md text-left cursor-default hover:bg-muted/35 px-0.5 py-0.5 -mx-0.5 -my-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="font-mono text-[11px] text-foreground truncate">{row.clientId || "—"}</div>
          {row.userName ? (
            <div className="text-[10px] text-muted-foreground truncate">{row.userName}</div>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-72">
        <div className="p-3 space-y-3">
          <p className="text-xs font-semibold text-foreground">Client</p>
          <dl className="space-y-3 text-xs">
            <div className="space-y-1">
              <dt className="text-muted-foreground">Client ID</dt>
              <dd className="flex items-start justify-between gap-2">
                <span className="font-mono text-foreground break-all text-left">{row.clientId || "—"}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Copy client ID"
                  onClick={() => void copyAdminClipboardField("Client ID", row.clientId || "")}
                  disabled={!row.clientId}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </dd>
            </div>
            {row.userName ? (
              <div className="space-y-1">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="flex items-start justify-between gap-2">
                  <span className="text-foreground break-all text-left">{row.userName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Copy name"
                    onClick={() => void copyAdminClipboardField("Name", row.userName!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </dd>
              </div>
            ) : null}
            <div className="space-y-1">
              <dt className="text-muted-foreground">Trading account</dt>
              <dd className="flex items-start justify-between gap-2">
                <span className="font-mono text-foreground break-all text-left text-[11px]">
                  {row.tradingAccountId}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Copy trading account id"
                  onClick={() => void copyAdminClipboardField("Trading account", row.tradingAccountId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </dd>
            </div>
          </dl>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function getPositionRiskFlags(row: PositionRow): string[] {
  const flags: string[] = []
  if (row.status === "OPEN" && row.stopLoss && row.ltp) {
    const pct = Math.abs(row.ltp - row.stopLoss) / row.ltp
    if (pct < 0.015) flags.push("Near SL")
  }
  if (row.status === "OPEN" && (row.unrealizedPnL ?? 0) < -10000) flags.push("Big Loss")
  return flags
}

function formatRupeeCompact(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? "-" : val > 0 ? "+" : ""
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(2)}`
}

function PosFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-medium">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 hover:text-destructive transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

interface PositionsPnlMeta {
  pnlMode: "client" | "server"
  workerHealthy: boolean
  settingsSource: string
  positionsTabMtmDisplayMode: "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred"
  positionSquareOffPriceAuthority: "server" | "client_assisted"
  adminSquareOffAllowLastSubscriptionTick: boolean
  positionCloseUseClientPriceWhenWithinBand: boolean
  adminPositionCloseMaxDeviationBps: number | null
  positionCloseReferenceDivergenceMaxBps: number | null
  heartbeat: {
    lastRunAtIso?: string
    host?: string
    pid?: number
    ageMs?: number | null
  } | null
}

export function PositionsManagement() {
  const router = useRouter()
  const sp = useSearchParams()
  const { data: session } = useSession()
  const adminUserId = (session?.user as any)?.id as string | undefined

  const [loading, setLoading] = useState(false)
  const [liveRefreshing, setLiveRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PositionRow[]>([])
  const [meta, setMeta] = useState<PositionsPnlMeta>({
    pnlMode: "client",
    workerHealthy: false,
    settingsSource: "default",
    positionsTabMtmDisplayMode: "live_quote_preferred",
    positionSquareOffPriceAuthority: "client_assisted",
    adminSquareOffAllowLastSubscriptionTick: false,
    positionCloseUseClientPriceWhenWithinBand: false,
    adminPositionCloseMaxDeviationBps: null,
    positionCloseReferenceDivergenceMaxBps: null,
    heartbeat: null,
  })
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState<number | null>(null)
  const [liveEnabled, setLiveEnabled] = useState(true)
  const [liveIntervalMs, setLiveIntervalMs] = useState(3000)
  const [page, setPage] = useState<number>(normalizePositionsManagementPage(sp.get("page")))
  const [pages, setPages] = useState<number>(1)

  const [userFilter, setUserFilter] = useState<string>(sp.get("user") || "")
  const [q, setQ] = useState<string>(sp.get("q") || "")
  const [symbol, setSymbol] = useState<string>(sp.get("symbol") || "")
  const [openOnly, setOpenOnly] = useState<boolean>((sp.get("openOnly") || "true").toLowerCase() === "true")
  const [productType, setProductType] = useState<string>("")
  const [side, setSide] = useState<string>("")

  // Row selection + sort state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<"pnl" | "symbol" | "time" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [bulkClosing, setBulkClosing] = useState(false)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    if (userFilter) p.set("user", userFilter)
    if (q) p.set("q", q)
    if (symbol) p.set("symbol", symbol)
    if (openOnly) p.set("openOnly", "true")
    return p
  }, [page, userFilter, q, symbol, openOnly])

  useEffect(() => {
    const base = getAdminConsoleRoute("positions")
    router.replace(`${base}?${params.toString()}`)
  }, [params, router])

  const fetchSeqRef = useRef(0)
  const sseRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const metaRef = useRef(meta)
  useEffect(() => {
    metaRef.current = meta
  }, [meta])

  const fetchData = useCallback(async (input?: { silent?: boolean; reason?: string }) => {
    const silent = input?.silent === true
    const nextSeq = fetchSeqRef.current + 1
    fetchSeqRef.current = nextSeq
    if (silent) {
      setLiveRefreshing(true)
    } else {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch(`/api/admin/positions?${params.toString()}&limit=50`)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      if (nextSeq !== fetchSeqRef.current) return
      const mapped: PositionRow[] = data.positions.map((p: any) => ({
        id: p.id,
        createdAtLabel: new Date(p.createdAt).toLocaleString(),
        createdAtIso: String(p.createdAt),
        clientId: p.tradingAccount?.user?.clientId,
        userName: p.tradingAccount?.user?.name,
        symbol: String(p.symbol || ""),
        stockId: typeof p.stockId === "string" ? p.stockId.trim() : String(p.stockId || ""),
        tradingAccountId:
          typeof p.tradingAccountId === "string"
            ? p.tradingAccountId.trim()
            : String(p.tradingAccount?.id || p.tradingAccountId || ""),
        productType: String(p.productType || "MIS").toUpperCase(),
        instrumentId: p.Stock?.instrumentId ? String(p.Stock.instrumentId) : null,
        quantity: Math.trunc(normalizePositionsManagementFinite(p.quantity)),
        side:
          Math.trunc(normalizePositionsManagementFinite(p.quantity)) > 0
            ? "LONG"
            : Math.trunc(normalizePositionsManagementFinite(p.quantity)) < 0
              ? "SHORT"
              : "FLAT",
        status: Math.trunc(normalizePositionsManagementFinite(p.quantity)) === 0 ? "CLOSED" : "OPEN",
        segment: p.Stock?.segment || null,
        lotSize: Math.max(1, Math.trunc(normalizePositionsManagementNonNegative(p.Stock?.lot_size, 1))),
        openLots:
          Math.max(1, Math.trunc(normalizePositionsManagementNonNegative(p.Stock?.lot_size, 1))) > 1
            ? Math.abs(
                Math.trunc(normalizePositionsManagementFinite(p.quantity)) /
                  Math.max(1, Math.trunc(normalizePositionsManagementNonNegative(p.Stock?.lot_size, 1))),
              )
            : null,
        averagePrice: normalizePositionsManagementNonNegative(p.averagePrice),
        stopLoss: normalizePositionsManagementNullableNonNegative(p.stopLoss),
        target: normalizePositionsManagementNullableNonNegative(p.target),
        unrealizedPnL: normalizePositionsManagementFinite(p.unrealizedPnL),
        dayPnL: normalizePositionsManagementFinite(p.dayPnL),
        ltp: resolveAdminPositionLtpFromApiPayload(p as Record<string, unknown>),
        exchange: typeof p.Stock?.exchange === "string" ? p.Stock.exchange : null,
        stockName: typeof p.Stock?.name === "string" ? p.Stock.name.trim() : null,
        optionType: p.Stock?.optionType != null ? String(p.Stock.optionType) : null,
        expiry: p.Stock?.expiry != null ? String(p.Stock.expiry) : null,
        strikePrice: normalizePositionsManagementNullableNonNegative(p.Stock?.strikePrice),
      }))
      setRows(mapped)
      setPages(data.pages || 1)
      setMeta({
        pnlMode: data?.meta?.pnlMode === "server" ? "server" : "client",
        workerHealthy: Boolean(data?.meta?.workerHealthy),
        settingsSource: String(data?.meta?.settingsSource || "unknown"),
        positionsTabMtmDisplayMode:
          data?.meta?.positionsTabMtmDisplayMode === "server_snapshot_preferred"
            ? "server_snapshot_preferred"
            : "live_quote_preferred",
        positionSquareOffPriceAuthority:
          data?.meta?.positionSquareOffPriceAuthority === "server" ? "server" : "client_assisted",
        adminSquareOffAllowLastSubscriptionTick: Boolean(
          data?.meta?.adminSquareOffAllowLastSubscriptionTick,
        ),
        positionCloseUseClientPriceWhenWithinBand: Boolean(
          data?.meta?.positionCloseUseClientPriceWhenWithinBand,
        ),
        adminPositionCloseMaxDeviationBps:
          typeof data?.meta?.adminPositionCloseMaxDeviationBps === "number"
            ? data.meta.adminPositionCloseMaxDeviationBps
            : null,
        positionCloseReferenceDivergenceMaxBps:
          typeof data?.meta?.positionCloseReferenceDivergenceMaxBps === "number"
            ? data.meta.positionCloseReferenceDivergenceMaxBps
            : null,
        heartbeat: data?.meta?.heartbeat || null,
      })
      setLastRefreshedAtMs(Date.now())
    } catch (e: any) {
      if (!silent) {
        setError(e.message || "Failed to load positions")
      }
    } finally {
      if (silent) {
        setLiveRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [params])

  useEffect(() => { void fetchData() }, [fetchData])

  const applyPnlUpdates = useCallback((updates: unknown) => {
    if (!Array.isArray(updates) || updates.length === 0) return

    const updatesByPositionId = new Map<
      string,
      { unrealizedPnL?: number; dayPnL?: number; ltp?: number }
    >()
    for (const update of updates) {
      const positionId = typeof (update as any)?.positionId === "string" ? (update as any).positionId : ""
      if (!positionId) continue

      const unrealizedCandidate = normalizePositionsManagementFinite((update as any)?.unrealizedPnL, Number.NaN)
      const dayCandidate = normalizePositionsManagementFinite((update as any)?.dayPnL, Number.NaN)
      const unrealizedPnL = Number.isFinite(unrealizedCandidate) ? unrealizedCandidate : undefined
      const dayPnL = Number.isFinite(dayCandidate) ? dayCandidate : undefined
      const priceCandidate = normalizePositionsManagementFinite((update as any)?.currentPrice, Number.NaN)
      let ltp =
        Number.isFinite(priceCandidate) && priceCandidate !== null && priceCandidate > 0
          ? priceCandidate
          : undefined
      const quoteTickMs = normalizePositionsManagementFinite((update as any)?.quoteReceivedAtMs, 0)
      const hasQuoteReceivedAt =
        Number.isFinite(quoteTickMs) && quoteTickMs > 0
      if (
        metaRef.current.positionsTabMtmDisplayMode === "live_quote_preferred" &&
        ltp !== undefined &&
        !hasQuoteReceivedAt
      ) {
        ltp = undefined
      }

      if (unrealizedPnL === undefined && dayPnL === undefined && ltp === undefined) continue

      updatesByPositionId.set(positionId, {
        unrealizedPnL,
        dayPnL,
        ...(ltp !== undefined ? { ltp } : {}),
      })
    }

    if (updatesByPositionId.size === 0) return

    setRows((prevRows) => {
      let changed = false
      const nextRows = prevRows.map((row) => {
        const update = updatesByPositionId.get(row.id)
        if (!update) return row
        const nextUnrealizedPnL = update.unrealizedPnL ?? row.unrealizedPnL
        const nextDayPnL = update.dayPnL ?? row.dayPnL
        const nextLtp = update.ltp !== undefined ? update.ltp : row.ltp
        if (
          nextUnrealizedPnL === row.unrealizedPnL &&
          nextDayPnL === row.dayPnL &&
          nextLtp === row.ltp
        ) {
          return row
        }
        changed = true
        return {
          ...row,
          unrealizedPnL: nextUnrealizedPnL,
          dayPnL: nextDayPnL,
          ltp: nextLtp,
        }
      })
      return changed ? nextRows : prevRows
    })

    setLastRefreshedAtMs(Date.now())
  }, [])

  const scheduleSseRefresh = useCallback((reason: string) => {
    if (!liveEnabled) return
    if (sseRefreshTimerRef.current) return
    sseRefreshTimerRef.current = setTimeout(() => {
      sseRefreshTimerRef.current = null
      void fetchData({ silent: true, reason: `sse:${reason}` })
    }, 150)
  }, [fetchData, liveEnabled])

  const { isConnected: isLiveSseConnected, connectionState: liveSseState } = useSharedSSE(
    adminUserId,
    useCallback(
      (message) => {
        if (message.event === "positions_pnl_updated") {
          applyPnlUpdates((message as any)?.data?.updates)
          return
        }
        if (
          message.event === "position_opened" ||
          message.event === "position_updated" ||
          message.event === "position_closed" ||
          message.event === "order_executed"
        ) {
          scheduleSseRefresh(message.event)
        }
      },
      [applyPnlUpdates, scheduleSseRefresh],
    ),
  )

  // Admin SSE: receives live PNL for ALL positions (not scoped to a single user).
  // This is the primary feed for the Positions Panel — it updates every position
  // as the market moves, even when the admin is browsing another user's positions.
  // Refetch triggers for open/close lifecycle events are handled by the per-user SSE above.
  useAdminPnLSSE(
    useCallback(
      (batch: AdminPnlBatch) => {
        if (batch.updates.length === 0) return
        // Map AdminPnlUpdate[] to the shape applyPnlUpdates expects.
        // applyPnlUpdates expects array items with positionId, unrealizedPnL, dayPnL, currentPrice.
        applyPnlUpdates(batch.updates as unknown as Parameters<typeof applyPnlUpdates>[0])
      },
      [applyPnlUpdates],
    ),
    { autoRecover: true },
  )

  useEffect(() => {
    if (!liveEnabled) return
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return
      void fetchData({ silent: true, reason: "interval" })
    }, Math.max(1500, liveIntervalMs))
    return () => clearInterval(timer)
  }, [fetchData, liveEnabled, liveIntervalMs])

  useEffect(() => {
    return () => {
      if (sseRefreshTimerRef.current) {
        clearTimeout(sseRefreshTimerRef.current)
      }
    }
  }, [])

  // Position edit dialog state
  const [editingPosition, setEditingPosition] = useState<PositionRow | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // Create Position dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [cpAccountId, setCpAccountId] = useState("")
  const [cpStockId, setCpStockId] = useState("")
  const [cpInstrumentId, setCpInstrumentId] = useState("")
  const [cpSymbol, setCpSymbol] = useState("")
  const [cpQty, setCpQty] = useState("")
  const [cpPrice, setCpPrice] = useState("")
  const [cpType, setCpType] = useState("MARKET")
  const [cpSide, setCpSide] = useState("BUY")
  const [cpProduct, setCpProduct] = useState("MIS")
  const [cpSegment, setCpSegment] = useState("NSE")
  const [cpLot, setCpLot] = useState("")
  const [cpErr, setCpErr] = useState<string | null>(null)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closingPosition, setClosingPosition] = useState<PositionRow | null>(null)
  const [closeMode, setCloseMode] = useState<"full" | "quantity" | "lots">("full")
  const [closeQuantityValue, setCloseQuantityValue] = useState("")
  const [closeLotsValue, setCloseLotsValue] = useState("")
  const [closeExitPriceValue, setCloseExitPriceValue] = useState("")
  const [closeErr, setCloseErr] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeExitMode, setCloseExitMode] = useState<"live" | "stock_ltp" | "manual">("live")
  const [closeScope, setCloseScope] = useState<"row" | "net">("row")

  const dashboardSummary = useMemo(() => {
    let open = 0
    let closed = 0
    let longs = 0
    let shorts = 0
    for (const row of rows) {
      if (row.status === "OPEN") open += 1
      if (row.status === "CLOSED") closed += 1
      if (row.side === "LONG") longs += 1
      if (row.side === "SHORT") shorts += 1
    }
    const totalOpenUnrealized = sumAdminOpenUnrealizedPnL(rows, normalizePositionsManagementFinite)
    const totalOpenDay = sumAdminOpenDayPnL(rows, normalizePositionsManagementFinite)
    const totalClosedBooked = sumAdminClosedBookedPnL(rows, normalizePositionsManagementFinite)
    return { open, closed, longs, shorts, totalOpenUnrealized, totalOpenDay, totalClosedBooked }
  }, [rows])

  // Client-side sorted rows
  const sortedRows = useMemo(() => {
    if (!sortField) return rows
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortField === "pnl") {
        const aVal = a.unrealizedPnL ?? 0
        const bVal = b.unrealizedPnL ?? 0
        cmp = aVal - bVal
      } else if (sortField === "symbol") {
        cmp = a.symbol.localeCompare(b.symbol)
      } else if (sortField === "time") {
        cmp = a.createdAtIso.localeCompare(b.createdAtIso)
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, sortField, sortDir])

  // Client-side filters applied on top of sorted rows (productType + side are not URL params)
  const filteredRows = useMemo(() => {
    let result = sortedRows
    if (productType) result = result.filter((r) => r.productType === productType)
    if (side === "LONG") result = result.filter((r) => r.side === "LONG")
    else if (side === "SHORT") result = result.filter((r) => r.side === "SHORT")
    else if (side === "CLOSED") result = result.filter((r) => r.status === "CLOSED")
    return result
  }, [sortedRows, productType, side])

  const riskSummary = useMemo(() => {
    let nearSl = 0
    let bigLoss = 0
    for (const r of rows) {
      const flags = getPositionRiskFlags(r)
      if (flags.includes("Near SL")) nearSl++
      if (flags.includes("Big Loss")) bigLoss++
    }
    return { nearSl, bigLoss }
  }, [rows])

  const toggleSort = (field: "pnl" | "symbol" | "time") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)))
    }
  }

  const bulkCloseAtLtp = async () => {
    const openSelected = rows.filter((r) => selectedIds.has(r.id) && r.status === "OPEN")
    if (!openSelected.length) return
    if (!confirm(`Close ${openSelected.length} open position(s) at LTP?`)) return
    setBulkClosing(true)
    let done = 0
    for (const pos of openSelected) {
      try {
        const requestId = createAdminRequestId()
        const res = await fetch("/api/admin/positions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ positionId: pos.id, action: "close", exitPriceMode: "live" }),
        })
        if (res.ok) done++
        toast({ title: `Closing ${done}/${openSelected.length} positions…` })
      } catch {}
    }
    setBulkClosing(false)
    setSelectedIds(new Set())
    toast({ title: `Closed ${done}/${openSelected.length} positions at LTP` })
    void fetchData({ silent: true, reason: "bulk_close" })
  }

  const formatLtpCell = (status: PositionRow["status"], ltp: number | null) => {
    if (status === "CLOSED") {
      return <span className="text-[11px] text-muted-foreground">—</span>
    }
    if (ltp === null || !Number.isFinite(ltp) || ltp <= 0) {
      return <span className="text-[11px] text-muted-foreground">—</span>
    }
    return <span className="font-mono text-[11px] tabular-nums text-foreground">{ltp.toFixed(2)}</span>
  }

  function PnlHeaderTip(props: { label: string; tip: string }) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {props.label}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="inline-flex text-muted-foreground hover:text-foreground" aria-label="Info">
              <Info className="w-3 h-3 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{props.tip}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  const submitCreate = async () => {
    setCpErr(null)
    try {
      const normalizedQuantity = normalizeCreatePositionQuantity(cpQty)
      if (normalizedQuantity === null) {
        throw new Error("Quantity must be a positive integer")
      }
      const normalizedLotSize = normalizeCreatePositionLotSize(cpLot)
      const normalizedPrice = cpType === "LIMIT" ? normalizeCreatePositionPrice(cpPrice) : null
      if (cpType === "LIMIT" && normalizedPrice === null) {
        throw new Error("Price must be a positive number for LIMIT orders")
      }
      const payload: any = {
        tradingAccountId: cpAccountId.trim(),
        stockId: cpStockId.trim(),
        instrumentId: cpInstrumentId.trim() || undefined,
        symbol: cpSymbol.trim().toUpperCase(),
        quantity: normalizedQuantity,
        price: cpType === 'LIMIT' ? normalizedPrice : undefined,
        orderType: cpType,
        orderSide: cpSide,
        productType: cpProduct,
        segment: cpSegment,
        lotSize: normalizedLotSize
      }
      const res = await fetch('/api/admin/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.error || `Create failed: ${res.status}`)
      }
      setCreateOpen(false)
      // reset fields
      setCpAccountId(""); setCpStockId(""); setCpInstrumentId(""); setCpSymbol(""); setCpQty(""); setCpPrice(""); setCpType("MARKET"); setCpSide("BUY"); setCpProduct("MIS"); setCpSegment("NSE"); setCpLot("")
      void fetchData()
      toast({ title: "Position created", description: "Admin create order executed successfully." })
    } catch (e: any) {
      setCpErr(e.message || 'Create failed')
    }
  }

  const startEdit = (row: PositionRow) => {
    setEditingPosition(row)
    setEditDialogOpen(true)
  }

  const siblingOpenRowsForClose = useMemo(() => {
    if (!closingPosition) return [] as PositionRow[]
    return rows.filter(
      (r) =>
        r.status === "OPEN" &&
        r.stockId === closingPosition.stockId &&
        r.tradingAccountId === closingPosition.tradingAccountId &&
        r.productType === closingPosition.productType &&
        Math.abs(r.quantity) > 0,
    )
  }, [rows, closingPosition])

  const openCloseDialog = (row: PositionRow) => {
    setClosingPosition(row)
    setCloseDialogOpen(true)
    setCloseMode("full")
    setCloseQuantityValue("")
    setCloseLotsValue("")
    setCloseExitPriceValue("")
    setCloseErr(null)
    setCloseExitMode("live")
    const sibs = rows.filter(
      (r) =>
        r.status === "OPEN" &&
        r.stockId === row.stockId &&
        r.tradingAccountId === row.tradingAccountId &&
        r.productType === row.productType &&
        Math.abs(r.quantity) > 0,
    )
    setCloseScope(sibs.length > 1 ? "net" : "row")
  }

  const submitAdminClose = async () => {
    if (!closingPosition) return
    setCloseErr(null)
    try {
      setClosing(true)
      const requestId = createAdminRequestId()
      const closeQuantityNormalized = normalizeCreatePositionQuantity(closeQuantityValue)
      const closeLotsNormalized = normalizeCreatePositionQuantity(closeLotsValue)
      const closeExitPriceNormalized =
        closeExitPriceValue.trim().length > 0 ? normalizeCreatePositionPrice(closeExitPriceValue) : null

      if (closeMode === "quantity" && closeQuantityNormalized === null) {
        throw new Error("close quantity must be a positive integer")
      }
      if (closeMode === "lots") {
        if (closingPosition.lotSize <= 1) {
          throw new Error("lot-based close is not available for this instrument")
        }
        if (closeLotsNormalized === null) {
          throw new Error("close lots must be a positive integer")
        }
      }
      if (closeScope === "row") {
        if (closeMode === "quantity" && closeQuantityNormalized !== null) {
          if (closeQuantityNormalized > Math.abs(closingPosition.quantity)) {
            throw new Error(`close quantity cannot exceed ${Math.abs(closingPosition.quantity)}`)
          }
        }
        if (closeMode === "lots" && closeLotsNormalized !== null) {
          const maxLots = Math.abs(closingPosition.quantity) / closingPosition.lotSize
          if (closeLotsNormalized > maxLots) {
            throw new Error(`close lots cannot exceed ${maxLots}`)
          }
        }
      } else {
        const netAbs = siblingOpenRowsForClose.reduce((s, r) => s + Math.abs(r.quantity), 0)
        if (closeMode === "quantity" && closeQuantityNormalized !== null && closeQuantityNormalized > netAbs) {
          throw new Error(`close quantity cannot exceed net open ${netAbs}`)
        }
        if (closeMode === "lots" && closeLotsNormalized !== null) {
          const maxNetLots = netAbs / Math.max(closingPosition.lotSize, 1)
          if (closingPosition.lotSize > 1 && closeLotsNormalized > maxNetLots) {
            throw new Error(`close lots cannot exceed ${maxNetLots}`)
          }
        }
      }

      if (closeExitMode === "manual") {
        if (closeExitPriceNormalized === null) {
          throw new Error("exit price is required for manual mode")
        }
      } else if (closeExitPriceValue.trim().length > 0 && closeExitPriceNormalized === null) {
        throw new Error("exit price must be a positive number when provided")
      }

      const baseHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      }

      if (closeScope === "net") {
        if (!closingPosition.stockId || !closingPosition.tradingAccountId) {
          throw new Error("Missing stock or account on row; refresh the list and retry.")
        }
        const netPayload: Record<string, unknown> = {
          tradingAccountId: closingPosition.tradingAccountId,
          stockId: closingPosition.stockId,
          productType: closingPosition.productType,
          exitPriceMode: closeExitMode,
        }
        if (closeMode === "quantity" && closeQuantityNormalized !== null) {
          netPayload.closeQuantity = closeQuantityNormalized
        }
        if (closeMode === "lots" && closeLotsNormalized !== null) {
          netPayload.closeLots = closeLotsNormalized
        }
        if (closeExitMode === "manual" && closeExitPriceNormalized !== null) {
          netPayload.exitPrice = closeExitPriceNormalized
        }
        if (closeExitMode === "live" && closeExitPriceNormalized !== null) {
          netPayload.exitPrice = closeExitPriceNormalized
          netPayload.ltpTimestamp = Date.now()
          netPayload.ltpAgeMs = 0
        }
        if (closingPosition.instrumentId) {
          netPayload.instrumentId = closingPosition.instrumentId
        }

        const res = await fetch("/api/admin/positions/net-close", {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify(netPayload),
        })
        const responsePayload = await res.json().catch(() => ({}))
        const rid = res.headers.get("x-request-id") || requestId
        if (!res.ok) {
          const { title, description } = parseAdminApiError(responsePayload, res.status, rid)
          toast({ variant: "destructive", title, description })
          setCloseErr(description)
          return
        }
        const data = responsePayload as Record<string, unknown>
        const realized =
          typeof data.realizedPnL === "number" ? data.realizedPnL.toFixed(2) : String(data.realizedPnL ?? "")
        const exPx = typeof data.exitPrice === "number" ? data.exitPrice.toFixed(2) : String(data.exitPrice ?? "")
        const src = typeof data.exitPriceSource === "string" ? data.exitPriceSource : ""
        setCloseDialogOpen(false)
        setClosingPosition(null)
        void fetchData({ silent: true, reason: "admin_net_close_success" })
        toast({
          title: Boolean(data.isPartial) ? "Net partial exit" : "Net position closed",
          description: `P&L ₹${realized} @ ${exPx}${src ? ` (${src})` : ""}. ${typeof data.message === "string" ? data.message : ""}`,
        })
        return
      }

      const payload: Record<string, unknown> = {
        positionId: closingPosition.id,
        action: "close",
        exitPriceMode: closeExitMode,
      }
      if (closeMode === "quantity" && closeQuantityNormalized !== null) {
        payload.closeQuantity = closeQuantityNormalized
      }
      if (closeMode === "lots" && closeLotsNormalized !== null) {
        payload.closeLots = closeLotsNormalized
      }
      if (closeExitMode === "manual" && closeExitPriceNormalized !== null) {
        payload.exitPrice = closeExitPriceNormalized
      }
      if (closeExitMode === "live" && closeExitPriceNormalized !== null) {
        payload.exitPrice = closeExitPriceNormalized
        payload.ltpTimestamp = Date.now()
        payload.ltpAgeMs = 0
      }

      const res = await fetch("/api/admin/positions", {
        method: "PATCH",
        headers: baseHeaders,
        body: JSON.stringify(payload),
      })
      const responsePayload = await res.json().catch(() => ({}))
      const rid = res.headers.get("x-request-id") || requestId
      if (!res.ok) {
        const { title, description } = parseAdminApiError(responsePayload, res.status, rid)
        toast({ variant: "destructive", title, description })
        setCloseErr(description)
        return
      }

      const cr = (responsePayload as { closeResult?: { realizedPnL?: number; message?: string } }).closeResult
      const exSrc = (responsePayload as { exitPriceSource?: string }).exitPriceSource
      const realized = cr?.realizedPnL !== undefined ? Number(cr.realizedPnL).toFixed(2) : ""
      const price = (cr as { exitPrice?: number } | undefined)?.exitPrice
      const priceStr = typeof price === "number" ? price.toFixed(2) : ""

      setCloseDialogOpen(false)
      setClosingPosition(null)
      void fetchData({ silent: true, reason: "admin_close_success" })
      toast({
        title: closeMode === "full" ? "Position closed" : "Partial close",
        description: `P&L ₹${realized} @ ${priceStr}${exSrc ? ` (${exSrc})` : ""}. ${cr?.message || ""}`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Close failed"
      setCloseErr(msg)
      toast({ variant: "destructive", title: "Close failed", description: msg })
    } finally {
      setClosing(false)
    }
  }

  const closeDialogMaxQuantity = closingPosition ? Math.abs(closingPosition.quantity) : 0
  const closeDialogResolvedQuantity =
    closeMode === "full"
      ? closeDialogMaxQuantity
      : closeMode === "quantity"
        ? normalizeCreatePositionQuantity(closeQuantityValue) || 0
        : (normalizeCreatePositionQuantity(closeLotsValue) || 0) * (closingPosition?.lotSize || 1)
  const closeDialogRemainingQuantity = Math.max(0, closeDialogMaxQuantity - closeDialogResolvedQuantity)

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Position Management"
        description="Server-side verified position monitoring with live admin controls"
        icon={<Boxes className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 shrink-0" />}
        actions={
          <>
            <RefreshButton onClick={() => void fetchData()} loading={loading} />
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-white text-xs sm:text-sm" size="sm">
                  <span className="hidden sm:inline">Create Position</span>
                  <span className="sm:hidden">Create</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:w-full sm:max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
                <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                  <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Create Position (admin)</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-account-id">Trading Account ID</Label>
                    <Input id="cp-account-id" value={cpAccountId} onChange={(e) => setCpAccountId(e.target.value)} placeholder="account uuid" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-stock-id">Stock ID</Label>
                    <Input id="cp-stock-id" value={cpStockId} onChange={(e) => setCpStockId(e.target.value)} placeholder="stock uuid" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-instrument-id">Instrument ID</Label>
                    <Input id="cp-instrument-id" value={cpInstrumentId} onChange={(e) => setCpInstrumentId(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-symbol">Symbol</Label>
                    <Input id="cp-symbol" value={cpSymbol} onChange={(e) => setCpSymbol(e.target.value.toUpperCase())} placeholder="RELIANCE" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-qty">Quantity</Label>
                    <Input id="cp-qty" value={cpQty} onChange={(e) => setCpQty(e.target.value)} placeholder="e.g. 100" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="order-type">Order Type</Label>
                    <Select value={cpType} onValueChange={(v) => setCpType(v)}>
                      <SelectTrigger id="order-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKET">Market</SelectItem>
                        <SelectItem value="LIMIT">Limit</SelectItem>
                        <SelectItem value="STOP_LOSS">Stop Loss</SelectItem>
                        <SelectItem value="STOP_LIMIT">Stop Limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="order-side">Side</Label>
                    <Select value={cpSide} onValueChange={(v) => setCpSide(v)}>
                      <SelectTrigger id="order-side">
                        <SelectValue placeholder="Select side" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">Buy</SelectItem>
                        <SelectItem value="SELL">Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-price">Price (for LIMIT)</Label>
                    <Input id="cp-price" value={cpPrice} onChange={(e) => setCpPrice(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-product">Product</Label>
                    <Input id="cp-product" value={cpProduct} onChange={(e) => setCpProduct(e.target.value.toUpperCase())} placeholder="MIS/CNC/NRML" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="cp-segment">Segment</Label>
                    <Input id="cp-segment" value={cpSegment} onChange={(e) => setCpSegment(e.target.value.toUpperCase())} placeholder="NSE/NFO/MCX" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Lot Size</label>
                    <Input value={cpLot} onChange={(e) => setCpLot(e.target.value)} placeholder="optional for derivatives" />
                  </div>
                </div>
                {cpErr && (
                  <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                    <AlertTitle className="text-red-500">Error</AlertTitle>
                    <AlertDescription className="text-red-400">{cpErr}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button onClick={submitCreate} disabled={loading || !cpAccountId || !cpStockId || !cpSymbol || !cpQty || !cpType || !cpSide}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />


      {/* Exposure summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => { setOpenOnly(true); setPage(1) }}
          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${openOnly ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40 hover:bg-muted/20"}`}
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Open</div>
          <div className="text-2xl font-bold tabular-nums">{dashboardSummary.open}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            <span className="text-emerald-500">{dashboardSummary.longs}L</span>
            {" / "}
            <span className="text-red-500">{dashboardSummary.shorts}S</span>
          </div>
        </button>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Unrealized P&L</div>
          <div className={`text-xl font-bold tabular-nums leading-tight ${dashboardSummary.totalOpenUnrealized >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatRupeeCompact(dashboardSummary.totalOpenUnrealized)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">live MTM</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Day P&L</div>
          <div className={`text-xl font-bold tabular-nums leading-tight ${dashboardSummary.totalOpenDay >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {formatRupeeCompact(dashboardSummary.totalOpenDay)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">today</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Booked P&L</div>
          <div className={`text-xl font-bold tabular-nums leading-tight ${dashboardSummary.totalClosedBooked >= 0 ? "text-emerald-500/80" : "text-red-500/80"}`}>
            {formatRupeeCompact(dashboardSummary.totalClosedBooked)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{dashboardSummary.closed} closed</div>
        </div>

        <button
          type="button"
          onClick={() => { setSide(side === "LONG" ? "" : "LONG") }}
          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${side === "LONG" ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/30" : "border-border bg-card hover:border-emerald-500/30 hover:bg-muted/20"}`}
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Longs</div>
          <div className="text-2xl font-bold text-emerald-500 tabular-nums">{dashboardSummary.longs}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">click to filter</div>
        </button>

        <button
          type="button"
          onClick={() => { setSide(side === "SHORT" ? "" : "SHORT") }}
          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${side === "SHORT" ? "border-red-500/40 bg-red-500/10 ring-1 ring-red-500/30" : "border-border bg-card hover:border-red-500/30 hover:bg-muted/20"}`}
        >
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Shorts</div>
          <div className="text-2xl font-bold text-red-500 tabular-nums">{dashboardSummary.shorts}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">click to filter</div>
        </button>
      </div>

      {/* System status + live controls — compact one-liner */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2">
        <Badge variant={meta.pnlMode === "server" ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
          PnL: {meta.pnlMode.toUpperCase()}
        </Badge>
        <Badge variant={meta.workerHealthy ? "default" : "destructive"} className="text-[10px] h-5 px-1.5">
          Worker: {meta.workerHealthy ? "OK" : "Down"}
        </Badge>
        <Badge variant={isLiveSseConnected ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
          SSE: {liveSseState}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
          MTM: {meta.positionsTabMtmDisplayMode === "server_snapshot_preferred" ? "snap" : "live"}
        </Badge>
        {liveRefreshing && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing
          </span>
        )}
        {lastRefreshedAtMs && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Last: {new Date(lastRefreshedAtMs).toLocaleTimeString()}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <Switch checked={liveEnabled} onCheckedChange={setLiveEnabled} className="h-4 w-7 [&>span]:h-3 [&>span]:w-3" />
          <span className="text-xs text-muted-foreground">Live</span>
          {[2000, 3000, 5000, 10000].map((ms) => (
            <Button
              key={ms}
              type="button"
              variant={liveIntervalMs === ms ? "default" : "ghost"}
              size="sm"
              onClick={() => setLiveIntervalMs(ms)}
              className="h-6 px-2 text-[10px]"
            >
              {ms / 1000}s
            </Button>
          ))}
        </div>
      </div>

      {/* Filter command bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Search symbol / user…"
            className="text-sm flex-1 min-w-[180px] max-w-xs h-9"
          />
          <Input
            value={userFilter}
            onChange={(e) => { setUserFilter(e.target.value); setPage(1) }}
            placeholder="Client ID or name…"
            className="text-sm w-44 h-9"
          />
          <Input
            value={symbol}
            onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setPage(1) }}
            placeholder="Symbol"
            className="text-sm w-28 h-9"
          />
          <Select value={productType || "all"} onValueChange={(v) => { setProductType(v === "all" ? "" : v) }}>
            <SelectTrigger className="w-28 text-sm h-9">
              <SelectValue placeholder="Product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              <SelectItem value="MIS">MIS</SelectItem>
              <SelectItem value="CNC">CNC</SelectItem>
              <SelectItem value="NRML">NRML</SelectItem>
            </SelectContent>
          </Select>
          <Select value={side || "all"} onValueChange={(v) => { setSide(v === "all" ? "" : v) }}>
            <SelectTrigger className="w-28 text-sm h-9">
              <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sides</SelectItem>
              <SelectItem value="LONG">Long</SelectItem>
              <SelectItem value="SHORT">Short</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => { setOpenOnly(!openOnly); setPage(1) }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all h-9 ${openOnly ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${openOnly ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {openOnly ? "Open only" : "All statuses"}
          </button>
        </div>
        {/* Active filter chips */}
        {(userFilter || symbol || productType || side || q) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {userFilter && <PosFilterChip label={`User: ${userFilter}`} onRemove={() => { setUserFilter(""); setPage(1) }} />}
            {symbol && <PosFilterChip label={`Symbol: ${symbol}`} onRemove={() => { setSymbol(""); setPage(1) }} />}
            {productType && <PosFilterChip label={`Product: ${productType}`} onRemove={() => setProductType("")} />}
            {side && <PosFilterChip label={`Side: ${side}`} onRemove={() => setSide("")} />}
            {q && <PosFilterChip label={`Search: ${q}`} onRemove={() => { setQ(""); setPage(1) }} />}
            <button type="button" onClick={() => { setUserFilter(""); setSymbol(""); setProductType(""); setSide(""); setQ(""); setPage(1) }} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
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

      {/* Risk alert banner — shown when at-risk positions exist */}
      {(riskSummary.nearSl > 0 || riskSummary.bigLoss > 0) && (
        <Alert className="border-amber-500/50 bg-amber-500/10 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-600 dark:text-amber-400 text-sm font-semibold">
            Risk Alert
          </AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-0.5">
            {riskSummary.nearSl > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                ⚡ {riskSummary.nearSl} position{riskSummary.nearSl > 1 ? "s" : ""} near stop-loss
              </span>
            )}
            {riskSummary.bigLoss > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                🔴 {riskSummary.bigLoss} position{riskSummary.bigLoss > 1 ? "s" : ""} with big loss (&gt;₹10k)
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
        <CardContent className="px-3 sm:px-4 pb-4 pt-4">
          <div className="rounded-lg border border-border/50 bg-card">
            <Table className="text-xs">
              <TableHeader className="[&_tr]:border-border/50">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="h-8 w-10 pl-3">
                    <Checkbox
                      checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                      onCheckedChange={selectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead
                    className="h-8 px-2.5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("time")}
                  >
                    <div className="flex items-center gap-1">
                      Time
                      {sortField === "time" ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </TableHead>
                  <TableHead className="h-8 px-2.5 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead
                    className="h-8 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground min-w-[200px] cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("symbol")}
                  >
                    <div className="flex items-center gap-1">
                      Symbol
                      {sortField === "symbol" ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </TableHead>
                  <TableHead className="h-8 px-2 py-2 text-muted-foreground text-center">
                    <PnlHeaderTip label="Pos" tip="Status dot, quantity, and lots (open rows)." />
                  </TableHead>
                  <TableHead className="h-8 px-2.5 py-2 text-muted-foreground text-right whitespace-nowrap">
                    <PnlHeaderTip label="Price" tip="Average entry, mark (LTP) when open, and SL/TP when set." />
                  </TableHead>
                  <TableHead
                    className="h-8 px-2.5 py-2 text-muted-foreground text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("pnl")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <PnlHeaderTip label="P&L" tip="Open: bold MTM unrealized and day line. Closed: lighter booked realized." />
                      {sortField === "pnl" ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </TableHead>
                  <TableHead className="h-8 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                      No positions
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filteredRows.map((r) => {
                    const pnlDisp = resolveAdminPositionPnLForDisplay({
                      status: r.status,
                      unrealizedPnL: normalizePositionsManagementFinite(r.unrealizedPnL),
                      dayPnL: normalizePositionsManagementFinite(r.dayPnL),
                    })
                    const ltpInner = formatLtpCell(r.status, r.ltp)
                    const ltpWrapped =
                      r.status === "CLOSED" ? (
                        ltpInner
                      ) : (
                        <span className="inline-flex items-baseline gap-1 justify-end">
                          <span className="text-[10px] text-muted-foreground">LTP</span>
                          {ltpInner}
                        </span>
                      )
                    const riskFlags = getPositionRiskFlags(r)
                    const pnlPct = r.status === "OPEN" && r.averagePrice > 0 && r.quantity !== 0 && r.unrealizedPnL !== undefined
                      ? ((r.unrealizedPnL ?? 0) / (r.averagePrice * Math.abs(r.quantity))) * 100
                      : null
                    const isSelected = selectedIds.has(r.id)
                    const sideAccent = r.status === "CLOSED"
                      ? "border-l-2 border-l-zinc-300 dark:border-l-zinc-700"
                      : r.side === "LONG"
                        ? "border-l-2 border-l-emerald-500"
                        : r.side === "SHORT"
                          ? "border-l-2 border-l-red-500"
                          : "border-l-2 border-l-border"
                    return (
                      <TableRow
                        key={r.id}
                        className={`border-border/40 transition-colors ${sideAccent} ${isSelected ? "bg-primary/5" : "hover:bg-muted/40"}`}
                      >
                        <TableCell className="py-1.5 pl-3 align-middle" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select position ${r.id}`}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 align-middle" title={r.createdAtLabel}>
                          <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                            {formatAdminPositionTableTime(r.createdAtIso)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 align-middle max-w-[6.5rem]">
                          <AdminClientHoverCell
                            clientId={r.clientId}
                            userName={r.userName}
                            tradingAccountId={r.tradingAccountId}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 px-3 align-top">
                          <AdminPositionSymbolStack
                            symbol={r.symbol}
                            status={r.status}
                            quantity={r.quantity}
                            segment={r.segment}
                            exchange={r.exchange}
                            optionType={r.optionType}
                            productType={r.productType}
                            stockName={r.stockName}
                            expiry={r.expiry}
                            strikePrice={r.strikePrice}
                            lotSize={r.lotSize}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 px-2 align-middle">
                          <AdminPositionMergedPosCell
                            status={r.status}
                            quantity={r.quantity}
                            openLots={r.openLots}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 align-middle">
                          <AdminPositionMergedPriceCell
                            averagePrice={r.averagePrice}
                            ltpNode={ltpWrapped}
                            stopLoss={r.stopLoss}
                            target={r.target}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 align-middle text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <AdminPositionMergedPnlCell
                              status={r.status}
                              openUnrealized={pnlDisp.openUnrealized}
                              openDay={pnlDisp.openDay}
                              closedBooked={pnlDisp.closedBooked}
                            />
                            {pnlPct !== null && (
                              <span className={`text-[10px] tabular-nums font-medium ${pnlPct >= 0 ? "text-emerald-500/70" : "text-red-500/70"}`}>
                                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                              </span>
                            )}
                            {riskFlags.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 justify-end">
                                {riskFlags.map((flag) => (
                                  <span
                                    key={flag}
                                    className={`text-[9px] font-bold px-1 py-0.5 rounded ${flag === "Near SL" ? "bg-amber-500/20 text-amber-500" : "bg-red-500/20 text-red-500"}`}
                                  >
                                    {flag === "Near SL" ? "⚡ Near SL" : "🔴 Big Loss"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === "OPEN" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => openCloseDialog(r)}
                              >
                                Exit
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground py-1">
                                  {r.symbol}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => startEdit(r)} className="gap-2 text-xs">
                                  <Edit className="w-3.5 h-3.5" />
                                  Edit position
                                </DropdownMenuItem>
                                {r.status === "OPEN" && (
                                  <DropdownMenuItem
                                    onClick={() => openCloseDialog(r)}
                                    className="gap-2 text-xs text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Exit position
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => void copyAdminClipboardField("Position ID", r.id)}
                                  className="gap-2 text-xs"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy ID
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void copyAdminClipboardField("Trading Account", r.tradingAccountId)}
                                  className="gap-2 text-xs"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy Account ID
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={pages}
            onPageChange={setPage}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Sticky bulk-ops bar */}
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
              onClick={() => void bulkCloseAtLtp()}
              disabled={bulkClosing}
            >
              {bulkClosing ? "Closing…" : "Close All at LTP"}
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

      {/* Position Edit Dialog */}
      {editingPosition && (
        <PositionEditDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open)
            if (!open) setEditingPosition(null)
          }}
          position={editingPosition}
          onSaved={() => {
            void fetchData()
            setEditDialogOpen(false)
            setEditingPosition(null)
          }}
        />
      )}

      <Dialog
        open={closeDialogOpen}
        onOpenChange={(open) => {
          setCloseDialogOpen(open)
          if (!open) {
            setClosingPosition(null)
            setCloseErr(null)
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
          <DialogHeader>
            <DialogTitle className="text-primary">Exit Position</DialogTitle>
          </DialogHeader>
          {closingPosition && (
            <div className="space-y-3">
              <div className="rounded border border-border p-3 text-sm space-y-1">
                <div className="font-mono font-bold text-[13px] text-zinc-950 dark:text-[#f4f4f5]">
                  {closingPosition.symbol}
                </div>
                <div className="text-muted-foreground">
                  Client {closingPosition.clientId || "-"} • Open Qty {closingPosition.quantity}
                </div>
                {closingPosition.lotSize > 1 && (
                  <div className="text-muted-foreground">Lot Size {closingPosition.lotSize}</div>
                )}
              </div>

              {siblingOpenRowsForClose.length > 1 && (
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <Info className="h-4 w-4" />
                  <AlertTitle className="text-amber-700 dark:text-amber-400">Multiple open lots</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    {siblingOpenRowsForClose.length} rows share this symbol/account/product. Net square-off closes FIFO
                    across all of them; single row only closes this line.
                  </AlertDescription>
                </Alert>
              )}

              {siblingOpenRowsForClose.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Scope</Label>
                  <RadioGroup
                    value={closeScope}
                    onValueChange={(v) => setCloseScope(v as "row" | "net")}
                    className="grid gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="net" id="close-scope-net" />
                      <Label htmlFor="close-scope-net" className="font-normal cursor-pointer">
                        Net square-off (recommended)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="row" id="close-scope-row" />
                      <Label htmlFor="close-scope-row" className="font-normal cursor-pointer">
                        This row only
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={closeMode === "full" ? "default" : "outline"}
                  onClick={() => setCloseMode("full")}
                >
                  Full
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={closeMode === "quantity" ? "default" : "outline"}
                  onClick={() => setCloseMode("quantity")}
                >
                  Quantity
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={closeMode === "lots" ? "default" : "outline"}
                  onClick={() => setCloseMode("lots")}
                  disabled={closingPosition.lotSize <= 1}
                >
                  Lots
                </Button>
              </div>

              {closeMode === "quantity" && (
                <div>
                  <label className="text-xs text-muted-foreground">Close Quantity</label>
                  <Input
                    value={closeQuantityValue}
                    onChange={(e) => setCloseQuantityValue(e.target.value)}
                    placeholder={`max ${Math.abs(closingPosition.quantity)}`}
                  />
                </div>
              )}
              {closeMode === "lots" && (
                <div>
                  <label className="text-xs text-muted-foreground">Close Lots</label>
                  <Input
                    value={closeLotsValue}
                    onChange={(e) => setCloseLotsValue(e.target.value)}
                    placeholder={
                      closeScope === "net" && siblingOpenRowsForClose.length > 1
                        ? `max net ${siblingOpenRowsForClose.reduce((s, r) => s + Math.abs(r.quantity), 0) / Math.max(closingPosition.lotSize, 1)}`
                        : `max ${Math.abs(closingPosition.quantity) / Math.max(closingPosition.lotSize, 1)}`
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Exit price source</Label>
                <RadioGroup
                  value={closeExitMode}
                  onValueChange={(v) => setCloseExitMode(v as "live" | "stock_ltp" | "manual")}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="live" id="exit-live" />
                    <Label htmlFor="exit-live" className="font-normal cursor-pointer">
                      Live (server quote; optional assisted price below)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="stock_ltp" id="exit-ltp" />
                    <Label htmlFor="exit-ltp" className="font-normal cursor-pointer">
                      Stock LTP snapshot (database)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="exit-manual" />
                    <Label htmlFor="exit-manual" className="font-normal cursor-pointer">
                      Manual price
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {(closeExitMode === "live" || closeExitMode === "manual") && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    {closeExitMode === "manual" ? "Exit price (required)" : "Assisted LTP (optional)"}
                  </label>
                  <Input
                    value={closeExitPriceValue}
                    onChange={(e) => setCloseExitPriceValue(e.target.value)}
                    placeholder={closeExitMode === "manual" ? "e.g. 145.50" : "Fresh tick for client-assisted close"}
                  />
                </div>
              )}

              <div className="rounded border border-border p-3 text-xs text-muted-foreground space-y-1">
                <div>Close Qty Preview: {closeDialogResolvedQuantity}</div>
                <div>Remaining Qty Preview: {closeDialogRemainingQuantity}</div>
              </div>

              {closeErr && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                  <AlertTitle className="text-red-500">Close failed</AlertTitle>
                  <AlertDescription className="text-red-400">{closeErr}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCloseDialogOpen(false)
                setClosingPosition(null)
              }}
              disabled={closing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => void submitAdminClose()}
              disabled={closing}
            >
              {closing ? "Closing..." : "Confirm Exit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
