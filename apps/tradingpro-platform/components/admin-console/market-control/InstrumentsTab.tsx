/**
 * File:        components/admin-console/market-control/InstrumentsTab.tsx
 * Module:      admin-console · Market Control · Instruments
 * Purpose:     Premium instrument management tab — searchable instrument picker with per-instrument
 *              enabled toggle, buy/sell kill switches, and spread override. Replaces the raw
 *              text-input Symbols tab in MarketControlPanel.
 *
 * Exports:
 *   - InstrumentsTab({ draft, setDraft }) — tab content component
 *
 * Depends on:
 *   - @/lib/market-control/market-control-config.schema — MarketControlConfigV1, symbolOverrideKey
 *   - ./SpreadPreviewWidget — reused mini spread bar chart
 *   - shadcn/ui — Card, Badge, Button, Input, Label, Switch, Tooltip
 *
 * Side-effects:
 *   - GET /api/market-data/equities|futures|mcx on search input (debounced 300 ms)
 *
 * Key invariants:
 *   - Search is only available when a specific segment is selected (not "all")
 *   - symbolOverrideKey(segment, symbol) produces the canonical map key "SEGMENT:SYMBOL"
 *   - Kill-switch toggles are only shown when enabled = true (irrelevant when instrument is off)
 *
 * Read order:
 *   1. SEGMENT_META — config for filter pills and badge colours
 *   2. InstrumentsTab — state + search logic + render
 *   3. InstrumentRow — per-instrument card
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-25
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Ban,
  Layers,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
  X as XIcon,
  AlertTriangle,
} from "lucide-react"
import {
  type MarketControlConfigV1,
  type SymbolOverrideV1,
  symbolOverrideKey,
} from "@/lib/market-control/market-control-config.schema"
import { SpreadPreviewWidget } from "./SpreadPreviewWidget"

// ── Segment metadata ──────────────────────────────────────────────────────────

type SegmentFilter = "all" | "NSE_EQ" | "NSE_FO" | "MCX"

const SEGMENT_META: Record<
  Exclude<SegmentFilter, "all">,
  { label: string; badgeCls: string; endpoint: string; paramKey: "q" | "symbol" }
> = {
  NSE_EQ: {
    label: "NSE EQ",
    badgeCls: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    endpoint: "/api/market-data/equities",
    paramKey: "q",
  },
  NSE_FO: {
    label: "NSE FO",
    badgeCls: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    endpoint: "/api/market-data/futures",
    paramKey: "symbol",
  },
  MCX: {
    label: "MCX",
    badgeCls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    endpoint: "/api/market-data/mcx",
    paramKey: "symbol",
  },
}

function segmentBadge(segmentKey: string): string {
  return (SEGMENT_META as Record<string, { badgeCls: string }>)[segmentKey]?.badgeCls ??
    "bg-slate-500/15 text-slate-400 border-slate-500/30"
}

function segmentLabel(segmentKey: string): string {
  const parts = segmentKey.split(":")
  if (parts.length === 2) return parts[0]
  return segmentKey
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  symbol: string
  exchange: string
  last_price?: number
}

// ── InstrumentRow ─────────────────────────────────────────────────────────────

interface InstrumentRowProps {
  overrideKey: string
  override: SymbolOverrideV1
  onUpdate: (key: string, mutator: (prev: SymbolOverrideV1) => SymbolOverrideV1) => void
  onRemove: (key: string) => void
}

function InstrumentRow({ overrideKey, override, onUpdate, onRemove }: InstrumentRowProps) {
  const [segment, symbol] = overrideKey.includes(":") ? overrideKey.split(":") : ["", overrideKey]
  const enabled = override.enabled !== false
  const killBuy = override.killSwitch?.buyDisabled ?? false
  const killSell = override.killSwitch?.sellDisabled ?? false
  const anyKill = killBuy || killSell

  return (
    <div
      className={`rounded-xl border p-3 space-y-2.5 transition-opacity duration-200 ${
        !enabled ? "opacity-50 border-red-500/30 bg-red-500/5" : "border-border bg-background"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {segment && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${segmentBadge(segment)}`}>
            {segment}
          </span>
        )}
        <span className="text-xs font-mono font-semibold flex-1 truncate">{symbol || overrideKey}</span>

        {anyKill && enabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                <Ban className="h-2.5 w-2.5" />
                {killBuy && killSell ? "BOTH" : killBuy ? "BUY" : "SELL"}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Kill switch active</TooltipContent>
          </Tooltip>
        )}

        {!enabled && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            DISABLED
          </span>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 hover:text-red-400"
              onClick={() => onRemove(overrideKey)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Remove override</TooltipContent>
        </Tooltip>
      </div>

      {/* Toggles row */}
      <div className="flex items-center gap-4 flex-wrap">
        <Label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onUpdate(overrideKey, (prev) => ({ ...prev, enabled: v }))}
            className={enabled ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-red-500/60"}
          />
          <span className={enabled ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </Label>

        {enabled && (
          <>
            <Label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Switch
                checked={killBuy}
                onCheckedChange={(v) =>
                  onUpdate(overrideKey, (prev) => ({
                    ...prev,
                    killSwitch: {
                      buyDisabled: v,
                      sellDisabled: prev.killSwitch?.sellDisabled ?? false,
                      reason: prev.killSwitch?.reason ?? "",
                    },
                  }))
                }
                className={killBuy ? "data-[state=checked]:bg-red-500" : ""}
              />
              Kill BUY
            </Label>

            <Label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Switch
                checked={killSell}
                onCheckedChange={(v) =>
                  onUpdate(overrideKey, (prev) => ({
                    ...prev,
                    killSwitch: {
                      buyDisabled: prev.killSwitch?.buyDisabled ?? false,
                      sellDisabled: v,
                      reason: prev.killSwitch?.reason ?? "",
                    },
                  }))
                }
                className={killSell ? "data-[state=checked]:bg-red-500" : ""}
              />
              Kill SELL
            </Label>
          </>
        )}
      </div>

      {/* Spread preview */}
      {(override.spread?.min !== undefined || override.spread?.max !== undefined) && (
        <div className="pt-0.5">
          <SpreadPreviewWidget min={override.spread?.min ?? 0.05} max={override.spread?.max ?? 0.15} />
        </div>
      )}
    </div>
  )
}

// ── InstrumentsTab ────────────────────────────────────────────────────────────

interface InstrumentsTabProps {
  draft: MarketControlConfigV1
  setDraft: React.Dispatch<React.SetStateAction<MarketControlConfigV1>>
}

export function InstrumentsTab({ draft, setDraft }: InstrumentsTabProps) {
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Derived stats ─────────────────────────────────────────────────────────

  const overrideEntries = Object.entries(draft.symbolOverrides)
  const totalCount = overrideEntries.length
  const disabledCount = overrideEntries.filter(([, o]) => o.enabled === false).length
  const killCount = overrideEntries.filter(
    ([, o]) => o.enabled !== false && (o.killSwitch?.buyDisabled || o.killSwitch?.sellDisabled),
  ).length

  // ── Filtered view ─────────────────────────────────────────────────────────

  const visibleEntries =
    segmentFilter === "all"
      ? overrideEntries
      : overrideEntries.filter(([k]) => k.startsWith(`${segmentFilter}:`))

  // ── Search ────────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (query: string, segment: Exclude<SegmentFilter, "all">) => {
    if (!query.trim()) {
      setSearchResults([])
      setDropdownOpen(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setSearching(true)

    try {
      const meta = SEGMENT_META[segment]
      const params = new URLSearchParams({ [meta.paramKey]: query, limit: "10", ltp_only: "true" })
      const res = await fetch(`${meta.endpoint}?${params}`, {
        signal: abortRef.current.signal,
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = await res.json()
      const instruments: any[] = data?.data?.instruments ?? []
      const results: SearchResult[] = instruments.map((inst) => ({
        symbol: String(inst.symbol ?? ""),
        exchange: String(inst.exchange ?? segment),
        last_price: typeof inst.last_price === "number" ? inst.last_price : undefined,
      }))
      setSearchResults(results)
      setDropdownOpen(results.length > 0)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      setSearchResults([])
      setDropdownOpen(false)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (segmentFilter === "all" || !searchQuery.trim()) {
      setSearchResults([])
      setDropdownOpen(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery, segmentFilter as Exclude<SegmentFilter, "all">)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, segmentFilter, performSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !searchInputRef.current?.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  const addInstrument = useCallback(
    (result: SearchResult) => {
      const seg = segmentFilter === "all" ? result.exchange : segmentFilter
      const key = symbolOverrideKey(seg, result.symbol)
      setDraft((prev) => ({
        ...prev,
        symbolOverrides: {
          ...prev.symbolOverrides,
          [key]: prev.symbolOverrides[key] ?? {
            enabled: true,
            spread: { min: 0.05, max: 0.15, distribution: "uniform" },
          },
        },
      }))
      setSearchQuery("")
      setSearchResults([])
      setDropdownOpen(false)
    },
    [segmentFilter, setDraft],
  )

  const updateOverride = useCallback(
    (key: string, mutator: (prev: SymbolOverrideV1) => SymbolOverrideV1) => {
      setDraft((prev) => ({
        ...prev,
        symbolOverrides: {
          ...prev.symbolOverrides,
          [key]: mutator(prev.symbolOverrides[key] ?? { enabled: true }),
        },
      }))
    },
    [setDraft],
  )

  const removeOverride = useCallback(
    (key: string) => {
      setDraft((prev) => {
        const next = { ...prev.symbolOverrides }
        delete next[key]
        return { ...prev, symbolOverrides: next }
      })
    },
    [setDraft],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Layers className="h-3 w-3" />
          {totalCount} tracked
        </span>
        {disabledCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
            <XIcon className="h-3 w-3" />
            {disabledCount} disabled
          </span>
        )}
        {killCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
            <ShieldAlert className="h-3 w-3" />
            {killCount} kill active
          </span>
        )}
        {totalCount === 0 && disabledCount === 0 && killCount === 0 && (
          <span className="text-xs text-muted-foreground italic">No overrides configured</span>
        )}
      </div>

      {/* ── Segment filter pills + search ──────────────────────────────── */}
      <div className="space-y-2.5">
        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "NSE_EQ", "NSE_FO", "MCX"] as const).map((seg) => {
            const isActive = segmentFilter === seg
            return (
              <button
                key={seg}
                type="button"
                onClick={() => {
                  setSegmentFilter(seg)
                  setSearchQuery("")
                  setSearchResults([])
                  setDropdownOpen(false)
                }}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  isActive
                    ? seg === "all"
                      ? "border-primary bg-primary/15 text-primary"
                      : `border-current ${segmentBadge(seg)}`
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {seg === "all" ? "All" : SEGMENT_META[seg].label}
              </button>
            )
          })}
        </div>

        {/* Search row */}
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={
                segmentFilter === "all"
                  ? "Select a segment to search instruments…"
                  : `Search ${SEGMENT_META[segmentFilter].label} instruments…`
              }
              disabled={segmentFilter === "all"}
              className="pl-8 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setDropdownOpen(true)}
            />
            {searching && (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSearchResults([])
                  setDropdownOpen(false)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {dropdownOpen && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
            >
              {searchResults.map((result) => {
                const key = symbolOverrideKey(
                  segmentFilter === "all" ? result.exchange : segmentFilter,
                  result.symbol,
                )
                const alreadyAdded = Boolean(draft.symbolOverrides[key])
                return (
                  <button
                    key={result.symbol}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => addInstrument(result)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                      alreadyAdded
                        ? "opacity-40 cursor-not-allowed bg-muted/30"
                        : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${segmentBadge(result.exchange)}`}
                      >
                        {result.exchange}
                      </span>
                      <span className="font-mono font-semibold">{result.symbol}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {result.last_price !== undefined && (
                        <span className="text-muted-foreground tabular-nums">
                          ₹{result.last_price.toLocaleString("en-IN")}
                        </span>
                      )}
                      {alreadyAdded && (
                        <Badge variant="outline" className="text-[9px] h-4">Added</Badge>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {segmentFilter === "all" && totalCount === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            Pick a segment (NSE EQ, NSE FO, or MCX) to search and add instruments.
          </p>
        )}
      </div>

      {/* ── Instruments list ────────────────────────────────────────────── */}
      {visibleEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-8 text-center space-y-2">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground font-medium">
            {segmentFilter === "all" ? "No instruments configured" : `No ${SEGMENT_META[segmentFilter]?.label} overrides`}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {segmentFilter === "all"
              ? "Select a segment above and search for an instrument to add it."
              : `Search for a ${SEGMENT_META[segmentFilter]?.label} instrument above to add an override.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {segmentFilter !== "all" && visibleEntries.length !== overrideEntries.length && (
            <p className="text-xs text-muted-foreground">
              Showing {visibleEntries.length} of {overrideEntries.length} instruments
              {" "}
              <button
                type="button"
                onClick={() => setSegmentFilter("all")}
                className="underline hover:text-foreground transition-colors"
              >
                show all
              </button>
            </p>
          )}
          {visibleEntries.map(([key, override]) => (
            <InstrumentRow
              key={key}
              overrideKey={key}
              override={override}
              onUpdate={updateOverride}
              onRemove={removeOverride}
            />
          ))}
        </div>
      )}
    </div>
  )
}
