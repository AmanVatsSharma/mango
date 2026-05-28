/**
 * File:        components/stock-search.tsx
 * Module:      Components · Watchlist · Instrument Search
 * Purpose:     Full-height bottom sheet for adding instruments to a watchlist. Two modes:
 *              - "Browse" — admin-curated catalog (indices/sectors/options chains) via CatalogBrowser
 *              - "Search" — universal free-text search across all segments via milliClient.suggest,
 *                           with horizontal filter chips (All / Equity / F&O / MCX) and asset-aware
 *                           result cards (SearchResultCard) that handle every kind the API can
 *                           return: Indian / US equity, futures, option calls/puts, MCX commodities,
 *                           CDS forex, BINANCE crypto, indices and ETFs.
 *
 * Exports:
 *   - StockSearch(props: StockSearchProps) — drawer component
 *   - StockSearchProps — prop shape
 *
 * Depends on:
 *   - @/lib/hooks/use-instrument-search — useInstrumentSearch(filter, debounceMs)
 *   - @/lib/services/search/milli-client — MilliInstrument type + telemetrySelection
 *   - @/components/watchlist/catalog-browser — Browse mode
 *   - @/components/watchlist/search-result-card — premium per-row presentation, asset-aware
 *
 * Side-effects:
 *   - SSE EventSource opened by useInstrumentSearch for live LTP updates (Search mode only)
 *
 * Key invariants:
 *   - filter='all' → no mode constraint → universal results
 *   - Per-row visual treatment lives entirely in SearchResultCard.getInstrumentMeta — this
 *     file only resolves the save-payload (token / instrumentId / Stock shape) and passes
 *     the raw MilliInstrument straight through.
 *   - handleAddStock saves instrument.token (broker token) when present, otherwise relies on
 *     the persisted uirId + canonicalSymbol set on the Stock payload.
 *   - Browse mode (CatalogBrowser) is untouched by the universal search redesign.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Search, X, Loader2, Layers } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useInstrumentSearch, type SearchFilter } from "@/lib/hooks/use-instrument-search"
import type { MilliInstrument } from "@/lib/services/search/milli-client"
import { milliClient } from "@/lib/services/search/milli-client"
import { cn } from "@/lib/utils"
import {
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
} from "@/lib/market-data/utils/quote-lookup"
import { CatalogBrowser } from "@/components/watchlist/catalog-browser"
import { SearchResultCard } from "@/components/watchlist/search-result-card"
import type { OptionAddPayload } from "@/components/watchlist/catalog-options-tree"
import type { CatalogAddInstrumentPayload } from "@/components/watchlist/catalog-browser"

type DrawerMode = "browse" | "search"

interface Stock {
  id: string
  instrumentId: string
  token?: number
  uirId?: number
  canonicalSymbol?: string
  exchange: string
  ticker: string
  symbol: string
  name: string
  segment?: string
  ltp: number
  last_price?: number
  change: number
  changePercent: number
  expiry_date?: string
  expiry?: string
  strike_price?: number
  strikePrice?: number
  option_type?: "CE" | "PE"
  lot_size?: number
  lotSize?: number
  logo_url?: string
}

interface StockSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddStock: (
    stockData:
      | string
      | {
          token?: number
          uirId?: number
          canonicalSymbol?: string
          symbol?: string
          name?: string
          exchange?: string
          segment?: string
          strikePrice?: number
          optionType?: "CE" | "PE"
          expiry?: string
          lotSize?: number
          instrumentId?: string
          ltp?: number
          close?: number
        },
  ) => void
  onClose: () => void
  existingTokens?: number[]
}

/**
 * Filter chips — one per asset class the search-api supports. The `accent` colour mirrors
 * the kind colours used by SearchResultCard, so the active chip and its matching cards
 * share the same visual language.
 */
const FILTER_CHIPS: ReadonlyArray<{
  id: SearchFilter
  label: string
  /** Active-state Tailwind classes — bg + text + border when selected. */
  active: string
  /** Idle-state Tailwind classes — subtle muted treatment when not selected. */
  idle: string
}> = [
  {
    id: "all",
    label: "All",
    active: "bg-foreground text-background border-foreground shadow-sm",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
  },
  {
    id: "eq",
    label: "Equity",
    active: "bg-blue-500/15 text-blue-300 border-blue-500/40 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30",
  },
  {
    id: "fno",
    label: "F&O",
    active: "bg-violet-500/15 text-violet-300 border-violet-500/40 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)]",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30",
  },
  {
    id: "commodities",
    label: "MCX",
    active: "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30",
  },
  {
    id: "curr",
    label: "Forex",
    active: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.25)]",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-cyan-500/10 hover:text-cyan-400 hover:border-cyan-500/30",
  },
  {
    id: "crypto",
    label: "Crypto",
    active: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.25)]",
    idle: "bg-muted/40 text-muted-foreground border-border/50 hover:bg-yellow-500/10 hover:text-yellow-400 hover:border-yellow-500/30",
  },
]

export function StockSearch({
  open,
  onOpenChange,
  onAddStock,
  onClose,
  existingTokens = [],
}: StockSearchProps) {
  const [mode, setMode] = useState<DrawerMode>("browse")
  const [query, setQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all")
  const [addingStockId, setAddingStockId] = useState<string | number | null>(null)
  const [addingCatalogToken, setAddingCatalogToken] = useState<number | null>(null)
  const existingTokenSet = useMemo(() => new Set(existingTokens), [existingTokens])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { results, loading, error, search, clear } = useInstrumentSearch({
    filter: activeFilter,
    debounceMs: 300,
  })

  useEffect(() => {
    if (open && mode === "search") {
      const t = setTimeout(() => searchInputRef.current?.focus(), 250)
      return () => clearTimeout(t)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setActiveFilter("all")
      setMode("browse")
      clear()
    }
  }, [open, clear])

  // Scroll results to top on filter change
  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0 })
  }, [activeFilter])

  const handleQueryChange = useCallback(
    (val: string) => {
      setQuery(val)
      search(val)
    },
    [search],
  )

  const handleFilterChange = useCallback(
    (f: SearchFilter) => {
      setActiveFilter(f)
      if (query) search(query)
    },
    [query, search],
  )

  const handleClose = useCallback(() => {
    onClose()
    onOpenChange(false)
  }, [onClose, onOpenChange])

  const handleAddStock = useCallback(
    (stock: Stock) => {
      const normalizedToken =
        parsePositiveIntegerMarketNumber(stock.token) ??
        parseTokenFromInstrumentId(stock.instrumentId)
      if (normalizedToken === null) return
      if (existingTokenSet.has(normalizedToken)) return
      setAddingStockId(stock.id)

      const normalizedStrikePrice = parseNonNegativeMarketNumber(
        stock.strikePrice ?? stock.strike_price,
      )
      const normalizedLotSize = parsePositiveIntegerMarketNumber(
        stock.lotSize ?? stock.lot_size,
      )
      const normalizedExpiry =
        typeof (stock.expiry ?? stock.expiry_date) === "string"
          ? (stock.expiry ?? stock.expiry_date)?.trim()
          : undefined

      const payload = {
        token: normalizedToken,
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        segment: stock.segment,
        instrumentId: stock.instrumentId,
        uirId: stock.uirId,
        canonicalSymbol: stock.canonicalSymbol,
        // Asset classification — forwarded so the watchlist API can store it directly,
        // making badge rendering and order routing deterministic instead of inferred.
        ...(typeof (stock as any).instrumentType === "string" && (stock as any).instrumentType
          ? { instrumentType: (stock as any).instrumentType }
          : {}),
        ...(typeof (stock as any).assetClass === "string" && (stock as any).assetClass
          ? { assetClass: (stock as any).assetClass }
          : {}),
        ...(typeof (stock as any).isDerivative === "boolean"
          ? { isDerivative: (stock as any).isDerivative }
          : {}),
        ltp: stock.ltp,
        close: 0,
        ...(normalizedStrikePrice !== null ? { strikePrice: normalizedStrikePrice } : {}),
        ...(stock.option_type ? { optionType: stock.option_type } : {}),
        ...(normalizedExpiry ? { expiry: normalizedExpiry } : {}),
        ...(normalizedLotSize !== null ? { lotSize: normalizedLotSize } : {}),
        ...(stock.logo_url ? { logo_url: stock.logo_url } : {}),
      }

      Promise.resolve(onAddStock(payload))
        .then(() => {
          milliClient.telemetrySelection({
            q: query,
            symbol: stock.symbol,
            instrumentToken: stock.token,
          })
        })
        .catch(() => {})
        .finally(() => setAddingStockId(null))

      handleClose()
    },
    [existingTokenSet, onAddStock, query, handleClose],
  )

  const handleCatalogAdd = useCallback(
    (payload: CatalogAddInstrumentPayload | OptionAddPayload) => {
      if (existingTokenSet.has(payload.token)) return
      setAddingCatalogToken(payload.token)
      Promise.resolve(
        onAddStock({
          ...payload,
          close: 0,
        }),
      )
        .catch(() => {})
        .finally(() => setAddingCatalogToken(null))
      handleClose()
    },
    [existingTokenSet, onAddStock, handleClose],
  )

  const showPrompt = !loading && !error && query.length < 2
  const showEmpty = !loading && !error && query.length >= 2 && results.length === 0

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
        else onOpenChange(o)
      }}
      direction="bottom"
      snapPoints={[1]}
      activeSnapPoint={1}
    >
      <DrawerContent
        className={cn(
          "!max-h-[100dvh] h-[100dvh]",
          "inset-x-0 bottom-0 rounded-t-3xl border-t border-border/60",
          "bg-background/96 backdrop-blur-xl",
          "flex flex-col",
          "[&>div:first-child]:hidden",
        )}
      >
        {/* ── Handle bar ── */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0">
          <div className="h-[5px] w-10 rounded-full bg-muted-foreground/20" />
        </div>

        {/* ── Sticky header ── */}
        <div className="shrink-0 px-4 pt-3 pb-3 space-y-3 border-b border-border/30">
          {/* Title row */}
          <DrawerHeader className="p-0 flex-row items-center justify-between">
            <DrawerTitle className="text-[15px] font-semibold text-foreground">
              Add to Watchlist
            </DrawerTitle>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </DrawerHeader>

          {/* Mode toggle: Browse (curated) vs Search (free-text) */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as DrawerMode)}>
            <TabsList className="w-full h-9 grid grid-cols-2 bg-muted/40 rounded-xl p-0.5">
              <TabsTrigger
                value="browse"
                className={cn(
                  "h-8 rounded-[10px] text-xs font-medium transition-all gap-1.5",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground/80",
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                Browse
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className={cn(
                  "h-8 rounded-[10px] text-xs font-medium transition-all gap-1.5",
                  "data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground/80",
                )}
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search input + filter chips — Search mode only */}
          {mode === "search" && (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Search any symbol or company name..."
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className={cn(
                    "w-full h-11 rounded-xl pl-10 pr-10",
                    "bg-muted/50 border border-border/50",
                    "text-sm text-foreground placeholder:text-muted-foreground/70",
                    "outline-none focus:bg-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/20",
                    "transition-all duration-150",
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => handleQueryChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  loading && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )
                )}
              </div>

              {/* Universal filter chips — one per asset class. Active chip uses the same
                  accent colour as the matching SearchResultCard so search filter and
                  result rows share a single visual language. */}
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
                {FILTER_CHIPS.map(({ id, label, active, idle }) => {
                  const isActive = activeFilter === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleFilterChange(id)}
                      aria-pressed={isActive}
                      className={cn(
                        "shrink-0 h-7 px-3.5 rounded-full text-[11.5px] font-semibold tracking-wide",
                        "border transition-all duration-150 outline-none",
                        "focus-visible:ring-2 focus-visible:ring-primary/40",
                        isActive ? active : idle,
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div
          ref={resultsRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {mode === "browse" && (
            <CatalogBrowser
              existingTokens={existingTokens}
              onAdd={handleCatalogAdd}
              addingToken={addingCatalogToken}
              onSwitchToSearch={() => setMode("search")}
            />
          )}

          {mode === "search" && (
            <>
              {/* Loading skeletons */}
              {loading && (
                <div className="px-4 pt-3 space-y-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3.5 py-3.5 rounded-2xl bg-muted/25 animate-pulse"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-28 rounded-full bg-muted-foreground/12" />
                        <div className="h-2.5 w-40 rounded-full bg-muted-foreground/8" />
                      </div>
                      <div className="h-3 w-12 rounded-full bg-muted-foreground/12" />
                      <div className="h-8 w-8 rounded-full bg-muted-foreground/12" />
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                    <X className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Search unavailable</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                </div>
              )}

              {/* Prompt — before typing */}
              {showPrompt && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                  <div className="h-16 w-16 rounded-3xl bg-primary/8 flex items-center justify-center mb-1">
                    <Search className="h-7 w-7 text-primary/50" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Find any instrument</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                    Search equities, futures, options and MCX commodities by symbol or company name
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {["NIFTY", "RELIANCE", "BANKNIFTY", "GOLD"].map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => handleQueryChange(hint)}
                        className="text-xs px-3 py-1.5 rounded-full bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border/40 font-medium"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No results */}
              {showEmpty && (
                <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                    <Search className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No results for &ldquo;{query}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try a different symbol or use the filter chips above
                  </p>
                </div>
              )}

              {/* Result cards — asset-aware row from search-result-card.tsx */}
              {!loading && !error && results.length > 0 && (
                <div className="px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] space-y-1.5">
                  {results.map((instrument: MilliInstrument, index: number) => {
                    // ── Token & instrumentId resolution (drives save payload + WS subscribe) ──
                    // Trust the upstream `exchange` value when it's one of the WS-valid prefixes;
                    // otherwise infer from segment/instrumentType. normalizeItem() in milli-client
                    // already aliases vortexExchange → exchange so this is usually a pass-through.
                    const rawExchange = (instrument.exchange || "").toUpperCase()
                    const rawSegment = (instrument.segment || "").toUpperCase()
                    const segmentForSave =
                      rawSegment ||
                      (rawExchange.includes("MCX")
                        ? "MCX_FO"
                        : rawExchange.includes("BSE")
                          ? "BSE"
                          : "NSE")

                    const resolvedToken =
                      parsePositiveIntegerMarketNumber(instrument.token) ??
                      parsePositiveIntegerMarketNumber((instrument as any).instrumentToken) ??
                      parsePositiveIntegerMarketNumber((instrument as any).instrument_token) ??
                      parseTokenFromInstrumentId((instrument as any).instrumentId)

                    const WS_VALID_EXCHANGES = ['NSE_EQ', 'NSE_FO', 'NSE_CUR', 'MCX_FO'] as const
                    const isCommodity =
                      segmentForSave.includes("MCX") || rawExchange.includes("MCX")
                    const normalizedExchange = (WS_VALID_EXCHANGES as readonly string[]).includes(rawExchange)
                      ? rawExchange
                      : isCommodity
                        ? "MCX_FO"
                        : segmentForSave.includes("FO") || segmentForSave.includes("NFO") || rawExchange.includes("FO")
                          ? "NSE_FO"
                          : rawExchange.includes("BSE")
                            ? "BSE"
                            : "NSE_EQ"
                    const instrumentId =
                      (typeof (instrument as any).instrumentId === "string" &&
                        (instrument as any).instrumentId.trim()) ||
                      (resolvedToken && normalizedExchange
                        ? `${normalizedExchange}-${resolvedToken}`
                        : normalizedExchange || "UNKNOWN")

                    const strikeNum = parseNonNegativeMarketNumber(
                      (instrument as any)?.strike_price,
                    )

                    const stock: Stock = {
                      id: resolvedToken
                        ? `token-${resolvedToken}`
                        : `${normalizedExchange}-${instrument.symbol}-${index}`,
                      instrumentId,
                      token: resolvedToken ?? undefined,
                      uirId: instrument.uirId ?? instrument.id ?? undefined,
                      canonicalSymbol: instrument.canonicalSymbol ?? undefined,
                      exchange: normalizedExchange,
                      ticker: instrument.symbol,
                      symbol: instrument.symbol,
                      name: instrument.name || instrument.symbol,
                      ltp: instrument.last_price || 0,
                      last_price: instrument.last_price,
                      change: 0,
                      changePercent: 0,
                      expiry_date: instrument.expiry_date,
                      expiry: instrument.expiry_date,
                      strike_price: strikeNum as any,
                      strikePrice: strikeNum as any,
                      option_type: instrument.option_type,
                      lot_size: instrument.lot_size,
                      lotSize: instrument.lot_size,
                      segment: segmentForSave,
                      logo_url: instrument.logo_url || undefined,
                    }

                    const isAdding = addingStockId === stock.id
                    const isExisting = !!stock.token && existingTokenSet.has(stock.token)
                    const isAddDisabled = isAdding || !stock.token || isExisting

                    return (
                      <SearchResultCard
                        key={`${instrument.token ?? instrument.id}-${index}`}
                        instrument={instrument}
                        isExisting={isExisting}
                        isAdding={isAdding}
                        isAddDisabled={isAddDisabled}
                        onAdd={() => handleAddStock(stock)}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
