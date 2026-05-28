/**
 * @file catalog-options-tree.tsx
 * @module components/watchlist
 * @description User-facing options-chain tree. Renders an expiry accordion with a CE/PE strike
 *              table per expiry. The ATM-rounded strike row is visually highlighted with a
 *              subtle gradient. Each CE/PE cell has a "+" affordance that fires onAdd with the
 *              instrument payload shaped for the existing watchlist add API.
 *
 * Exports:
 *   - CatalogOptionsTree — props { chain: ResolvedOptionsChain; existingTokens: Set<number>;
 *                                  onAdd: (payload) => void; addingToken: number | null }
 *
 * Side-effects: none (pure presentational; parent supplies state).
 *
 * Key invariants:
 *   - Token-based dedupe — uses existingTokens to grey out already-added rows.
 *   - The "+" button is only rendered when ce/pe is present AND not in existingTokens.
 *
 * Read order:
 *   1. CatalogOptionsTreeProps — contract.
 *   2. component body — render structure.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  OptionsStrikeRow,
  ResolvedOptionsChain,
  ResolvedOptionLeg,
} from "@/lib/market-catalog/resolve-catalog"

export interface OptionAddPayload {
  token: number
  symbol: string
  name?: string
  exchange: string
  segment: string
  strikePrice: number
  optionType: "CE" | "PE"
  expiry: string
  lotSize?: number
  ltp?: number
}

export interface CatalogOptionsTreeProps {
  chain: ResolvedOptionsChain
  existingTokens: Set<number>
  onAdd: (payload: OptionAddPayload) => void
  addingToken: number | null
}

export function CatalogOptionsTree({
  chain,
  existingTokens,
  onAdd,
  addingToken,
}: CatalogOptionsTreeProps) {
  const [openExpiry, setOpenExpiry] = useState<string | null>(
    chain.expiries[0]?.expiry ?? null,
  )

  const underlyingExchange = useMemo(
    () => deriveOptionExchange(chain.underlying.segment),
    [chain.underlying.segment],
  )

  if (chain.expiries.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No live contracts found for {chain.underlying.symbol}. Try again in a moment.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {chain.expiries.map((exp) => {
        const isOpen = openExpiry === exp.expiry
        return (
          <div
            key={exp.expiry}
            className="rounded-2xl border border-border/40 overflow-hidden bg-background/40"
          >
            <button
              type="button"
              onClick={() => setOpenExpiry(isOpen ? null : exp.expiry)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3",
                "text-left transition-colors",
                "hover:bg-muted/30",
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {formatExpiry(exp.expiry)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {exp.strikes.length} strikes
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="border-t border-border/40">
                <StrikeTableHeader />
                <div className="divide-y divide-border/20">
                  {exp.strikes.map((row) => (
                    <StrikeRowView
                      key={row.strike}
                      row={row}
                      expiry={exp.expiry}
                      underlyingSymbol={chain.underlying.symbol}
                      underlyingExchange={underlyingExchange}
                      existingTokens={existingTokens}
                      onAdd={onAdd}
                      addingToken={addingToken}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StrikeTableHeader() {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-2",
        "px-4 py-2 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold",
      )}
    >
      <div>Strike</div>
      <div>CE</div>
      <div>PE</div>
    </div>
  )
}

interface StrikeRowProps {
  row: OptionsStrikeRow
  expiry: string
  underlyingSymbol: string
  underlyingExchange: string
  existingTokens: Set<number>
  onAdd: (payload: OptionAddPayload) => void
  addingToken: number | null
}

function StrikeRowView({
  row,
  expiry,
  underlyingSymbol,
  underlyingExchange,
  existingTokens,
  onAdd,
  addingToken,
}: StrikeRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-2",
        "px-4 py-2.5 items-center text-sm",
        row.isAtm &&
          "bg-gradient-to-r from-primary/[0.06] via-primary/[0.10] to-primary/[0.06]",
      )}
    >
      <div
        className={cn(
          "tabular-nums font-medium text-foreground",
          row.isAtm && "text-primary",
        )}
      >
        {row.strike.toLocaleString("en-IN")}
        {row.isAtm && (
          <span className="ml-1.5 inline-flex items-center text-[9px] uppercase font-bold tracking-wide text-primary/80">
            ATM
          </span>
        )}
      </div>
      <LegCell
        leg={row.ce}
        kind="CE"
        strike={row.strike}
        expiry={expiry}
        underlyingSymbol={underlyingSymbol}
        underlyingExchange={underlyingExchange}
        existingTokens={existingTokens}
        onAdd={onAdd}
        addingToken={addingToken}
      />
      <LegCell
        leg={row.pe}
        kind="PE"
        strike={row.strike}
        expiry={expiry}
        underlyingSymbol={underlyingSymbol}
        underlyingExchange={underlyingExchange}
        existingTokens={existingTokens}
        onAdd={onAdd}
        addingToken={addingToken}
      />
    </div>
  )
}

interface LegCellProps {
  leg: ResolvedOptionLeg | undefined
  kind: "CE" | "PE"
  strike: number
  expiry: string
  underlyingSymbol: string
  underlyingExchange: string
  existingTokens: Set<number>
  onAdd: (payload: OptionAddPayload) => void
  addingToken: number | null
}

function LegCell({
  leg,
  kind,
  strike,
  expiry,
  underlyingSymbol,
  underlyingExchange,
  existingTokens,
  onAdd,
  addingToken,
}: LegCellProps) {
  if (!leg) {
    return <div className="text-xs text-muted-foreground/50">—</div>
  }
  const alreadyAdded = existingTokens.has(leg.token)
  const isAdding = addingToken === leg.token

  const handleClick = () => {
    if (alreadyAdded || isAdding) return
    onAdd({
      token: leg.token,
      symbol: leg.symbol,
      exchange: underlyingExchange,
      segment: underlyingExchange,
      strikePrice: strike,
      optionType: kind,
      expiry,
      lotSize: leg.lotSize,
      ltp: leg.ltp,
    })
  }

  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="min-w-0">
        <div className="text-xs font-medium tabular-nums text-foreground">
          {leg.ltp !== undefined ? `₹${leg.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
        </div>
        <div
          className={cn(
            "text-[10px] uppercase tracking-wide font-semibold",
            kind === "CE" ? "text-emerald-500" : "text-rose-500",
          )}
        >
          {kind}
        </div>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={alreadyAdded || isAdding}
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          "transition-colors text-[11px]",
          alreadyAdded
            ? "bg-emerald-500/10 text-emerald-500 cursor-default"
            : "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95",
          isAdding && "opacity-60",
        )}
        aria-label={alreadyAdded ? "Already in watchlist" : `Add ${kind} ${strike}`}
      >
        {alreadyAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function formatExpiry(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`)
  if (isNaN(d.getTime())) return ymd
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  })
}

function deriveOptionExchange(underlyingSegment: string): string {
  const seg = underlyingSegment.toUpperCase()
  if (seg.includes("BSE")) return "BSE_FO"
  if (seg.includes("MCX")) return "MCX_FO"
  return "NSE_FO"
}
