/**
 * @file catalog-browser.tsx
 * @module components/watchlist
 * @description User-facing catalog browser. Mounted as the "Browse" mode of the Add-to-Watchlist
 *              drawer (parallel to free-text Search). Two-level navigation:
 *                Root: gradient cards for each curated group (Indices, Sectors, Options Chains).
 *                Group: list of instrument rows OR an options-chain tree with expiries + strikes.
 *
 *              The component is fully presentational once data is loaded — `useMarketCatalog`
 *              owns the fetch + revalidation. Calls `onAdd` (same callback contract as the
 *              free-text Search) so WatchlistManager doesn't need any changes.
 *
 * Exports:
 *   - CatalogBrowser — props { existingTokens: number[]; onAdd: (payload) => void; addingToken: number | null }
 *
 * Side-effects:
 *   - Reads /api/market-data/catalog via SWR.
 *
 * Key invariants:
 *   - Empty / loading / error states are inline (matches StockSearch's tone), not modal.
 *   - The "back" arrow re-uses the parent drawer's footer area (sticky inside the browser body).
 *
 * Read order:
 *   1. CatalogBrowserProps — contract.
 *   2. CatalogBrowser — top-level renderer with selectedGroupId state.
 *   3. GroupCard / GroupView — sub-renderers.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, Check, ChevronRight, Layers, Loader2, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMarketCatalog } from "@/lib/hooks/use-market-catalog"
import type {
  ResolvedGroup,
  ResolvedInstrument,
  ResolvedItem,
} from "@/lib/market-catalog/resolve-catalog"
import { CatalogOptionsTree, type OptionAddPayload } from "./catalog-options-tree"

export interface CatalogAddInstrumentPayload {
  token: number
  symbol: string
  name?: string
  exchange: string
  segment: string
}

export interface CatalogBrowserProps {
  existingTokens: number[]
  onAdd: (payload: CatalogAddInstrumentPayload | OptionAddPayload) => void
  addingToken: number | null
  /** Optional CTA on the empty state — when provided, shows a Switch-to-Search button so
      users on day-one (no admin curation yet) aren't stranded. */
  onSwitchToSearch?: () => void
}

const GROUP_GRADIENTS = [
  "from-blue-500/15 via-indigo-500/10 to-violet-500/15",
  "from-emerald-500/15 via-teal-500/10 to-cyan-500/15",
  "from-amber-500/15 via-orange-500/10 to-rose-500/15",
  "from-violet-500/15 via-fuchsia-500/10 to-pink-500/15",
  "from-sky-500/15 via-blue-500/10 to-indigo-500/15",
  "from-rose-500/15 via-pink-500/10 to-fuchsia-500/15",
] as const

export function CatalogBrowser({ existingTokens, onAdd, addingToken, onSwitchToSearch }: CatalogBrowserProps) {
  const { data, error, isLoading } = useMarketCatalog()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const existingTokenSet = useMemo(() => new Set(existingTokens), [existingTokens])

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading catalog…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
        <p className="text-sm font-medium text-foreground">Catalog unavailable</p>
        <p className="text-xs text-muted-foreground">Please try again in a moment.</p>
      </div>
    )
  }

  const groups = data?.groups ?? []
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
        <div className="h-16 w-16 rounded-3xl bg-primary/8 flex items-center justify-center">
          <Sparkles className="h-7 w-7 text-primary/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">No lists published yet</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
          The admin hasn&apos;t curated any lists. Use Search to find instruments by symbol.
        </p>
        {onSwitchToSearch && (
          <button
            type="button"
            onClick={onSwitchToSearch}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full",
              "text-xs font-semibold text-primary-foreground",
              "bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all",
              "shadow-sm",
            )}
          >
            Switch to Search
          </button>
        )}
      </div>
    )
  }

  const selectedGroup = selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId) ?? null
    : null

  if (selectedGroup) {
    return (
      <GroupView
        group={selectedGroup}
        existingTokens={existingTokenSet}
        onBack={() => setSelectedGroupId(null)}
        onAdd={onAdd}
        addingToken={addingToken}
      />
    )
  }

  return (
    <div className="px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] grid grid-cols-2 gap-2.5">
      {groups.map((g, i) => (
        <GroupCard
          key={g.id}
          group={g}
          gradient={GROUP_GRADIENTS[i % GROUP_GRADIENTS.length]!}
          onSelect={() => setSelectedGroupId(g.id)}
        />
      ))}
    </div>
  )
}

interface GroupCardProps {
  group: ResolvedGroup
  gradient: string
  onSelect: () => void
}

function GroupCard({ group, gradient, onSelect }: GroupCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative text-left rounded-2xl p-4 overflow-hidden transition-all",
        "bg-gradient-to-br",
        gradient,
        "border border-border/40",
        "hover:scale-[1.01] active:scale-[0.99]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="h-9 w-9 rounded-xl bg-background/60 backdrop-blur flex items-center justify-center">
          <Layers className="h-4 w-4 text-foreground/70" />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold text-foreground line-clamp-1">{group.label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {summarizeGroup(group)}
        </div>
      </div>
    </button>
  )
}

function summarizeGroup(group: ResolvedGroup): string {
  const instruments = group.items.filter((i) => i.kind === "instrument").length
  const chains = group.items.filter((i) => i.kind === "options-chain").length
  const parts: string[] = []
  if (instruments) parts.push(`${instruments} instrument${instruments === 1 ? "" : "s"}`)
  if (chains) parts.push(`${chains} chain${chains === 1 ? "" : "s"}`)
  return parts.length > 0 ? parts.join(" · ") : "Empty"
}

interface GroupViewProps {
  group: ResolvedGroup
  existingTokens: Set<number>
  onBack: () => void
  onAdd: (payload: CatalogAddInstrumentPayload | OptionAddPayload) => void
  addingToken: number | null
}

function GroupView({ group, existingTokens, onBack, onAdd, addingToken }: GroupViewProps) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
          aria-label="Back to catalog"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div>
          <div className="text-sm font-semibold text-foreground">{group.label}</div>
          {group.description && (
            <div className="text-[11px] text-muted-foreground">{group.description}</div>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] space-y-3">
        {group.items.map((item, idx) => (
          <ItemView
            key={`${item.kind}-${idx}`}
            item={item}
            existingTokens={existingTokens}
            onAdd={onAdd}
            addingToken={addingToken}
          />
        ))}
        {group.items.length === 0 && (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            This group is empty.
          </div>
        )}
      </div>
    </div>
  )
}

interface ItemViewProps {
  item: ResolvedItem
  existingTokens: Set<number>
  onAdd: (payload: CatalogAddInstrumentPayload | OptionAddPayload) => void
  addingToken: number | null
}

function ItemView({ item, existingTokens, onAdd, addingToken }: ItemViewProps) {
  if (item.kind === "instrument") {
    return (
      <InstrumentRow
        instrument={item}
        existingTokens={existingTokens}
        onAdd={onAdd}
        addingToken={addingToken}
      />
    )
  }
  return (
    <CatalogOptionsTree
      chain={item}
      existingTokens={existingTokens}
      onAdd={onAdd}
      addingToken={addingToken}
    />
  )
}

interface InstrumentRowProps {
  instrument: ResolvedInstrument
  existingTokens: Set<number>
  onAdd: (payload: CatalogAddInstrumentPayload) => void
  addingToken: number | null
}

function InstrumentRow({ instrument, existingTokens, onAdd, addingToken }: InstrumentRowProps) {
  const alreadyAdded = existingTokens.has(instrument.token)
  const isAdding = addingToken === instrument.token

  const handleClick = () => {
    if (alreadyAdded || isAdding) return
    onAdd({
      token: instrument.token,
      symbol: instrument.symbol,
      name: instrument.name,
      exchange: instrument.exchange,
      segment: instrument.segment,
    })
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3.5 py-3 rounded-2xl",
        "bg-muted/25 border border-border/30",
        alreadyAdded && "opacity-70",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground line-clamp-1">
          {instrument.symbol}
        </div>
        {instrument.name && (
          <div className="text-[11px] text-muted-foreground line-clamp-1">{instrument.name}</div>
        )}
      </div>
      <span className="text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
        {instrument.exchange}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={alreadyAdded || isAdding}
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
          alreadyAdded
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95",
        )}
        aria-label={alreadyAdded ? "Already in watchlist" : `Add ${instrument.symbol}`}
      >
        {alreadyAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
