/**
 * File:        components/watchlist/search-result-card.tsx
 * Module:      Components · Watchlist · Search Result Card
 * Purpose:     A single, asset-aware result row for the watchlist Add-Stock drawer. Maps every
 *              shape the milli-search API can return — Indian equity, US equity, F&O futures,
 *              option calls/puts, MCX commodities, currency/forex, crypto, indices, ETFs —
 *              into a consistent, premium-feeling card with the right icon, accent colour,
 *              type-badge, expiry/strike/lot metadata, and price formatting per asset class.
 *
 * Exports:
 *   - SearchResultCard(props: SearchResultCardProps) — the row component
 *   - SearchResultCardProps — prop shape
 *   - getInstrumentMeta(instrument) → InstrumentMeta — exported for reuse in catalog/options pickers
 *   - InstrumentKind — discriminator: 'equity-in' | 'equity-us' | 'fno-fut' | 'fno-opt-ce' | …
 *   - InstrumentMeta — visual + label resolution result
 *
 * Depends on:
 *   - @/lib/services/search/milli-client — MilliInstrument shape
 *   - lucide-react — icon set
 *   - @/components/ui/badge — re-used badge component
 *
 * Side-effects:
 *   - none (pure presentational + onAdd callback)
 *
 * Key invariants:
 *   - getInstrumentMeta() is the *single* place where exchange/segment/instrumentType/optionType
 *     get classified into a visual kind. Anywhere else that needs to render a search result
 *     should call this rather than re-parse the same fields.
 *   - Price formatting is asset-aware: ₹ for Indian markets (NSE/BSE/MCX/CDS), $ for US/crypto,
 *     no symbol for FX pairs (4 decimals).
 *   - priceStatus 'stale' renders a STALE pill instead of a numeric price — same convention as
 *     the marketdata admin dashboard's SearchPage.tsx (lines 60-83).
 *   - The card is the click target; the round +/✓ button on the right is an emphasis affordance.
 *     `disabled` state covers both "already in watchlist" and "missing token to save".
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

"use client"

import { memo, useCallback, useState } from "react"
import {
  Check,
  Loader2,
  Plus,
} from "lucide-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MilliInstrument } from "@/lib/services/search/milli-client"

function LogoAvatar({ src }: { src: string }) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  return (
    <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden bg-muted/40 border border-border/30">
      <Image
        src={src}
        alt=""
        fill
        sizes="32px"
        className="object-contain p-0.5"
        onError={() => setErrored(true)}
      />
    </div>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type InstrumentKind =
  | "equity-in"   // NSE / BSE equity
  | "equity-us"   // NASDAQ / NYSE / global equity
  | "fno-fut"     // futures (NSE F&O / MCX / NCO / BFO)
  | "fno-opt-ce"  // call option
  | "fno-opt-pe"  // put option
  | "commodity"   // MCX / NCO commodity (non-future)
  | "currency"    // CDS / FX forex pair
  | "crypto"      // BINANCE / CRYPTO spot / derivative
  | "index"       // index (NIFTY / SENSEX etc.)
  | "etf"         // exchange-traded fund

type AccentTone = {
  /** Tailwind text colour class for headline accents. */
  text: string
  /** Tailwind classes for the small type-badge (combines bg + text + border). */
  badge: string
  /** Tailwind background colour class for the left accent stripe (solid, opaque). */
  stripe: string
}

/**
 * Minimum shape required to classify an instrument. MilliInstrument satisfies this; so do
 * watchlist items (WatchlistItemData) since they persist exchange/segment/optionType.
 */
export interface InstrumentClassifierInput {
  exchange?: string | null
  segment?: string | null
  instrumentType?: string | null
  assetClass?: string | null
  optionType?: "CE" | "PE" | string | null
  option_type?: "CE" | "PE" | string | null
  canonicalSymbol?: string | null
  isDerivative?: boolean | null
}

export interface InstrumentMeta {
  kind: InstrumentKind
  /** Visual accent palette derived from the kind. */
  accent: AccentTone
  /** Short type-badge label (e.g. "FUT", "CE", "EQ"). null when no badge needed. */
  typeBadge: string | null
  /** Exchange label shown in the secondary row (e.g. "NSE", "MCX", "Binance", "NASDAQ"). */
  exchangeLabel: string
  /** Asset-class word used in the secondary row (e.g. "Equity", "Future", "Call", "Forex"). */
  assetWord: string
  /** Currency / formatting hint for the price column. */
  priceFormat: "INR" | "USD" | "FX-pair" | "INDEX"
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export const ACCENTS: Record<InstrumentKind, AccentTone> = {
  "equity-in": {
    text: "text-blue-400",
    badge: "bg-blue-500/12 text-blue-400 border-blue-500/30",
    stripe: "bg-blue-500",
  },
  "equity-us": {
    text: "text-indigo-400",
    badge: "bg-indigo-500/12 text-indigo-400 border-indigo-500/30",
    stripe: "bg-indigo-500",
  },
  "fno-fut": {
    text: "text-violet-400",
    badge: "bg-violet-500/12 text-violet-400 border-violet-500/30",
    stripe: "bg-violet-500",
  },
  "fno-opt-ce": {
    text: "text-emerald-400",
    badge: "bg-emerald-500/12 text-emerald-400 border-emerald-500/30",
    stripe: "bg-emerald-500",
  },
  "fno-opt-pe": {
    text: "text-rose-400",
    badge: "bg-rose-500/12 text-rose-400 border-rose-500/30",
    stripe: "bg-rose-500",
  },
  commodity: {
    text: "text-amber-400",
    badge: "bg-amber-500/12 text-amber-400 border-amber-500/30",
    stripe: "bg-amber-500",
  },
  currency: {
    text: "text-cyan-400",
    badge: "bg-cyan-500/12 text-cyan-400 border-cyan-500/30",
    stripe: "bg-cyan-500",
  },
  crypto: {
    text: "text-yellow-400",
    badge: "bg-yellow-500/12 text-yellow-400 border-yellow-500/30",
    stripe: "bg-yellow-500",
  },
  index: {
    text: "text-sky-400",
    badge: "bg-sky-500/12 text-sky-400 border-sky-500/30",
    stripe: "bg-sky-500",
  },
  etf: {
    text: "text-teal-400",
    badge: "bg-teal-500/12 text-teal-400 border-teal-500/30",
    stripe: "bg-teal-500",
  },
}

/**
 * Single source of truth for classifying a milli-search row into a visual kind.
 * Uses (in priority order): assetClass → optionType → instrumentType → segment → exchange.
 *
 * The matrix mirrors the search-api's enums (search.controller.ts:497-572):
 *   - exchange:   NSE | BSE | NFO | BFO | MCX | CDS | BCD | BINANCE | CRYPTO | US | FX | IDX | NCO | NSEIX
 *   - segment:    *FUT | *OPT | INDICES | spot | crypto | forex | stocks
 *   - instrumentType: EQ | FUT | CE | PE | ETF | IDX | …
 *   - assetClass: equity | crypto | currency | commodity
 */
export function getInstrumentMeta(item: InstrumentClassifierInput): InstrumentMeta {
  let exchange = String(item.exchange || "").toUpperCase()
  let segment = String(item.segment || "").toUpperCase()
  let itype = String(item.instrumentType || "").toUpperCase()
  let assetClass = String(item.assetClass || "").toLowerCase()
  
  // Restore mangled metadata from canonical symbol if possible
  if (item.canonicalSymbol) {
    const parts = item.canonicalSymbol.split(":")
    if (parts.length > 1) {
      const prefix = parts[0].toUpperCase()
      if (prefix === "BINANCE" || prefix === "CRYPTO") {
        exchange = prefix
        assetClass = "crypto"
      } else if (prefix === "NASDAQ" || prefix === "NYSE" || prefix === "US" || prefix === "GLOBAL") {
        exchange = prefix
        if (!assetClass) assetClass = "equity"
      } else if (prefix === "FX" || prefix === "CDS" || prefix === "BCD") {
        exchange = prefix
        assetClass = "currency"
      } else if (prefix === "IDX") {
        exchange = prefix
        itype = "IDX"
      } else if (prefix === "NFO" || prefix === "NSE_FO" || prefix === "BFO") {
        exchange = prefix
      } else if (prefix === "MCX" || prefix === "MCX_FO" || prefix === "NCO") {
        exchange = prefix
        if (!assetClass) assetClass = "commodity"
      }
    }
  }

  const optionType = item.optionType || item.option_type
  const isOption = !!optionType
  const isFuture =
    !isOption && (
      itype === "FUT" || 
      segment.endsWith("-FUT") || 
      segment.includes("FUT") ||
      (item.isDerivative === true && itype !== "OPT" && !isOption) ||
      ((exchange === "NFO" || exchange === "NSE_FO" || exchange === "BFO") && itype !== "EQ")
    )

  // ── Resolve kind ─────────────────────────────────────────────────────────
  let kind: InstrumentKind
  if (assetClass === "crypto" || exchange === "BINANCE" || exchange === "CRYPTO" || segment === "CRYPTO") {
    kind = "crypto"
  } else if (
    assetClass === "currency" ||
    exchange === "FX" ||
    exchange === "CDS" ||
    exchange === "BCD" ||
    segment === "FOREX" ||
    segment.startsWith("CDS")
  ) {
    kind = "currency"
  } else if (isOption) {
    kind = optionType === "CE" ? "fno-opt-ce" : "fno-opt-pe"
  } else if (isFuture) {
    // Commodity futures still use the FUT visual to signal derivative,
    // but pick the amber accent if MCX/NCO so the row reads as commodity-flavoured.
    kind = exchange === "MCX" || exchange === "NCO" || segment.startsWith("MCX") || segment.startsWith("NCO") || segment.includes("MCX")
      ? "commodity"
      : "fno-fut"
  } else if (assetClass === "commodity" || exchange === "MCX" || exchange === "NCO") {
    kind = "commodity"
  } else if (itype === "IDX" || segment === "INDICES" || exchange === "IDX") {
    kind = "index"
  } else if (itype === "ETF") {
    kind = "etf"
  } else if (exchange === "NASDAQ" || exchange === "NYSE" || exchange === "US" || exchange === "GLOBAL") {
    kind = "equity-us"
  } else {
    kind = "equity-in"
  }

  // ── Badge label ─────────────────────────────────────────────────────────
  const typeBadge = (() => {
    switch (kind) {
      case "fno-fut":
        return "FUT"
      case "fno-opt-ce":
        return "CE"
      case "fno-opt-pe":
        return "PE"
      case "commodity":
        return isFuture ? "FUT" : null
      case "etf":
        return "ETF"
      case "index":
        return "IDX"
      case "equity-in":
      case "equity-us":
        return "EQ"
      default:
        return null
    }
  })()

  const exchangeLabel = (() => {
    const ex = exchange.toUpperCase()
    if (ex === "BINANCE") return "Binance"
    if (ex === "NASDAQ") return "NASDAQ"
    if (ex === "NYSE") return "NYSE"
    if (ex === "US") return "US"
    if (ex === "GLOBAL") return "Global"
    if (ex === "FX") return "FX"
    if (ex === "MCX" || ex === "MCX_FO") return "MCX"
    if (ex === "BSE" || ex === "BFO" || ex === "BSE_EQ") return "BSE"
    if (ex === "NSE" || ex === "NFO" || ex === "NSE_FO" || ex === "NSE-FO" || ex === "NSE_EQ" || ex === "NSE-EQ") return "NSE"
    if (ex === "NCO") return "NCO"
    if (ex === "NSEIX") return "NSE IX"
    if (ex === "CDS" || ex === "BCD") return "CDS"
    if (ex === "IDX") return "Indices"
    if (ex) return ex
    return "—"
  })()

  const assetWord = (() => {
    switch (kind) {
      case "equity-in":
        return "Equity"
      case "equity-us":
        return "US Equity"
      case "fno-fut":
        return "Future"
      case "fno-opt-ce":
        return "Call"
      case "fno-opt-pe":
        return "Put"
      case "commodity":
        return isFuture ? "Commodity Future" : "Commodity"
      case "currency":
        return "Forex"
      case "crypto":
        return segment === "SPOT" || segment === "spot" ? "Crypto Spot" : "Crypto"
      case "index":
        return "Index"
      case "etf":
        return "ETF"
    }
  })()

  const priceFormat: InstrumentMeta["priceFormat"] =
    kind === "crypto" || kind === "equity-us"
      ? "USD"
      : kind === "currency"
      ? "FX-pair"
      : kind === "index"
      ? "INDEX"
      : "INR"

  return {
    kind,
    accent: ACCENTS[kind],
    typeBadge,
    exchangeLabel,
    assetWord,
    priceFormat,
  }
}

/**
 * Format an expiry date that arrives in either ISO ("2026-05-29") or compact ("20260529")
 * form into a human "29 May 26" — used for futures/options secondary rows.
 */
export function formatExpiry(expiry?: string | null): string {
  if (!expiry) return ""
  try {
    const date = /^\d{8}$/.test(expiry)
      ? new Date(`${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`)
      : new Date(expiry)
    if (isNaN(date.getTime())) return expiry
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
  } catch {
    return expiry || ""
  }
}

/**
 * Asset-aware price formatting. Returns null when there's no usable price — the caller
 * should render a STALE pill or em-dash. Locale rules:
 *   - INR: en-IN grouping, 2 decimals when < 100, else 0–2 depending on magnitude.
 *   - USD: en-US grouping, 2 decimals.
 *   - FX-pair: 4 decimals, no symbol (e.g. "1.0843").
 *   - INDEX: en-IN grouping, 2 decimals, no symbol (indices are unitless, e.g. "22,150.45").
 */
export function formatPrice(value: number | null | undefined, fmt: InstrumentMeta["priceFormat"]): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null

  switch (fmt) {
    case "INR": {
      const decimals = value >= 1000 ? 2 : value >= 1 ? 2 : 4
      return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
    }
    case "USD": {
      const decimals = value >= 1 ? 2 : 6
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
    }
    case "FX-pair":
      return value.toFixed(4)
    case "INDEX":
      return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface SearchResultCardProps {
  instrument: MilliInstrument
  /** Whether this instrument's token is already in the watchlist. */
  isExisting: boolean
  /** Whether the add-to-watchlist save is in flight for this row. */
  isAdding: boolean
  /** Whether the row is unsaveable (no resolvable token). */
  isAddDisabled: boolean
  /** Click handler — fired from either the row itself or the trailing + button. */
  onAdd: () => void
}

/**
 * Premium, asset-aware result row. Visual treatment is driven entirely by getInstrumentMeta(),
 * so the component itself stays purely declarative.
 */
function SearchResultCardImpl({
  instrument,
  isExisting,
  isAdding,
  isAddDisabled,
  onAdd,
}: SearchResultCardProps) {
  const meta = getInstrumentMeta(instrument)
  const { accent, typeBadge, exchangeLabel, assetWord, priceFormat, kind } = meta

  // ── Title resolution ─────────────────────────────────────────────────────
  // Prefer a clean composed title for derivatives so we never have to string-strip the raw
  // upstream `description` field. Falls back to the instrument's symbol or upstream name.
  const expiryLabel = formatExpiry(instrument.expiry_date || instrument.expiry)
  const strikeNum = typeof instrument.strike_price === "number"
    ? instrument.strike_price
    : typeof (instrument as any).strike === "number"
    ? (instrument as any).strike as number
    : null

  const isOption = kind === "fno-opt-ce" || kind === "fno-opt-pe"
  const isFuture = kind === "fno-fut" || (kind === "commodity" && instrument.instrumentType === "FUT")

  const composedTitle = (() => {
    if (isOption && strikeNum !== null) {
      const opt = kind === "fno-opt-ce" ? "CE" : "PE"
      return `${instrument.symbol} ${strikeNum.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${opt}`
    }
    if (isFuture) {
      return expiryLabel ? `${instrument.symbol} ${expiryLabel}` : instrument.symbol
    }
    return instrument.symbol
  })()

  // ── Tertiary row (varies by kind) ────────────────────────────────────────
  const tertiary: string = (() => {
    if (isOption && strikeNum !== null) {
      const lot = instrument.lot_size || instrument.lotSize
      const strikeFmt = `Strike ₹${strikeNum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      return lot ? `${strikeFmt} · Lot ${lot}` : strikeFmt
    }
    if (isFuture) {
      const lot = instrument.lot_size || instrument.lotSize
      return lot ? `Lot ${lot}` : (instrument.name || "")
    }
    // Equity / crypto / fx / index / etf / commodity-spot
    return instrument.name || instrument.companyName || ""
  })()

  // ── Price + status ──────────────────────────────────────────────────────
  const priceStr = formatPrice(instrument.last_price ?? null, priceFormat)
  const isStale = instrument.priceStatus === "stale" || (priceStr === null)

  const onClick = useCallback(() => {
    if (isAddDisabled) return
    onAdd()
  }, [isAddDisabled, onAdd])

  return (
    <div
      role="button"
      tabIndex={isAddDisabled ? -1 : 0}
      aria-label={isExisting ? `${instrument.symbol} already in watchlist` : `Add ${instrument.symbol} to watchlist`}
      aria-disabled={isAddDisabled}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isAddDisabled) {
          e.preventDefault()
          onAdd()
        }
      }}
      className={cn(
        "group relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl overflow-hidden",
        "bg-card/60 border border-border/30",
        "hover:bg-card hover:border-border/70 hover:shadow-[0_2px_12px_rgba(0,0,0,0.18)]",
        "active:scale-[0.985] transition-all duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "cursor-pointer",
        isExisting && "opacity-60 cursor-default",
        isAddDisabled && !isExisting && "opacity-50 cursor-not-allowed",
      )}
    >
      {/* ── Left accent stripe — kind-coloured, signals asset class ── */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2 bottom-2 w-[3px] rounded-full opacity-90",
          accent.stripe,
        )}
      />

      {/* ── Company logo (optional) ── */}
      {instrument.logo_url && <LogoAvatar src={instrument.logo_url} />}

      {/* ── Body ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Primary row: title + type badge + (optional) live dot */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[14px] font-semibold text-foreground leading-tight truncate">
            {composedTitle}
          </span>
          {typeBadge && (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[9px] px-1.5 h-[18px] font-bold tracking-wider border",
                accent.badge,
              )}
            >
              {typeBadge}
            </Badge>
          )}
          {!isStale && priceStr && (
            <span
              aria-hidden
              className="shrink-0 ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
              title="Live price"
            />
          )}
        </div>

        {/* Secondary row: exchange · type · expiry */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground leading-tight">
          <span className={cn("font-semibold tracking-wide", accent.text)}>{exchangeLabel}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-medium tracking-wide">{assetWord}</span>
          {expiryLabel && (isFuture || isOption) && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-mono">{expiryLabel}</span>
            </>
          )}
        </div>

        {/* Tertiary row: company name OR strike/lot */}
        {tertiary && (
          <div className="text-[10.5px] text-muted-foreground/75 leading-tight truncate">
            {tertiary}
          </div>
        )}
      </div>

      {/* ── Price column ── */}
      <div className="shrink-0 min-w-[72px] text-right flex flex-col items-end gap-0.5">
        {priceStr ? (
          <span className="text-[13.5px] font-semibold font-mono tabular-nums text-foreground">
            {priceStr}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center text-[9px] font-bold tracking-[0.06em] px-1.5 h-[18px] rounded",
              "bg-muted/60 text-muted-foreground/80 border border-border/50",
            )}
          >
            STALE
          </span>
        )}
      </div>

      {/* ── Add button (emphasis affordance) ── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (!isAddDisabled) onAdd()
        }}
        disabled={isAddDisabled}
        aria-label={isExisting ? "Already added" : `Add ${instrument.symbol}`}
        className={cn(
          "shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          isExisting
            ? "bg-emerald-500/15 text-emerald-400 cursor-default"
            : isAddDisabled
            ? "bg-muted/50 text-muted-foreground/30 cursor-not-allowed"
            : "bg-primary/10 text-primary hover:bg-primary/20 active:scale-90",
        )}
      >
        {isAdding ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isExisting ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}

export const SearchResultCard = memo(SearchResultCardImpl)
