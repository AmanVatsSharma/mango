/**
 * @file InstrumentPickerDialog.tsx
 * @module components/admin-console/market-data/catalog-editor
 * @description Modal instrument picker for the admin catalog editor. Reuses the existing
 *              useInstrumentSearch hook (same Vedpragya search the user-facing search drawer
 *              uses) so the admin sees the FULL tradable universe — independent of whatever
 *              the catalog currently exposes to users.
 *
 *              Returns a normalized PickedInstrument via onPick. Caller decides what to do
 *              with it (add as flat instrument item, or use as the underlying for an
 *              options-chain recipe).
 *
 * Exports:
 *   - InstrumentPickerDialog — props { open, onOpenChange, mode, onPick }
 *   - PickedInstrument — return shape
 *
 * Side-effects:
 *   - Reads /api/market-data/search via useInstrumentSearch (debounced).
 *
 * Key invariants:
 *   - mode === "any" returns whatever; mode === "underlying" filters to non-derivative rows
 *     (no expiry / no strike) since options chains need a non-derivative root.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useInstrumentSearch, type SearchTab } from "@/lib/hooks/use-instrument-search"
import {
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
} from "@/lib/market-data/utils/quote-lookup"
import { cn } from "@/lib/utils"

export interface PickedInstrument {
  token: number
  symbol: string
  name?: string
  exchange: string
  segment: string
}

export interface InstrumentPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "any" allows derivatives; "underlying" hides them (used for options-chain underlying picker). */
  mode: "any" | "underlying"
  onPick: (instrument: PickedInstrument) => void
  title?: string
}

const TABS_FOR_ANY: ReadonlyArray<readonly [SearchTab, string]> = [
  ["equity", "Equity"],
  ["futures", "Futures"],
  ["options", "Options"],
  ["commodities", "MCX"],
]

const TABS_FOR_UNDERLYING: ReadonlyArray<readonly [SearchTab, string]> = [
  ["equity", "Equity / Index"],
]

export function InstrumentPickerDialog({
  open,
  onOpenChange,
  mode,
  onPick,
  title = "Pick instrument",
}: InstrumentPickerDialogProps) {
  const tabs = mode === "underlying" ? TABS_FOR_UNDERLYING : TABS_FOR_ANY
  const [activeTab, setActiveTab] = useState<SearchTab>(tabs[0]![0])
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const { results, loading, error, search, clear } = useInstrumentSearch({
    activeTab,
    debounceMs: 250,
  })

  useEffect(() => {
    if (!open) {
      setQuery("")
      setActiveTab(tabs[0]![0])
      clear()
      return
    }
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filteredResults = useMemo(() => {
    if (mode !== "underlying") return results
    return results.filter((r) => {
      const isDerivative =
        Boolean(r.expiry || r.expiryDate) ||
        Boolean(r.strike || r.strike_price) ||
        Boolean(r.optionType || r.option_type)
      return !isDerivative
    })
  }, [results, mode])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-3 pb-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search symbol or company name..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                search(e.target.value)
              }}
              className={cn(
                "w-full h-10 rounded-lg pl-10 pr-9",
                "bg-muted/40 border border-border/60",
                "text-sm outline-none focus:bg-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/20",
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  clear()
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {tabs.length > 1 && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SearchTab)}>
              <TabsList className="w-full h-9 grid grid-cols-4 bg-muted/40 rounded-lg p-0.5">
                {tabs.map(([val, label]) => (
                  <TabsTrigger
                    key={val}
                    value={val}
                    className={cn(
                      "h-8 rounded-md text-xs font-medium",
                      "data-[state=active]:bg-background data-[state=active]:shadow-sm",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-3 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {error && (
            <div className="px-3 py-4 text-xs text-rose-500">Search failed: {error}</div>
          )}
          {!loading && !error && filteredResults.length === 0 && query.length >= 2 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {!loading && !error && query.length < 2 && (
            <div className="px-3 py-10 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          )}
          <div className="space-y-1">
            {filteredResults.map((r, i) => {
              const token =
                parsePositiveIntegerMarketNumber(r.token) ??
                parsePositiveIntegerMarketNumber(r.instrumentToken) ??
                parseTokenFromInstrumentId((r as any).instrumentId)
              if (!token) return null
              const exchange = (r.exchange || "").toUpperCase() || "NSE"
              const segment = (r.segment || exchange).toUpperCase()
              return (
                <button
                  key={`${token}-${i}`}
                  type="button"
                  onClick={() => {
                    onPick({
                      token,
                      symbol: r.symbol,
                      name: r.name ?? r.companyName ?? r.symbol,
                      exchange,
                      segment,
                    })
                    onOpenChange(false)
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3",
                    "hover:bg-muted/60 transition-colors",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground line-clamp-1">
                      {r.symbol}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {r.name ?? r.companyName ?? "—"}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                    {exchange}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
