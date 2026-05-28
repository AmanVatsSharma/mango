/**
 * @file position-tracking.tsx
 * @module components/position-tracking
 * @description Premium Pro-Trader UI Dashboard widget for live and booked positions.
 * Terminal Noir aesthetic under dark mode; zinc/light surfaces under light theme (next-themes).
 * Mobile view has a Positions | History sub-tab: Positions shows live open trades,
 * History shows today's closed positions (SSE-driven via usePositionHistory at parent level).
 * @author StockTrade
 * @created 2025-11-06
 * @updated 2026-05-09 — Mobile Positions|History sub-tab
 */

"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Target,
  X,
  Loader2,
  Shield,
  Activity,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useMarketDataStable } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { cn } from "@/lib/utils"
import {
  formatIndianNumber,
  formatInr,
  formatSignedInr,
} from "@/lib/formatting/inr-format"
import {
  parsePositiveIntegerMarketNumber,
  resolveQuoteFromMap,
  resolveDisplayQuoteSnapshot,
} from "@/lib/market-data/utils/quote-lookup"
import {
  computeTradingPositionsPnlSummary,
  type TradingPnlMeta,
} from "@/components/trading/trading-dashboard-number-utils"
import {
  resolveFrozenPositionDisplay,
  resolveGroupDisplayTotal,
  type FrozenLiveSnapshot,
  type PositionDisplayState,
} from "@/components/trading/position-feed-freeze-utils"
import { useTheme } from "next-themes"
import type { PositionHistoryRow } from "@/lib/hooks/use-position-history"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Position {
  id: string
  symbol: string
  /** From positions list API; watchlist-aligned description when set. */
  instrumentLabel?: string
  productType?: string
  isIntraday?: boolean
  stockId?: string | null
  quantity: number
  averagePrice: number
  instrumentId?: string
  exchange?: string
  token?: number | null
  stock?: {
    instrumentId?: string
    token?: number | null
  }
  status?: "OPEN" | "CLOSED"
  isClosed?: boolean
  stopLoss?: number
  target?: number
  segment?: string
  expiry?: string
  strikePrice?: number
  optionType?: string
  lotSize?: number
  identity?: {
    stockId: string | null
    instrumentId: string | null
    segment: string | null
    exchange: string | null
    strikePrice: number | null
    optionType: string | null
    expiry: string | null
    token: number | null
  } | null
  unrealizedPnL: number
  realizedPnL?: number
  bookedPnL?: number
  dayPnL?: number
  currentPrice?: number
  pnlUpdatedAtMs?: number | null
}

interface Quote {
  last_trade_price: number
  display_price?: number
  prev_close_price?: number
}

interface PositionTrackingProps {
  positions: Position[]
  quotes: Record<string, Quote>
  pnlMeta: TradingPnlMeta
  optimisticClosePosition: (
    positionId: string,
    exitPrice?: number,
    closeQuantityAbs?: number,
  ) => void
  refreshPositions: () => Promise<any>
  onPositionUpdate: () => Promise<void> | void
  marketFeedStatus: "connected" | "connecting" | "snapshot" | "offline"
  lastPositionsSyncAtMs: number | null
  tradingAccountId?: string
  closedPositionHistory?: PositionHistoryRow[]
}

type MobilePositionTab = "live" | "history"

interface CloseRequestOptions {
  closeQuantity?: number
  closeLots?: number
}

type GroupedPositionBucket = {
  key: string
  label: string
  positions: Position[]
}

// ─── History helpers (mobile History tab) ────────────────────────────────────

function fmtHistoryTime(isoStr: string | null): string {
  if (!isoStr) return "—"
  return new Date(isoStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function fmtHeldDuration(ms: number): string {
  if (ms < 60_000) return "<1m"
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ─── Pure Utilities ───────────────────────────────────────────────────────────

const normalizeMetaText = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseMetaNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatExpiryMeta = (value: unknown): string | null => {
  const normalized = normalizeMetaText(value)
  if (!normalized) return null
  return normalized.slice(0, 10)
}

const resolvePositionInstrumentMeta = (position: Position) => {
  const stock = (position as any)?.stock ?? {}
  const identity = (position as any)?.identity ?? {}
  const exchange =
    normalizeMetaText(
      identity?.exchange ?? position.exchange ?? stock.exchange,
    )?.toUpperCase() ?? null
  const segment =
    normalizeMetaText(
      identity?.segment ?? position.segment ?? stock.segment,
    )?.toUpperCase() ?? null
  const instrumentName = normalizeMetaText(stock?.name ?? null)
  const instrumentId =
    normalizeMetaText(
      identity?.instrumentId ?? position.instrumentId ?? stock.instrumentId,
    )?.toUpperCase() ?? null
  const optionType =
    normalizeMetaText(
      identity?.optionType ?? position.optionType ?? stock.optionType,
    )?.toUpperCase() ?? null
  const expiry = formatExpiryMeta(
    identity?.expiry ?? position.expiry ?? stock.expiry,
  )
  const strikePrice = parseMetaNumber(
    identity?.strikePrice ?? position.strikePrice ?? stock.strikePrice,
  )
  const lotSizeRaw = parseMetaNumber(
    position.lotSize ?? stock.lotSize ?? stock.lot_size,
  )
  const lotSize =
    lotSizeRaw !== null && lotSizeRaw > 0 ? Math.trunc(lotSizeRaw) : null
  const token = parsePositiveIntegerMarketNumber(
    identity?.token ?? position.token ?? stock.token,
  )
  return {
    exchange,
    segment,
    instrumentName,
    instrumentId,
    optionType,
    expiry,
    strikePrice,
    lotSize,
    token,
  }
}

const isPositionMarkedClosed = (position: Position): boolean => {
  if (position.isClosed) return true
  if (
    typeof position.status === "string" &&
    position.status.toUpperCase() === "CLOSED"
  )
    return true
  return position.quantity === 0
}

const getRiskProgressPercent = (
  currentPrice: number,
  avgPrice: number,
  stopLossValue: number | null,
  targetValue: number | null,
  quantity: number,
) => {
  const riskBandLower = (() => {
    if (stopLossValue != null && targetValue != null)
      return Math.min(stopLossValue, targetValue)
    if (stopLossValue != null)
      return quantity > 0
        ? stopLossValue
        : Math.min(currentPrice, avgPrice)
    if (targetValue != null)
      return quantity > 0 ? Math.min(currentPrice, avgPrice) : targetValue
    return null
  })()
  const riskBandUpper = (() => {
    if (stopLossValue != null && targetValue != null)
      return Math.max(stopLossValue, targetValue)
    if (stopLossValue != null)
      return quantity > 0
        ? Math.max(currentPrice, avgPrice)
        : stopLossValue
    if (targetValue != null)
      return quantity > 0 ? targetValue : Math.max(currentPrice, avgPrice)
    return null
  })()
  if (riskBandLower == null || riskBandUpper == null) return 0
  const range = riskBandUpper - riskBandLower
  if (!Number.isFinite(range) || range <= 0) return 0
  const raw = ((currentPrice - riskBandLower) / range) * 100
  return Math.max(0, Math.min(100, raw))
}

const formatFeedAge = (ageMs: number | null): string => {
  if (
    typeof ageMs !== "number" ||
    !Number.isFinite(ageMs) ||
    ageMs < 0
  )
    return "n/a"
  const seconds = Math.round(ageMs / 1000)
  if (seconds < 60) return `${Math.max(1, seconds)}s`
  const minutes = Math.round(seconds / 60)
  return `${Math.max(1, minutes)}m`
}

const resolvePositionFeedBadgeMeta = (
  row: PositionDisplayState | undefined,
  staleBadgeAfterMs: number | null | undefined,
  quoteBadgesEnabled = true,
): { label: string; className: string; tooltip: string } | null => {
  if (!quoteBadgesEnabled) {
    return null
  }
  if (!row)
    return {
      label: "STALE",
      className:
        "bg-zinc-200 text-zinc-600 border-zinc-300 dark:bg-[#1a1a22] dark:text-[#52525b] dark:border-[#27272a]",
      tooltip: "Position feed state is unavailable.",
    }
  const staleHint =
    typeof staleBadgeAfterMs === "number" &&
    Number.isFinite(staleBadgeAfterMs) &&
    staleBadgeAfterMs > 0 &&
    row.feedState === "LIVE" &&
    row.quoteAgeMs !== null &&
    row.quoteAgeMs >= staleBadgeAfterMs

  if (row.feedState === "LIVE")
    return {
      label: staleHint ? "STALE" : "LIVE",
      className: staleHint
        ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-[#2d1f00] dark:text-[#fbbf24] dark:border-[#78350f]"
        : "bg-green-100 text-green-800 border-green-300 dark:bg-[#052e16] dark:text-[#4ade80] dark:border-[#166534]",
      tooltip: staleHint
        ? `Quote age ${formatFeedAge(row.quoteAgeMs)} exceeds admin stale threshold (${formatFeedAge(staleBadgeAfterMs)}).`
        : row.quoteAgeMs !== null
          ? `Live tick ${formatFeedAge(row.quoteAgeMs)} ago.`
          : "Live tick received.",
    }
  if (row.feedState === "FROZEN")
    return {
      label: "FROZEN",
      className:
        "bg-amber-100 text-amber-900 border-amber-300 dark:bg-[#2d1f00] dark:text-[#fbbf24] dark:border-[#78350f]",
      tooltip: `Frozen at last confirmed live value (${formatFeedAge(row.frozenAgeMs)} ago).`,
    }
  if (row.feedState === "CLOSED")
    return {
      label: "CLOSED",
      className:
        "bg-zinc-200 text-zinc-600 border-zinc-300 dark:bg-[#1a1a22] dark:text-[#52525b] dark:border-[#27272a]",
      tooltip: "Position closed; live feed not required.",
    }
  return {
    label: "NO LIVE",
    className:
      "bg-zinc-200 text-zinc-600 border-zinc-300 dark:bg-[#1a1a22] dark:text-[#52525b] dark:border-[#27272a]",
    tooltip: "No confirmed live value available yet.",
  }
}

// ─── InlineEdit ───────────────────────────────────────────────────────────────

const InlineEdit = ({
  value,
  onSave,
  placeholder,
  icon: Icon,
  colorClass,
  isLoading,
}: any) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.toString() || "")
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync editValue with the prop value WHEN the user isn't actively editing.
  // Without this, an external update to value (server push, another tab editing the
  // same position's stop/target) leaves the local editValue frozen at the value that
  // existed when the field was first mounted. Click-to-edit then shows a stale number.
  // The `!isEditing` gate makes sure we never overwrite the user's keystrokes mid-edit.
  useEffect(() => {
    if (!isEditing) {
      const next = value?.toString() ?? ""
      setEditValue((prev: string) => (prev === next ? prev : next))
    }
  }, [value, isEditing])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    setIsEditing(false)
    const num = Number(editValue)
    if (!isNaN(num) && num !== value && editValue.trim() !== "") {
      onSave(num)
    } else if (editValue.trim() === "" && value != null) {
      onSave(0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") {
      setEditValue(value?.toString() || "")
      setIsEditing(false)
    }
  }

  const hasValue = value !== null && value !== undefined
  const isRedAccent = colorClass?.includes("red")

  if (isLoading)
    return <Loader2 className="w-2.5 h-2.5 animate-spin text-zinc-500 dark:text-[#52525b]" />

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="h-5 w-[72px] text-[11px] px-1.5 font-mono text-right bg-white border border-indigo-500 outline-none text-zinc-900 dark:bg-[#0f0f14] dark:border-[#6366f1] dark:text-zinc-100 rounded-[3px] tabular-nums"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return (
    <button
      className={cn(
        "group flex items-center gap-1 h-5 px-1.5 rounded-[3px] border font-mono text-[11px] tabular-nums transition-all duration-100 select-none",
        hasValue
          ? isRedAccent
            ? "border-red-200 hover:border-red-400 text-red-600 dark:border-[#3f1010] dark:hover:border-red-300 dark:border-[#7f1d1d] dark:text-red-500 dark:text-[#f87171]"
            : "border-green-200 hover:border-green-500 text-green-700 dark:border-[#0d3320] dark:hover:border-[#166534] dark:text-[#4ade80]"
          : "border-dashed border-zinc-300 hover:border-zinc-400 text-zinc-500 hover:text-zinc-600 dark:border-[#27272a] dark:hover:border-[#3f3f46] dark:text-[#3f3f46] dark:hover:text-[#71717a]",
      )}
      onClick={() => {
        setEditValue(value?.toString() || "")
        setIsEditing(true)
      }}
      title="Click to edit"
    >
      {Icon && (
        <Icon
          className={cn(
            "w-2 h-2 flex-shrink-0",
            hasValue
              ? isRedAccent
                ? "text-red-600 dark:text-red-500 dark:text-[#f87171]"
                : "text-green-600 dark:text-[#4ade80]"
              : "text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-400 dark:text-[#3f3f46] dark:group-hover:text-zinc-500 dark:text-[#52525b]",
          )}
        />
      )}
      <span className={cn("leading-none", !hasValue && "italic text-[10px]")}>
        {hasValue ? formatIndianNumber(value, 2) : placeholder}
      </span>
    </button>
  )
}

// ─── Exit Popover Content (shared) ───────────────────────────────────────────

const ExitPopoverContent = ({
  position,
  onClose,
  loading,
}: {
  position: Position
  onClose: (opts?: CloseRequestOptions) => void
  loading: boolean
}) => (
  <div className="flex flex-col gap-2">
    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500 dark:text-[#52525b]">
      Confirm Exit
    </span>
    <Button
      size="sm"
      disabled={loading}
      className="h-7 text-[11px] w-full font-mono font-bold bg-[#ef4444] hover:bg-[#dc2626] text-white border-0 tracking-wider rounded-[3px]"
      onClick={() => onClose()}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
      ) : null}
      Square Off All
    </Button>
    <div className="flex gap-1.5 items-center pt-1.5 border-t border-zinc-200 dark:border-[#141419]">
      <Input
        type="number"
        id={`exit-qty-${position.id}`}
        placeholder={`Max ${Math.abs(position.quantity)}`}
        className="h-7 text-[10px] font-mono bg-white border-zinc-300 focus:border-zinc-500 text-zinc-900 placeholder:text-zinc-500 rounded-[3px] dark:bg-[#0f0f14] dark:border-[#27272a] dark:focus:border-[#52525b] dark:text-zinc-100 dark:placeholder:text-[#3f3f46]"
      />
      <Button
        size="sm"
        disabled={loading}
        className="h-7 text-[10px] px-2 font-mono font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-800 border-0 shrink-0 rounded-[3px] dark:bg-[#1a1a22] dark:hover:bg-[#27272a] dark:text-[#a1a1aa]"
        onClick={() => {
          const qty = Number(
            (
              document.getElementById(
                `exit-qty-${position.id}`,
              ) as HTMLInputElement
            )?.value,
          )
          if (qty > 0 && qty <= Math.abs(position.quantity))
            onClose({ closeQuantity: qty })
          else toast({ title: "Invalid Quantity", variant: "destructive" })
        }}
      >
        Partial
      </Button>
    </div>
    {position.lotSize && position.lotSize > 1 && (
      <div className="flex gap-1.5 items-center pt-1.5 border-t border-zinc-200 dark:border-[#141419]">
        <Input
          type="number"
          id={`exit-lots-${position.id}`}
          placeholder={`Lot ×${position.lotSize}`}
          className="h-7 text-[10px] font-mono bg-white border-zinc-300 focus:border-zinc-500 text-zinc-900 placeholder:text-zinc-500 rounded-[3px] dark:bg-[#0f0f14] dark:border-[#27272a] dark:focus:border-[#52525b] dark:text-zinc-100 dark:placeholder:text-[#3f3f46]"
        />
        <Button
          size="sm"
          disabled={loading}
          className="h-7 text-[10px] px-2 font-mono font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-800 border-0 shrink-0 rounded-[3px] dark:bg-[#1a1a22] dark:hover:bg-[#27272a] dark:text-[#a1a1aa]"
          onClick={() => {
            const lots = Number(
              (
                document.getElementById(
                  `exit-lots-${position.id}`,
                ) as HTMLInputElement
              )?.value,
            )
            if (lots > 0) onClose({ closeLots: lots })
            else toast({ title: "Invalid Lots", variant: "destructive" })
          }}
        >
          By Lots
        </Button>
      </div>
    )}
  </div>
)

// ─── Main Component ───────────────────────────────────────────────────────────

export function PositionTracking({
  positions,
  quotes,
  pnlMeta,
  optimisticClosePosition,
  refreshPositions,
  onPositionUpdate,
  marketFeedStatus: _marketFeedStatus,
  tradingAccountId,
  closedPositionHistory,
}: PositionTrackingProps) {
  const { resolvedTheme } = useTheme()
  const pnlHeatAlpha = resolvedTheme === "light" ? 0.12 : 0.2
  const { warmupQuote, marketDisplayQuoteFreshness, marketDisplayUi } = useMarketDataStable()
  const lastLiveByPositionIdRef = useRef<Map<string, FrozenLiveSnapshot>>(
    new Map(),
  )
  const [loading, setLoading] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobilePositionTab>("live")
  const [hoveredPositionId, setHoveredPositionId] = useState<string | null>(
    null,
  )
  const [panicDialogOpen, setPanicDialogOpen] = useState(false)
  const [panicConfirmStep, setPanicConfirmStep] = useState<1 | 2>(1)
  const [panicRunning, setPanicRunning] = useState(false)

  // ── Derived Data ─────────────────────────────────────────────────────────

  const effectivePnlMeta = useMemo(
    () => ({
      ...pnlMeta,
      pnlMaxAgeMs: pnlMeta?.pnlMaxAgeMs ?? marketDisplayQuoteFreshness.pnlServerMaxAgeMs,
      liveQuoteMaxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs,
      displayQuoteMaxAgeMs: marketDisplayQuoteFreshness.displayMaxAgeMs,
      staleQuotePriceMode: marketDisplayUi.staleQuotePriceMode,
    }),
    [pnlMeta, marketDisplayQuoteFreshness, marketDisplayUi.staleQuotePriceMode],
  )

  const pnlSummary = useMemo(
    () =>
      computeTradingPositionsPnlSummary({
        positions,
        quotes: quotes as Record<string, any>,
        pnlMeta: effectivePnlMeta,
      }),
    [positions, quotes, effectivePnlMeta],
  )

  const { resolvedByPositionId } = pnlSummary

  const frozenDisplay = useMemo(() => {
    const next = resolveFrozenPositionDisplay({
      positions,
      resolvedByPositionId,
      previousCache: lastLiveByPositionIdRef.current,
      freezeLastLiveEnabled: marketDisplayUi.positionFreezeEnabled,
      positionsRowPriceBasis: marketDisplayUi.positionsRowPriceBasis,
    })
    lastLiveByPositionIdRef.current = next.cache
    return next
  }, [
    positions,
    resolvedByPositionId,
    marketDisplayUi.positionFreezeEnabled,
    marketDisplayUi.positionsRowPriceBasis,
  ])

  const {
    displayByPositionId,
    openMtm,
    bookedToday,
    totalPositions,
    hasUnknownOpenPositions,
  } = frozenDisplay

  const maxAbsPnl = useMemo(
    () =>
      Math.max(
        0.1,
        ...positions.map((p) =>
          Math.abs(displayByPositionId.get(p.id)?.totalPnl ?? 0),
        ),
      ),
    [positions, displayByPositionId],
  )

  const groupedPositions = useMemo(() => {
    const groups = new Map<string, GroupedPositionBucket>()
    positions.forEach((position) => {
      const productType = (
        position.productType ||
        (position.isIntraday ? "MIS" : "CNC") ||
        "MIS"
      ).toUpperCase()
      const segment = (
        position.identity?.segment ||
        position.segment ||
        "NA"
      ).toUpperCase()
      const optionType = (
        position.identity?.optionType ||
        position.optionType ||
        "NA"
      ).toUpperCase()
      const strikePrice =
        position.identity?.strikePrice ?? position.strikePrice ?? null
      const expiry = (
        position.identity?.expiry ||
        position.expiry ||
        ""
      ).trim()
      const token = position.identity?.token ?? position.token ?? null
      const stockId =
        position.identity?.stockId ?? position.stockId ?? null
      const instrumentId =
        position.identity?.instrumentId ||
        position.stock?.instrumentId ||
        position.instrumentId ||
        null
      const identityCore =
        stockId ||
        instrumentId ||
        `${position.symbol}|${segment}|${optionType}|${strikePrice ?? "NA"}|${expiry || "NA"}|${token ?? "NA"}`
      const groupKey = `${identityCore}|${productType}`
      const existing = groups.get(groupKey)
      if (existing) {
        existing.positions.push(position)
        return
      }
      const productLabel = productType === "MIS" ? "INTRADAY" : productType
      const expiryLabel = expiry ? ` · ${expiry.slice(0, 10)}` : ""
      const optionLabel =
        optionType !== "NA"
          ? strikePrice !== null
            ? ` · ${strikePrice} ${optionType}`
            : ` · ${optionType}`
          : ""
      groups.set(groupKey, {
        key: groupKey,
        label: `${position.symbol} · ${segment}${optionLabel}${expiryLabel} · ${productLabel}`,
        positions: [position],
      })
    })

    const groupedList = Array.from(groups.values()).map((group) => ({
      ...group,
      positions: [...group.positions].sort((l, r) => {
        const lc = isPositionMarkedClosed(l)
        const rc = isPositionMarkedClosed(r)
        if (lc !== rc) return lc ? 1 : -1
        return Math.abs(r.quantity) - Math.abs(l.quantity)
      }),
    }))

    return groupedList.sort((a, b) => {
      const aOpen = a.positions.some((p) => !isPositionMarkedClosed(p))
      const bOpen = b.positions.some((p) => !isPositionMarkedClosed(p))
      if (aOpen !== bOpen) return aOpen ? -1 : 1
      const pnlA = a.positions.reduce(
        (s, p) => s + Math.abs(displayByPositionId.get(p.id)?.totalPnl ?? 0),
        0,
      )
      const pnlB = b.positions.reduce(
        (s, p) => s + Math.abs(displayByPositionId.get(p.id)?.totalPnl ?? 0),
        0,
      )
      return pnlB - pnlA
    })
  }, [positions, displayByPositionId])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAction = useCallback(
    async (
      action: "close" | "stoploss" | "target",
      positionId: string,
      value?: number,
      closeRequest?: CloseRequestOptions,
    ): Promise<boolean> => {
      setLoading(positionId)
      try {
        if (action === "close") {
          if (!tradingAccountId) throw new Error("Missing trading account")

          const position = positions.find((p) => p.id === positionId)
          const resolvedToken = parsePositiveIntegerMarketNumber(
            (position as any)?.identity?.token ??
              (position as any)?.stock?.token ??
              (position as any)?.token,
          )
          const resolvedInstrumentId =
            (position as any)?.identity?.instrumentId ||
            (position as any)?.stock?.instrumentId ||
            (position as any)?.instrumentId ||
            null
          const resolvedExchange =
            (position as any)?.identity?.exchange ||
            (position as any)?.stock?.exchange ||
            (position as any)?.exchange ||
            null
          const resolvedSegment =
            (position as any)?.identity?.segment ||
            (position as any)?.stock?.segment ||
            (position as any)?.segment ||
            null
          const quote = position
            ? (resolveQuoteFromMap(quotes as Record<string, any>, {
                token: resolvedToken ?? undefined,
                instrumentId: resolvedInstrumentId,
              }) ?? null)
            : null
          let quoteSnapshot = resolveDisplayQuoteSnapshot({
            quote,
            liveMaxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs,
            displayMaxAgeMs: marketDisplayQuoteFreshness.displayMaxAgeMs,
            staleQuotePriceMode: marketDisplayUi.staleQuotePriceMode,
          })
          if (
            !quoteSnapshot.isDisplayable ||
            (quoteSnapshot.tradePrice ?? 0) <= 0
          ) {
            toast({
              title: "Refreshing live price…",
              description: "Syncing latest quote before square-off.",
              duration: 1200,
            })
            const warmedQuote = await warmupQuote({
              token: resolvedToken,
              instrumentId: resolvedInstrumentId,
              exchange: resolvedExchange,
              segment: resolvedSegment,
              waitFreshMs: 1_200,
              liveMaxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs,
              displayMaxAgeMs: marketDisplayQuoteFreshness.displayMaxAgeMs,
            })
            quoteSnapshot = resolveDisplayQuoteSnapshot({
              quote: warmedQuote.quote,
              liveMaxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs,
              displayMaxAgeMs: marketDisplayQuoteFreshness.displayMaxAgeMs,
              staleQuotePriceMode: marketDisplayUi.staleQuotePriceMode,
            })
          }
          const currentLtp = quoteSnapshot.tradePrice ?? undefined
          if (currentLtp == null || !quoteSnapshot.isDisplayable) {
            const quoteAgeText =
              typeof quoteSnapshot.quoteAgeMs === "number"
                ? `${Math.max(1, Math.round(quoteSnapshot.quoteAgeMs / 1000))}s old`
                : "unavailable"
            throw new Error(
              `Quote required (≤60s) to square off. Current feed: ${quoteAgeText}.`,
            )
          }
          const optimisticCloseQuantity =
            closeRequest?.closeQuantity && closeRequest.closeQuantity > 0
              ? closeRequest.closeQuantity
              : closeRequest?.closeLots &&
                  closeRequest.closeLots > 0 &&
                  position?.lotSize
                ? closeRequest.closeLots * position.lotSize
                : undefined

          try {
            optimisticClosePosition(positionId, currentLtp, optimisticCloseQuantity)
          } catch {}

          const stockId =
            (position as any)?.identity?.stockId ||
            (position as any)?.stockId
          const rawProductType = (
            (position as any)?.productType ||
            ((position as any)?.isIntraday ? "MIS" : "CNC") ||
            "MIS"
          ).toUpperCase()
          if (!stockId)
            throw new Error("Missing stockId for this net position.")

          const netClosePayload: any = {
            stockId,
            productType: rawProductType,
            tradingAccountId,
            exitPrice: currentLtp,
            ltpTimestamp: quoteSnapshot.quoteTimestampMs ?? undefined,
            ltpAgeMs: quoteSnapshot.quoteAgeMs ?? undefined,
            ltpSource: quoteSnapshot.isFresh
              ? "LIVE_QUOTE"
              : "SNAPSHOT_FALLBACK",
          }
          if (resolvedToken !== null) netClosePayload.token = resolvedToken
          if (typeof resolvedInstrumentId === "string" && resolvedInstrumentId.trim())
            netClosePayload.instrumentId = resolvedInstrumentId.trim()
          if (typeof resolvedExchange === "string" && resolvedExchange.trim())
            netClosePayload.exchange = resolvedExchange.trim().toUpperCase()
          if (typeof resolvedSegment === "string" && resolvedSegment.trim())
            netClosePayload.segment = resolvedSegment.trim().toUpperCase()
          if (closeRequest?.closeQuantity && closeRequest.closeQuantity > 0)
            netClosePayload.closeQuantity = closeRequest.closeQuantity
          else if (closeRequest?.closeLots && closeRequest.closeLots > 0)
            netClosePayload.closeLots = closeRequest.closeLots

          const closeRes = await fetch("/api/trading/positions/net/close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(netClosePayload),
          })
          if (!closeRes.ok) {
            const errorData = await closeRes.json().catch(() => ({}))
            throw new Error(
              (errorData as any)?.error ||
                (errorData as any)?.message ||
                "Failed to close position",
            )
          }
          const closeResult = await closeRes.json()
          toast({
            title: closeResult?.isPartial ? "Partial Exit" : "Position Closed",
            description: closeResult?.message || "Successfully squared off.",
            className: "bg-green-500 text-white border-0 shadow-lg",
          })
          try { await refreshPositions() } catch {}
          try { await onPositionUpdate() } catch {}
          return true
        }

        if (action === "stoploss" && value !== undefined) {
          const position = positions.find((p) => p.id === positionId) as any
          const lotIds = Array.isArray(position?.lotIds) ? position.lotIds : []
          const fallbackLotId =
            typeof positionId === "string" &&
            !positionId.startsWith("net:") &&
            !positionId.startsWith("net-closed:")
              ? positionId
              : null
          const uniqueLotIds = Array.from(
            new Set(
              [...lotIds, ...(fallbackLotId ? [fallbackLotId] : [])].filter(
                (id): id is string =>
                  typeof id === "string" && id.trim().length > 0,
              ),
            ),
          )
          if (uniqueLotIds.length === 0)
            throw new Error("Missing underlying lots for this position.")
          const normalizedStopLoss = value > 0 ? value : null
          await Promise.all(
            uniqueLotIds.map(async (lotId) => {
              const res = await fetch("/api/trading/positions", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  positionId: lotId,
                  tradingAccountId,
                  updates: { stopLoss: normalizedStopLoss },
                }),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(
                  (err as any)?.error ||
                    (err as any)?.message ||
                    "Failed to update stop-loss",
                )
              }
            }),
          )
          try { await refreshPositions() } catch {}
          toast({
            title: normalizedStopLoss === null ? "SL Cleared" : "SL Updated",
            description:
              normalizedStopLoss === null
                ? "Stop-loss removed."
                : `Stop loss set at ${formatInr(normalizedStopLoss)}`,
          })
          return true
        }

        if (action === "target" && value !== undefined) {
          const position = positions.find((p) => p.id === positionId) as any
          const lotIds = Array.isArray(position?.lotIds) ? position.lotIds : []
          const fallbackLotId =
            typeof positionId === "string" &&
            !positionId.startsWith("net:") &&
            !positionId.startsWith("net-closed:")
              ? positionId
              : null
          const uniqueLotIds = Array.from(
            new Set(
              [...lotIds, ...(fallbackLotId ? [fallbackLotId] : [])].filter(
                (id): id is string =>
                  typeof id === "string" && id.trim().length > 0,
              ),
            ),
          )
          if (uniqueLotIds.length === 0)
            throw new Error("Missing underlying lots for this position.")
          const normalizedTarget = value > 0 ? value : null
          await Promise.all(
            uniqueLotIds.map(async (lotId) => {
              const res = await fetch("/api/trading/positions", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  positionId: lotId,
                  tradingAccountId,
                  updates: { target: normalizedTarget },
                }),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(
                  (err as any)?.error ||
                    (err as any)?.message ||
                    "Failed to update target",
                )
              }
            }),
          )
          try { await refreshPositions() } catch {}
          toast({
            title: normalizedTarget === null ? "Target Cleared" : "Target Updated",
            description:
              normalizedTarget === null
                ? "Target removed."
                : `Target set at ${formatInr(normalizedTarget)}`,
          })
          return true
        }

        return true
      } catch (error) {
        toast({
          title: "Action failed",
          description:
            error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
        if (action === "close") await refreshPositions()
        return false
      } finally {
        setLoading(null)
      }
    },
    [
      tradingAccountId,
      positions,
      quotes,
      optimisticClosePosition,
      refreshPositions,
      onPositionUpdate,
      warmupQuote,
      marketDisplayQuoteFreshness,
      marketDisplayUi,
    ],
  )

  const requestPanicCloseAll = useCallback(() => {
    setPanicConfirmStep(1)
    setPanicDialogOpen(true)
  }, [])

  const executePanicCloseAll = useCallback(async () => {
    setPanicRunning(true)
    try {
      const activePositions = positions.filter(
        (p) => !isPositionMarkedClosed(p),
      )
      for (const pos of activePositions) {
        await handleAction("close", pos.id)
      }
    } finally {
      setPanicRunning(false)
      setPanicDialogOpen(false)
      setPanicConfirmStep(1)
    }
  }, [positions, handleAction])

  // Keyboard hotkeys.
  // Bind the window keydown listener ONCE (empty deps) and read the latest
  // hoveredPositionId / positions / handleAction via refs. Previously the
  // effect deps included `positions` — which is a fresh array reference on
  // every realtime tick — so removeEventListener + addEventListener fired
  // 5–100 times per second on a busy account. Each rebind also created a
  // new closure that captured the current array.
  const hoveredPositionIdRef = useRef(hoveredPositionId)
  const positionsRef = useRef(positions)
  const handleActionRef = useRef(handleAction)
  useEffect(() => { hoveredPositionIdRef.current = hoveredPositionId }, [hoveredPositionId])
  useEffect(() => { positionsRef.current = positions }, [positions])
  useEffect(() => { handleActionRef.current = handleAction }, [handleAction])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur()
      }
      const hoveredId = hoveredPositionIdRef.current
      if ((e.ctrlKey || e.metaKey) && e.key === "x" && hoveredId) {
        e.preventDefault()
        const pos = positionsRef.current.find((p) => p.id === hoveredId)
        if (pos && !isPositionMarkedClosed(pos))
          handleActionRef.current("close", hoveredId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // ── Empty state ───────────────────────────────────────────────────────────
  // Only show full-page empty when there's no live data AND no history to display.
  // If history is present, render the full component so the History sub-tab is reachable.

  const hasHistory = (closedPositionHistory?.length ?? 0) > 0

  if (positions.length === 0 && !hasHistory) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-24 bg-zinc-50 dark:bg-[#09090d] rounded-lg border border-zinc-200 dark:border-[#1e1e26]"
      >
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-[#0f0f14] border border-zinc-200 dark:border-[#1e1e26] flex items-center justify-center mb-4">
          <Activity className="w-5 h-5 text-zinc-400 dark:text-[#3f3f46]" />
        </div>
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-[#3f3f46]">
          No Open Positions
        </p>
        <p className="text-[10px] text-zinc-400 dark:text-[#27272a] mt-1 font-mono">
          Market is waiting
        </p>
      </motion.div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full bg-zinc-50 dark:bg-[#09090d] border border-zinc-200 dark:border-[#1e1e26] rounded-lg overflow-hidden">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-[#0c0c10] border-b border-zinc-200 dark:border-[#1e1e26]">

        {/* Metrics bar */}
        <div className="flex items-stretch">
          <div className="flex items-stretch divide-x divide-zinc-200 dark:divide-[#1e1e26] flex-1 min-w-0">

            {/* Open MTM */}
            <div className="px-5 py-3 flex flex-col gap-0.5 min-w-[130px]">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                Open MTM
              </span>
              <motion.span
                className={cn(
                  "text-lg font-mono font-black tabular-nums tracking-tight leading-none",
                  openMtm === null
                    ? "text-zinc-400 dark:text-[#3f3f46]"
                    : openMtm >= 0
                      ? "text-green-600 dark:text-[#4ade80]"
                      : "text-red-500 dark:text-[#f87171]",
                )}
                animate={
                  openMtm !== null
                    ? {
                        textShadow:
                          openMtm >= 0
                            ? [
                                "0 0 0px rgba(74,222,128,0)",
                                "0 0 14px rgba(74,222,128,0.55)",
                                "0 0 0px rgba(74,222,128,0)",
                              ]
                            : [
                                "0 0 0px rgba(248,113,113,0)",
                                "0 0 14px rgba(248,113,113,0.55)",
                                "0 0 0px rgba(248,113,113,0)",
                              ],
                      }
                    : {}
                }
                transition={{ duration: 3.5, repeat: Infinity }}
              >
                {openMtm !== null
                  ? formatSignedInr(openMtm, 2, { alwaysShowPlus: true })
                  : "--"}
              </motion.span>
              {hasUnknownOpenPositions && (
                <span className="text-[9px] font-mono text-amber-800 dark:text-[#78716c]">
                  partial data
                </span>
              )}
            </div>

            {/* Booked Today */}
            <div className="px-5 py-3 flex flex-col gap-0.5 min-w-[120px]">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                Booked Today
              </span>
              <motion.span
                className={cn(
                  "text-lg font-mono font-black tabular-nums tracking-tight leading-none",
                  bookedToday >= 0 ? "text-blue-600 dark:text-[#60a5fa]" : "text-orange-600 dark:text-[#fb923c]",
                )}
                animate={{
                  textShadow:
                    bookedToday >= 0
                      ? [
                          "0 0 0px rgba(96,165,250,0)",
                          "0 0 14px rgba(96,165,250,0.5)",
                          "0 0 0px rgba(96,165,250,0)",
                        ]
                      : [
                          "0 0 0px rgba(251,146,60,0)",
                          "0 0 14px rgba(251,146,60,0.5)",
                          "0 0 0px rgba(251,146,60,0)",
                        ],
                }}
                transition={{ duration: 3.5, repeat: Infinity }}
              >
                {formatSignedInr(bookedToday, 2, { alwaysShowPlus: true })}
              </motion.span>
            </div>

            {/* Active Positions */}
            <div className="hidden sm:flex px-5 py-3 flex-col gap-0.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                Active
              </span>
              <span className="text-lg font-mono font-black tabular-nums tracking-tight leading-none text-zinc-900 dark:text-[#e4e4e7]">
                {formatIndianNumber(totalPositions, 0)}
              </span>
              <span className="text-[9px] font-mono text-zinc-400 dark:text-[#3f3f46]">
                positions
              </span>
            </div>
          </div>

          {/* Panic button */}
          <div className="flex items-center px-4 border-l border-zinc-200 dark:border-[#1e1e26] shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={panicRunning}
                  onClick={requestPanicCloseAll}
                  className="h-8 px-3 bg-red-100 hover:bg-red-200 text-red-900 hover:text-red-950 border border-red-300 hover:border-red-500 font-mono text-[10px] tracking-[0.15em] font-black gap-1.5 transition-all rounded-[3px] shadow-none dark:bg-[#450a0a] dark:hover:bg-[#7f1d1d] dark:text-[#fca5a5] dark:hover:text-white dark:border-[#7f1d1d] dark:hover:border-[#ef4444]"
                >
                  {panicRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">PANIC</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent
                sideOffset={8}
                className="bg-white border-zinc-200 text-zinc-700 text-[11px] font-mono dark:bg-[#0c0c10] dark:border-[#27272a] dark:text-[#a1a1aa]"
              >
                Close all open positions immediately
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── PANIC DIALOG ── */}
      <Dialog
        open={panicDialogOpen}
        onOpenChange={(open) => {
          setPanicDialogOpen(open)
          if (!open) setPanicConfirmStep(1)
        }}
      >
        <DialogContent className="max-w-sm bg-white border-zinc-200 text-zinc-900 rounded-md p-5 dark:bg-[#0c0c10] dark:border-[#1e1e26] dark:text-zinc-100">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-[#fca5a5] text-[13px] font-mono tracking-[0.12em] uppercase">
              <AlertTriangle className="h-4 w-4 text-red-500 dark:text-[#f87171]" />
              Panic Exit
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-[#71717a] text-[11px] font-mono leading-relaxed">
              {panicConfirmStep === 1
                ? "This will market-close ALL active positions immediately. Orders cannot be recalled once placed."
                : "Final confirmation. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[3px] border border-red-300 bg-red-50 p-3 space-y-1 dark:border-[#7f1d1d] dark:bg-[#200808]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono font-bold text-red-500 dark:text-[#f87171] tracking-wider">
                  CLOSE ALL POSITIONS
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-[#71717a] font-mono mt-0.5">
                  Active:{" "}
                  <span className="text-zinc-600 dark:text-[#a1a1aa] font-bold">
                    {formatIndianNumber(
                      positions.filter((p) => !isPositionMarkedClosed(p))
                        .length,
                      0,
                    )}
                  </span>
                </p>
              </div>
              <span className="text-[9px] font-mono font-black text-red-500 dark:text-[#f87171] border border-red-300 dark:border-[#7f1d1d] px-2 py-0.5 rounded-[2px] tracking-[0.2em]">
                RISK
              </span>
            </div>
          </div>

          {panicConfirmStep === 2 && (
            <div className="rounded-[3px] border border-zinc-200 bg-zinc-50 p-3 dark:border-[#1e1e26] dark:bg-[#0f0f14]">
              <p className="text-[10px] text-zinc-500 dark:text-[#71717a] font-mono leading-relaxed">
                Market close orders will be sent for every open position.
                Slippage may occur during volatile conditions.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 flex-row">
            <Button
              variant="ghost"
              disabled={panicRunning}
              className="flex-1 text-zinc-600 hover:text-zinc-900 font-mono text-[11px] border border-zinc-300 hover:border-zinc-400 bg-transparent h-8 rounded-[3px] dark:text-zinc-500 dark:text-[#71717a] dark:hover:text-zinc-100 dark:border-zinc-300 dark:border-[#27272a] dark:hover:border-zinc-400 dark:hover:border-[#3f3f46]"
              onClick={() => {
                setPanicDialogOpen(false)
                setPanicConfirmStep(1)
              }}
            >
              Cancel
            </Button>
            {panicConfirmStep === 1 ? (
              <Button
                disabled={panicRunning}
                className="flex-1 bg-red-700 hover:bg-red-800 text-white border-0 font-mono text-[11px] tracking-wider h-8 rounded-[3px] dark:bg-[#7f1d1d] dark:hover:bg-[#991b1b] dark:text-[#fca5a5] dark:hover:text-white"
                onClick={() => setPanicConfirmStep(2)}
              >
                Continue →
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  disabled={panicRunning}
                  className="text-zinc-600 hover:text-zinc-900 font-mono text-[11px] border border-zinc-300 h-8 bg-transparent rounded-[3px] dark:text-zinc-500 dark:text-[#71717a] dark:hover:text-zinc-100 dark:border-zinc-300 dark:border-[#27272a]"
                  onClick={() => setPanicConfirmStep(1)}
                >
                  ← Back
                </Button>
                <Button
                  disabled={panicRunning}
                  className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-white border-0 font-mono text-[11px] font-black tracking-[0.15em] h-8 rounded-[3px]"
                  onClick={executePanicCloseAll}
                >
                  {panicRunning && (
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  )}
                  CLOSE ALL
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MOBILE VIEW ── */}
      <div className="block md:hidden bg-zinc-50 dark:bg-[#09090d]">

        {/* ── Sub-tab switcher: Positions | History ── */}
        <div className="flex items-stretch border-b border-zinc-200 dark:border-[#1e1e26] px-3 pt-2">
          {(["live", "history"] as MobilePositionTab[]).map((tab) => {
            const isActive = mobileTab === tab
            const count =
              tab === "live"
                ? positions.filter((p) => !p.isClosed && Number(p.quantity) !== 0).length
                : (closedPositionHistory?.length ?? 0)
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={cn(
                  "-mb-px mr-4 flex items-center gap-1.5 border-b-2 pb-2 text-[11px] font-mono font-semibold uppercase tracking-[0.1em] transition-colors",
                  isActive
                    ? "border-zinc-700 dark:border-zinc-400 text-zinc-800 dark:text-[#e4e4e7]"
                    : "border-transparent text-zinc-400 dark:text-[#52525b] hover:text-zinc-600 dark:hover:text-[#71717a]",
                )}
              >
                {tab === "live" ? "Positions" : "History"}
                {count > 0 && (
                  <span className={cn(
                    "text-[9px] tabular-nums font-mono",
                    isActive ? "text-zinc-500 dark:text-[#71717a]" : "text-zinc-300 dark:text-[#3f3f46]",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Live positions tab ── */}
        {mobileTab === "live" && (
          <div className="p-2 space-y-2">
            {positions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Activity className="w-5 h-5 text-zinc-300 dark:text-[#27272a]" />
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-400 dark:text-[#3f3f46]">No open positions</p>
              </div>
            )}
            {groupedPositions.map((group) => {
          const posList = group.positions
          const groupNetPnL = resolveGroupDisplayTotal({
            positionIds: posList.map((p) => p.id),
            displayByPositionId,
          })

          return (
            <motion.div
              key={group.key}
              className="rounded-md border border-zinc-200 dark:border-[#1e1e26] overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {/* Group header */}
              <div className="px-3 py-1.5 flex justify-between items-center bg-zinc-100/95 dark:bg-[#0f0f13] border-b border-zinc-200 dark:border-[#1a1a20]">
                <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b] truncate">
                  {group.label}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-mono tabular-nums font-bold ml-3 shrink-0",
                    groupNetPnL === null
                      ? "text-zinc-400 dark:text-[#3f3f46]"
                      : groupNetPnL >= 0
                        ? "text-green-600 dark:text-[#4ade80]"
                        : "text-red-500 dark:text-[#f87171]",
                  )}
                >
                  {groupNetPnL === null
                    ? "--"
                    : formatSignedInr(groupNetPnL, 2, {
                        alwaysShowPlus: true,
                      })}
                </span>
              </div>

              <AnimatePresence mode="popLayout">
                {posList.map((position) => {
                  const isClosed = isPositionMarkedClosed(position)
                  const rowDisplay = displayByPositionId.get(position.id)
                  const resolvedPnl = resolvedByPositionId.get(position.id)
                  const currentPrice =
                    rowDisplay?.displayPrice ??
                    resolvedPnl?.currentPrice ??
                    position.averagePrice
                  const displayCurrentPrice = rowDisplay?.displayPrice ?? null
                  const pnl = rowDisplay?.totalPnl ?? null
                  const isProfitable = (pnl ?? 0) >= 0
                  const feedBadge = resolvePositionFeedBadgeMeta(
                    rowDisplay,
                    marketDisplayUi.staleBadgeAfterMs,
                    marketDisplayUi.quoteBadgesEnabled,
                  )
                  const instrumentMeta = resolvePositionInstrumentMeta(position)
                  const resolvedOptionType =
                    position.identity?.optionType || position.optionType
                  const resolvedSegment = (
                    position.identity?.segment ||
                    position.segment ||
                    ""
                  ).toUpperCase()
                  const resolvedProductType = (
                    position.productType ||
                    (position.isIntraday ? "MIS" : "CNC") ||
                    "MIS"
                  ).toUpperCase()
                  const isFutures =
                    resolvedSegment === "NFO" && !resolvedOptionType
                  const isOption =
                    resolvedSegment === "NFO" && !!resolvedOptionType
                  const riskPercent = getRiskProgressPercent(
                    currentPrice,
                    position.averagePrice,
                    position.stopLoss ?? null,
                    position.target ?? null,
                    position.quantity,
                  )
                  const directionColor = isClosed
                    ? "#3f3f46"
                    : position.quantity > 0
                      ? "#22c55e"
                      : "#ef4444"

                  return (
                    <motion.div
                      key={position.id}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className={cn(
                        "flex flex-col border-b last:border-b-0 border-zinc-200 dark:border-zinc-200 dark:border-[#141419] border-l-[3px] bg-white dark:bg-white dark:bg-[#0c0c10]",
                        isClosed && "opacity-40",
                      )}
                      style={{ borderLeftColor: directionColor }}
                    >
                      <div className="p-3 space-y-2.5">
                        {/* Row 1: Symbol + PnL */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0 gap-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[14px] font-mono font-black text-zinc-950 dark:text-[#f4f4f5]">
                                {position.symbol}
                              </span>
                              {!isClosed ? (
                                <span
                                  className={cn(
                                    "text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none",
                                    position.quantity > 0
                                      ? "text-green-700 bg-green-100 dark:text-[#4ade80] dark:bg-[#052e16]"
                                      : "text-red-700 bg-red-100 dark:text-red-500 dark:text-[#f87171] dark:bg-[#2d0707]",
                                  )}
                                >
                                  {position.quantity > 0 ? "LONG" : "SHORT"}
                                </span>
                              ) : (
                                <span className="text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none text-zinc-500 dark:text-[#52525b] bg-zinc-200 dark:bg-[#1a1a22]">
                                  CLOSED
                                </span>
                              )}
                              {feedBadge ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={cn(
                                        "text-[9px] font-mono font-bold px-1 py-px rounded-[2px] leading-none border cursor-default",
                                        feedBadge.className,
                                      )}
                                    >
                                      {feedBadge.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{feedBadge.tooltip}</TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                            {position.instrumentLabel ? (
                              <p className="text-[10px] text-zinc-600 dark:text-zinc-400 wrap-break-word leading-snug -mt-0.5">
                                {position.instrumentLabel}
                              </p>
                            ) : null}

                            {/* Meta badges */}
                            <div className="flex flex-wrap gap-1">
                              {instrumentMeta.exchange && (
                                <span className="text-[9px] font-mono text-indigo-700 bg-indigo-100 dark:text-[#818cf8] dark:bg-[#1e1b4b] px-1 py-px rounded-[2px]">
                                  {instrumentMeta.exchange}
                                </span>
                              )}
                              {instrumentMeta.segment &&
                                instrumentMeta.segment !==
                                  instrumentMeta.exchange && (
                                  <span className="text-[9px] font-mono text-purple-700 bg-purple-100 dark:text-[#c084fc] dark:bg-[#2e1065] px-1 py-px rounded-[2px]">
                                    {instrumentMeta.segment}
                                  </span>
                                )}
                              {!isClosed && (
                                <span className="text-[9px] font-mono text-blue-700 bg-blue-100 dark:text-blue-600 dark:text-[#60a5fa] dark:bg-[#1e3a5f] px-1 py-px rounded-[2px]">
                                  {resolvedProductType}
                                </span>
                              )}
                              {isFutures && (
                                <span className="text-[9px] font-mono text-cyan-700 bg-cyan-100 dark:text-[#22d3ee] dark:bg-[#0a3342] px-1 py-px rounded-[2px]">
                                  FUT
                                </span>
                              )}
                              {isOption && (
                                <span className="text-[9px] font-mono text-amber-800 bg-amber-100 dark:text-[#fbbf24] dark:bg-[#2d1f00] px-1 py-px rounded-[2px]">
                                  {resolvedOptionType || "OPT"}
                                </span>
                              )}
                              {instrumentMeta.expiry && (
                                <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
                                  EXP {instrumentMeta.expiry}
                                </span>
                              )}
                              {instrumentMeta.strikePrice !== null && (
                                <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
                                  K{" "}
                                  {formatIndianNumber(
                                    instrumentMeta.strikePrice,
                                    2,
                                  )}
                                </span>
                              )}
                              {instrumentMeta.lotSize &&
                                instrumentMeta.lotSize > 1 && (
                                  <span className="text-[9px] font-mono text-cyan-800 bg-cyan-100 dark:text-[#0891b2] dark:bg-[#0a3342] px-1 py-px rounded-[2px]">
                                    LOT{" "}
                                    {formatIndianNumber(
                                      instrumentMeta.lotSize,
                                      0,
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* PnL */}
                          <div className="flex flex-col items-end shrink-0">
                            <span
                              className={cn(
                                "text-[15px] font-mono font-black tabular-nums tracking-tight",
                                pnl === null
                                  ? "text-zinc-400 dark:text-[#3f3f46]"
                                  : isProfitable
                                    ? "text-green-600 dark:text-[#4ade80]"
                                    : "text-red-500 dark:text-[#f87171]",
                              )}
                            >
                              {pnl === null
                                ? "--"
                                : formatSignedInr(pnl, 2, {
                                    alwaysShowPlus: true,
                                  })}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 dark:text-[#52525b] mt-0.5">
                              Qty{" "}
                              <span className="text-zinc-600 dark:text-[#a1a1aa]">
                                {formatIndianNumber(
                                  Math.abs(position.quantity),
                                  0,
                                )}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Row 2: Price */}
                        <div className="flex items-center gap-2.5 text-[11px] font-mono">
                          <span className="text-zinc-500 dark:text-[#52525b]">
                            Avg{" "}
                            <span className="text-zinc-500 dark:text-[#71717a]">
                              {formatInr(position.averagePrice, 2)}
                            </span>
                          </span>
                          <span className="text-zinc-400 dark:text-[#27272a]">·</span>
                          <span className="text-zinc-500 dark:text-[#52525b]">
                            LTP{" "}
                            <span className="text-zinc-900 dark:text-[#e4e4e7] font-bold">
                              {displayCurrentPrice !== null
                                ? formatInr(displayCurrentPrice, 2)
                                : "--"}
                            </span>
                          </span>
                        </div>

                        {/* Risk bar */}
                        {!isClosed &&
                          (position.stopLoss != null ||
                            position.target != null) && (
                            <div className="h-[2px] bg-zinc-200 dark:bg-[#1a1a22] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{
                                  backgroundColor: isProfitable
                                    ? "#22c55e"
                                    : "#ef4444",
                                }}
                                initial={{ width: "0%" }}
                                animate={{
                                  width: `${riskPercent.toFixed(2)}%`,
                                }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              />
                            </div>
                          )}

                        {/* Actions */}
                        {!isClosed && (
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-[#141419]">
                            <div className="flex items-center gap-1.5">
                              <InlineEdit
                                value={position.stopLoss}
                                placeholder="SL"
                                icon={Shield}
                                colorClass="text-red-500"
                                onSave={(val: number) =>
                                  handleAction("stoploss", position.id, val)
                                }
                                isLoading={loading === position.id}
                              />
                              <InlineEdit
                                value={position.target}
                                placeholder="TP"
                                icon={Target}
                                colorClass="text-green-500"
                                onSave={(val: number) =>
                                  handleAction("target", position.id, val)
                                }
                                isLoading={loading === position.id}
                              />
                            </div>

                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="h-7 px-3 bg-red-100 hover:bg-red-200 text-red-900 hover:text-red-950 border border-red-300 hover:border-red-500 rounded-[3px] font-mono text-[10px] font-black tracking-[0.15em] transition-all dark:bg-[#450a0a] dark:hover:bg-[#7f1d1d] dark:text-red-600 dark:text-[#fca5a5] dark:hover:text-white dark:border-red-300 dark:border-[#7f1d1d] dark:hover:border-[#ef4444]">
                                  EXIT
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-52 p-3 bg-white border-zinc-200 rounded-md shadow-2xl dark:bg-white dark:bg-[#0c0c10] dark:border-zinc-200 dark:border-[#1e1e26]"
                                sideOffset={6}
                              >
                                <ExitPopoverContent
                                  position={position}
                                  loading={loading === position.id}
                                  onClose={(opts) =>
                                    handleAction(
                                      "close",
                                      position.id,
                                      undefined,
                                      opts,
                                    )
                                  }
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )
            })}
          </div>
        )}

        {/* ── History tab: today's closed positions ── */}
        {mobileTab === "history" && (
          <div className="p-2 space-y-2">
            {!closedPositionHistory || closedPositionHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-[#0f0f14] border border-zinc-200 dark:border-[#1e1e26] flex items-center justify-center">
                  <Activity className="w-4 h-4 text-zinc-300 dark:text-[#27272a]" />
                </div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-400 dark:text-[#3f3f46]">No closed trades today</p>
                <p className="text-[10px] font-mono text-zinc-300 dark:text-[#27272a]">Completed positions appear here</p>
              </div>
            ) : (
              closedPositionHistory.map((row) => {
                const isLong = row.side === "LONG"
                const pnlPos = row.realizedPnL >= 0
                const borderColor = pnlPos ? "#22c55e" : "#ef4444"
                return (
                  <motion.div
                    key={row.positionId}
                    className="rounded-md border border-zinc-200 dark:border-[#1e1e26] overflow-hidden bg-white dark:bg-[#0c0c10] border-l-[3px]"
                    style={{ borderLeftColor: borderColor }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-3 space-y-2.5">
                      {/* Symbol + P&L */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-mono font-black text-zinc-950 dark:text-[#f4f4f5]">{row.symbol}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                                isLong
                                  ? "bg-green-100 text-green-700 dark:bg-[#14532d]/40 dark:text-[#4ade80]"
                                  : "bg-red-100 text-red-700 dark:bg-[#450a0a]/40 dark:text-[#f87171]",
                              )}
                            >
                              {isLong ? "▲ LONG" : "▼ SHORT"}
                            </span>
                            {row.productType && (
                              <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-400 dark:text-[#52525b]">
                                {row.productType}
                              </span>
                            )}
                            <span className="text-[9px] font-mono text-zinc-400 dark:text-[#3f3f46]">
                              {fmtHeldDuration(row.heldMs)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={cn(
                              "text-[15px] font-mono font-black tabular-nums leading-none",
                              pnlPos ? "text-green-600 dark:text-[#4ade80]" : "text-red-500 dark:text-[#f87171]",
                            )}
                          >
                            {pnlPos ? "+" : "−"}₹{Math.abs(row.realizedPnL).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-400 dark:text-[#52525b]">realized</span>
                        </div>
                      </div>

                      {/* Entry → Exit prices and times */}
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-400 dark:text-[#52525b] text-[9px] uppercase tracking-[0.12em]">Entry</span>
                          <span className="text-zinc-700 dark:text-[#a1a1aa] font-semibold">
                            ₹{row.averageEntryPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-zinc-400 dark:text-[#3f3f46] text-[10px]">{fmtHistoryTime(row.entryAt)}</span>
                        </div>
                        <span className="text-zinc-300 dark:text-[#27272a] text-lg shrink-0">→</span>
                        <div className="flex flex-col gap-0.5 items-center">
                          <span className="text-zinc-400 dark:text-[#52525b] text-[9px] uppercase tracking-[0.12em]">Exit</span>
                          <span className="text-zinc-700 dark:text-[#a1a1aa] font-semibold">
                            {row.averageExitPrice != null
                              ? `₹${row.averageExitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </span>
                          <span className="text-zinc-400 dark:text-[#3f3f46] text-[10px]">{fmtHistoryTime(row.exitAt)}</span>
                        </div>
                        {row.balanceAfter != null && (
                          <div className="flex flex-col gap-0.5 items-end pl-2 border-l border-zinc-100 dark:border-[#1e1e26]">
                            <span className="text-zinc-400 dark:text-[#52525b] text-[9px] uppercase tracking-[0.12em]">Balance</span>
                            <span className="text-zinc-700 dark:text-[#a1a1aa] font-semibold">
                              ₹{row.balanceAfter.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="hidden md:block overflow-x-auto">
        <Table className="w-full text-xs border-collapse">
          <TableHeader>
            <TableRow className="border-b border-zinc-200 dark:border-[#1a1a20] hover:bg-transparent bg-zinc-100/95 dark:bg-[#0f0f13]">
              <TableHead className="h-8 pl-5 pr-3 py-0 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b] w-[38%]">
                Symbol
              </TableHead>
              <TableHead className="h-8 px-3 py-0 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                Qty
              </TableHead>
              <TableHead className="h-8 px-3 py-0 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                Avg Price
              </TableHead>
              <TableHead className="h-8 px-3 py-0 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                LTP
              </TableHead>
              <TableHead className="h-8 px-3 py-0 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                SL / TP
              </TableHead>
              <TableHead className="h-8 px-4 py-0 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-[#52525b]">
                P&amp;L
              </TableHead>
              <TableHead className="h-8 px-4 py-0 text-center font-mono text-[9px] text-zinc-400 dark:text-[#3f3f46] w-12">
                ×
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <AnimatePresence mode="popLayout">
              {groupedPositions.map((group) => {
                const posList = group.positions
                const groupNetPnL = resolveGroupDisplayTotal({
                  positionIds: posList.map((p) => p.id),
                  displayByPositionId,
                })

                return (
                  <React.Fragment key={group.key}>
                    {/* Group separator row */}
                    <motion.tr
                      className="bg-zinc-100 dark:bg-[#0a0a0d] border-t-2 border-zinc-200 dark:border-[#1a1a20] first:border-t-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <TableCell
                        colSpan={5}
                        className="py-1.5 pl-5 pr-3"
                      >
                        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-[#3f3f46]">
                          {group.label}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-1.5 px-4 text-right text-[11px] font-mono font-bold tabular-nums",
                          groupNetPnL === null
                            ? "text-zinc-400 dark:text-[#3f3f46]"
                            : groupNetPnL >= 0
                              ? "text-green-600 dark:text-[#4ade80]"
                              : "text-red-500 dark:text-[#f87171]",
                        )}
                      >
                        {groupNetPnL === null
                          ? "--"
                          : formatSignedInr(groupNetPnL, 2, {
                              alwaysShowPlus: true,
                            })}
                      </TableCell>
                      <TableCell className="py-1.5 px-4" />
                    </motion.tr>

                    {/* Position rows */}
                    {posList.map((position) => {
                      const isClosed = isPositionMarkedClosed(position)
                      const rowDisplay = displayByPositionId.get(position.id)
                      const resolvedPnl = resolvedByPositionId.get(position.id)
                      const currentPrice =
                        rowDisplay?.displayPrice ??
                        resolvedPnl?.currentPrice ??
                        position.averagePrice
                      const displayCurrentPrice =
                        rowDisplay?.displayPrice ?? null
                      const pnl = rowDisplay?.totalPnl ?? null
                      const isProfitable = (pnl ?? 0) >= 0
                      const feedBadge = resolvePositionFeedBadgeMeta(
                    rowDisplay,
                    marketDisplayUi.staleBadgeAfterMs,
                    marketDisplayUi.quoteBadgesEnabled,
                  )
                      const instrumentMeta =
                        resolvePositionInstrumentMeta(position)
                      const resolvedOptionType =
                        position.identity?.optionType || position.optionType
                      const resolvedSegment = (
                        position.identity?.segment ||
                        position.segment ||
                        ""
                      ).toUpperCase()
                      const resolvedProductType = (
                        position.productType ||
                        (position.isIntraday ? "MIS" : "CNC") ||
                        "MIS"
                      ).toUpperCase()
                      const isFutures =
                        resolvedSegment === "NFO" && !resolvedOptionType
                      const isOption =
                        resolvedSegment === "NFO" && !!resolvedOptionType
                      const directionColor = isClosed
                        ? "#3f3f46"
                        : position.quantity > 0
                          ? "#22c55e"
                          : "#ef4444"

                      // P&L heatmap
                      const intensity =
                        pnl === null
                          ? 0
                          : Math.min(Math.abs(pnl) / maxAbsPnl, 1)
                      const pnlBgColor =
                        pnl === null
                          ? undefined
                          : isProfitable
                            ? `rgba(34,197,94,${intensity * pnlHeatAlpha})`
                            : `rgba(239,68,68,${intensity * pnlHeatAlpha})`

                      return (
                        <motion.tr
                          key={position.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.99 }}
                          className={cn(
                            "border-b border-zinc-200 dark:border-[#111116] transition-colors duration-100 group/row",
                            isClosed ? "opacity-35" : "hover:bg-zinc-100 dark:bg-[#0f0f14]",
                          )}
                          onMouseEnter={() =>
                            setHoveredPositionId(position.id)
                          }
                          onMouseLeave={() => setHoveredPositionId(null)}
                        >
                          {/* Symbol cell — carries left border stripe */}
                          <TableCell
                            className="py-3 pl-0 pr-3 border-l-[3px]"
                            style={{ borderLeftColor: directionColor }}
                          >
                            <div className="flex items-center gap-2.5 pl-4">
                              {/* Pulse dot */}
                              <div className="relative flex-shrink-0 w-1.5 h-1.5">
                                <div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: directionColor }}
                                />
                                {!isClosed && (
                                  <motion.div
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                      backgroundColor: directionColor,
                                    }}
                                    animate={{
                                      scale: [1, 2.5, 1],
                                      opacity: [0.7, 0, 0.7],
                                    }}
                                    transition={{
                                      duration: 2.5,
                                      repeat: Infinity,
                                    }}
                                  />
                                )}
                              </div>

                              <div className="flex flex-col min-w-0 gap-1">
                                {/* Symbol + direction + feed */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className="font-mono font-bold text-[13px] text-zinc-950 dark:text-[#f4f4f5] truncate max-w-[200px]"
                                    title={position.symbol}
                                  >
                                    {position.symbol}
                                  </span>
                                  {!isClosed ? (
                                    <span
                                      className={cn(
                                        "text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none",
                                        position.quantity > 0
                                          ? "text-green-700 bg-green-100 dark:text-[#4ade80] dark:bg-[#052e16]"
                                          : "text-red-700 bg-red-100 dark:text-red-500 dark:text-[#f87171] dark:bg-[#2d0707]",
                                      )}
                                    >
                                      {position.quantity > 0 ? "L" : "S"}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-mono font-black px-1 py-px rounded-[2px] leading-none text-zinc-500 dark:text-[#52525b] bg-zinc-200 dark:bg-[#1a1a22]">
                                      CLO
                                    </span>
                                  )}
                                  {feedBadge ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className={cn(
                                            "text-[9px] font-mono font-bold px-1 py-px rounded-[2px] leading-none border cursor-default",
                                            feedBadge.className,
                                          )}
                                        >
                                          {feedBadge.label}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {feedBadge.tooltip}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>

                                {/* Instrument name */}
                                {instrumentMeta.instrumentName &&
                                  instrumentMeta.instrumentName.toUpperCase() !==
                                    position.symbol.toUpperCase() && (
                                    <span
                                      className="text-[10px] font-mono text-zinc-500 dark:text-[#52525b] truncate max-w-[240px]"
                                      title={instrumentMeta.instrumentName}
                                    >
                                      {instrumentMeta.instrumentName}
                                    </span>
                                  )}

                                {/* Meta badges */}
                                <div className="flex flex-wrap gap-1">
                                  {instrumentMeta.exchange && (
                                    <span className="text-[9px] font-mono text-indigo-700 bg-indigo-100 dark:text-[#818cf8] dark:bg-[#1e1b4b] px-1 py-px rounded-[2px]">
                                      {instrumentMeta.exchange}
                                    </span>
                                  )}
                                  {instrumentMeta.segment &&
                                    instrumentMeta.segment !==
                                      instrumentMeta.exchange && (
                                      <span className="text-[9px] font-mono text-purple-700 bg-purple-100 dark:text-[#c084fc] dark:bg-[#2e1065] px-1 py-px rounded-[2px]">
                                        {instrumentMeta.segment}
                                      </span>
                                    )}
                                  {!isClosed && (
                                    <span className="text-[9px] font-mono text-blue-700 bg-blue-100 dark:text-blue-600 dark:text-[#60a5fa] dark:bg-[#1e3a5f] px-1 py-px rounded-[2px]">
                                      {resolvedProductType}
                                    </span>
                                  )}
                                  {isFutures && !isClosed && (
                                    <span className="text-[9px] font-mono text-cyan-700 bg-cyan-100 dark:text-[#22d3ee] dark:bg-[#0a3342] px-1 py-px rounded-[2px]">
                                      FUT
                                    </span>
                                  )}
                                  {isOption && !isClosed && (
                                    <span className="text-[9px] font-mono text-amber-800 bg-amber-100 dark:text-[#fbbf24] dark:bg-[#2d1f00] px-1 py-px rounded-[2px]">
                                      {resolvedOptionType || "OPT"}
                                    </span>
                                  )}
                                  {instrumentMeta.expiry && (
                                    <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
                                      EXP {instrumentMeta.expiry}
                                    </span>
                                  )}
                                  {instrumentMeta.strikePrice !== null && (
                                    <span className="text-[9px] font-mono text-zinc-600 bg-zinc-200 dark:text-[#71717a] dark:bg-[#1a1a22] px-1 py-px rounded-[2px]">
                                      K{" "}
                                      {formatIndianNumber(
                                        instrumentMeta.strikePrice,
                                        2,
                                      )}
                                    </span>
                                  )}
                                  {instrumentMeta.optionType && (
                                    <span className="text-[9px] font-mono text-amber-800 bg-amber-100 dark:text-[#fbbf24] dark:bg-[#2d1f00] px-1 py-px rounded-[2px]">
                                      {instrumentMeta.optionType}
                                    </span>
                                  )}
                                  {instrumentMeta.lotSize &&
                                    instrumentMeta.lotSize > 1 && (
                                      <span className="text-[9px] font-mono text-cyan-800 bg-cyan-100 dark:text-[#0891b2] dark:bg-[#0a3342] px-1 py-px rounded-[2px]">
                                        LOT{" "}
                                        {formatIndianNumber(
                                          instrumentMeta.lotSize,
                                          0,
                                        )}
                                      </span>
                                    )}
                                </div>

                                {/* Token / InstrumentId (sub-text) */}
                                {(instrumentMeta.token !== null ||
                                  instrumentMeta.instrumentId) && (
                                  <div className="flex gap-2 text-[9px] font-mono text-zinc-400 dark:text-[#3f3f46]">
                                    {instrumentMeta.token !== null && (
                                      <span>T:{instrumentMeta.token}</span>
                                    )}
                                    {instrumentMeta.instrumentId && (
                                      <span
                                        className="truncate max-w-[160px]"
                                        title={instrumentMeta.instrumentId}
                                      >
                                        ID:{instrumentMeta.instrumentId}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Qty */}
                          <TableCell className="py-3 px-3 text-right font-mono tabular-nums text-[13px] text-zinc-900 dark:text-[#e4e4e7] font-bold">
                            {formatIndianNumber(position.quantity, 0)}
                          </TableCell>

                          {/* Avg */}
                          <TableCell className="py-3 px-3 text-right font-mono tabular-nums text-[12px] text-zinc-500 dark:text-[#71717a]">
                            {formatInr(position.averagePrice, 2)}
                          </TableCell>

                          {/* LTP */}
                          <TableCell className="py-3 px-3 text-right font-mono tabular-nums text-[13px] font-bold text-zinc-900 dark:text-[#e4e4e7]">
                            {displayCurrentPrice !== null ? (
                              formatInr(displayCurrentPrice, 2)
                            ) : (
                              <span className="text-zinc-400 dark:text-[#3f3f46]">--</span>
                            )}
                          </TableCell>

                          {/* SL / TP */}
                          <TableCell className="py-3 px-3 text-right">
                            {!isClosed ? (
                              <div className="flex flex-col items-end gap-1">
                                <InlineEdit
                                  value={position.stopLoss}
                                  placeholder="SL"
                                  icon={Shield}
                                  colorClass="text-red-500"
                                  onSave={(val: number) =>
                                    handleAction("stoploss", position.id, val)
                                  }
                                  isLoading={loading === position.id}
                                />
                                <InlineEdit
                                  value={position.target}
                                  placeholder="TP"
                                  icon={Target}
                                  colorClass="text-green-500"
                                  onSave={(val: number) =>
                                    handleAction("target", position.id, val)
                                  }
                                  isLoading={loading === position.id}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] font-mono text-zinc-400 dark:text-[#27272a]">
                                —
                              </span>
                            )}
                          </TableCell>

                          {/* P&L with heatmap */}
                          <TableCell
                            className={cn(
                              "py-3 px-4 text-right font-mono tabular-nums font-black text-[13px] transition-colors",
                              pnl === null
                                ? "text-zinc-400 dark:text-[#3f3f46]"
                                : isProfitable
                                  ? "text-green-600 dark:text-[#4ade80]"
                                  : "text-red-500 dark:text-[#f87171]",
                            )}
                            style={{ backgroundColor: pnlBgColor }}
                          >
                            {pnl === null
                              ? "--"
                              : formatSignedInr(pnl, 2, {
                                  alwaysShowPlus: true,
                                })}
                          </TableCell>

                          {/* Exit action */}
                          <TableCell className="py-3 px-4 text-center">
                            {!isClosed ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-7 h-7 flex items-center justify-center rounded-[3px] text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover/row:opacity-100 dark:text-zinc-400 dark:text-[#3f3f46] dark:hover:text-red-500 dark:text-[#f87171] dark:hover:bg-[#200808]"
                                    title="Square Off (⌘X)"
                                  >
                                    {loading === position.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <X className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-52 p-3 bg-white border-zinc-200 rounded-md shadow-2xl dark:bg-white dark:bg-[#0c0c10] dark:border-zinc-200 dark:border-[#1e1e26]"
                                  sideOffset={6}
                                >
                                  <ExitPopoverContent
                                    position={position}
                                    loading={loading === position.id}
                                    onClose={(opts) =>
                                      handleAction(
                                        "close",
                                        position.id,
                                        undefined,
                                        opts,
                                      )
                                    }
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className="w-7 h-7 inline-block" />
                            )}
                          </TableCell>
                        </motion.tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function arePositionTrackingPropsEqual(
  prev: PositionTrackingProps,
  next: PositionTrackingProps,
): boolean {
  // Re-render when positions array reference changes (new data from SWR/SSE)
  if (prev.positions !== next.positions) return false
  // Re-render when pnl meta changes (mode switch, server config)
  if (prev.pnlMeta !== next.pnlMeta) return false
  // Re-render when stable refs change (should never happen with useCallback in provider)
  if (prev.optimisticClosePosition !== next.optimisticClosePosition) return false
  if (prev.refreshPositions !== next.refreshPositions) return false
  if (prev.onPositionUpdate !== next.onPositionUpdate) return false
  if (prev.marketFeedStatus !== next.marketFeedStatus) return false
  if (prev.lastPositionsSyncAtMs !== next.lastPositionsSyncAtMs) return false
  if (prev.tradingAccountId !== next.tradingAccountId) return false
  if (prev.closedPositionHistory !== next.closedPositionHistory) return false
  // quotes: only re-render when a token relevant to open positions changed.
  // The component also calls useMarketData() internally for config — that path
  // does not update per-tick. This equality check blocks parent-triggered re-renders.
  if (prev.quotes !== next.quotes) {
    if (!prev.quotes || !next.quotes) return false
    for (const pos of next.positions) {
      const tokenKey = pos.token?.toString() ?? ''
      if (tokenKey && prev.quotes[tokenKey]?.last_trade_price !== next.quotes[tokenKey]?.last_trade_price) {
        return false
      }
    }
    return true
  }
  return true
}

export const PositionTrackingMemo = React.memo(PositionTracking, arePositionTrackingPropsEqual)