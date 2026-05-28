/**
 * File:        lib/server/instrument-segment-normalize.ts
 * Module:      Server · Watchlist · Segment Normalization
 * Purpose:     Single source of truth for converting a loose (exchange, segment, optionType,
 *              strikePrice, expiry, canonicalSymbol, instrumentType) input into the canonical
 *              (exchange, segment, instrumentType) tuple that the rest of the system uses
 *              for watchlist storage, order routing, and Position records. Replaces the old
 *              MCX-or-else-NSE coercion that silently misrouted NCO / CDS / FX / IDX /
 *              NASDAQ / NYSE / BINANCE / CRYPTO instruments to NSE.
 *
 * Exports:
 *   - NormalizedInstrumentSegment                                         — result tuple
 *   - normalizeInstrumentSegment(input) → NormalizedInstrumentSegment      — main helper
 *   - extractCanonicalPrefix(canonicalSymbol)                              — parse "PREFIX:..." → uppercase prefix or null
 *   - isFOSegment(segment)                                                 — derivative-segment predicate (single source of truth for product-type / lot rules)
 *
 * Depends on:
 *   - none (pure functions, server-safe — no react / no prisma)
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Mirrors the prefix table in components/watchlist/search-result-card.tsx:175-198 so the
 *     visual classifier and the storage layer agree on what counts as e.g. crypto vs equity.
 *   - Empty / unrecognised input falls back to ("NSE", "NSE", undefined) — matches today's
 *     behaviour for plain Indian-equity adds, but only when truly nothing was provided.
 *   - Every kind that has a derivatives variant (futures/options) returns a *_FO segment
 *     (NSE_FO, BSE_FO, MCX_FO, NCO_FO, CDS_FO, BCD_FO). The downstream OrderExecutionService
 *     reads `_FO` to decide product type, lot enforcement, and margin policy.
 *   - Crypto / FX / US-equity / Index never receive a `_FO` suffix — those venues don't share
 *     the Indian-derivative product-type rules and routing them as `*_FO` would mis-attribute
 *     fees and margins.
 *   - `isFOSegment` is the canonical derivative-segment predicate for the order pipeline.
 *     Any caller that needs to ask "is this segment derivative?" (default product type,
 *     lot-multiple enforcement, margin engine routing) must call it instead of enumerating
 *     segment strings inline — that pattern silently regressed when BSE_FO/NCO_FO/CDS_FO/BCD_FO
 *     were introduced.
 *
 * Read order:
 *   1. NormalizedInstrumentSegment — output shape
 *   2. normalizeInstrumentSegment — kind-aware switch
 *   3. isFOSegment — predicate consumed by OrderExecutionService
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

export interface NormalizeInstrumentSegmentInput {
  exchange?: string | null
  segment?: string | null
  optionType?: string | null
  strikePrice?: number | null
  expiry?: string | null
  canonicalSymbol?: string | null
  instrumentType?: string | null
}

export interface NormalizedInstrumentSegment {
  /** Canonical exchange string for storage. Always uppercase. */
  exchange: string
  /** Canonical segment string for storage. Always uppercase. May equal exchange. */
  segment: string
  /** Canonical instrument type ("EQ" | "FUT" | "CE" | "PE" | "IDX" | "ETF" | "SPOT" | undefined). */
  instrumentType: string | undefined
}

/**
 * Parse a canonical symbol like "NASDAQ:AAPL" or "MCX:GOLD25JUNFUT" into its uppercase prefix.
 * Returns null when the symbol has no colon-prefix.
 */
export function extractCanonicalPrefix(canonicalSymbol: string | null | undefined): string | null {
  if (typeof canonicalSymbol !== "string") return null
  const idx = canonicalSymbol.indexOf(":")
  if (idx <= 0) return null
  const prefix = canonicalSymbol.slice(0, idx).trim().toUpperCase()
  return prefix || null
}

/**
 * Compute (exchange, segment, instrumentType) for storage. Recognises every prefix the
 * milli-search API can emit; unknown input falls back to ("NSE", "NSE", undefined) so plain
 * Indian-equity adds keep their existing behaviour.
 */
export function normalizeInstrumentSegment(
  input: NormalizeInstrumentSegmentInput,
): NormalizedInstrumentSegment {
  const rawExchange = String(input.exchange ?? "").trim().toUpperCase()
  const rawSegment = String(input.segment ?? "").trim().toUpperCase()
  const rawInstrumentType = String(input.instrumentType ?? "").trim().toUpperCase()
  const optionType = String(input.optionType ?? "").trim().toUpperCase()
  const canonicalPrefix = extractCanonicalPrefix(input.canonicalSymbol)

  // Recover the exchange from the canonical-symbol prefix when the explicit fields are
  // empty or just say "UNKNOWN". The prefix carries the venue intent the caller picked
  // in milli-search, so it's strictly more reliable than a default-NSE fallback.
  const exchangeHint =
    rawExchange && rawExchange !== "UNKNOWN" ? rawExchange : canonicalPrefix ?? ""

  const isOption = optionType === "CE" || optionType === "PE"
  const looksLikeFuture =
    rawInstrumentType === "FUT" ||
    rawSegment.endsWith("-FUT") ||
    rawSegment.includes("FUT") ||
    rawInstrumentType === "FUTSTK" ||
    rawInstrumentType === "FUTIDX" ||
    rawInstrumentType === "FUTCOM" ||
    rawInstrumentType === "FUTCUR"
  const hasDerivativeMetadata =
    isOption ||
    looksLikeFuture ||
    (input.strikePrice != null && Number.isFinite(input.strikePrice) && input.strikePrice > 0) ||
    (typeof input.expiry === "string" && input.expiry.trim().length > 0)

  // Resolve a venue family based on prefix + segment + explicit exchange. The order matters:
  // explicit non-Indian venues (crypto / FX / US) win over derivative-shape heuristics, since
  // those venues don't follow the Indian *_FO suffix convention.
  const venue: Venue = (() => {
    // Crypto venues
    if (
      exchangeHint === "BINANCE" ||
      exchangeHint === "CRYPTO" ||
      rawSegment === "CRYPTO" ||
      rawSegment === "SPOT" && (canonicalPrefix === "BINANCE" || canonicalPrefix === "CRYPTO")
    ) {
      return "CRYPTO"
    }

    // US / global equity venues
    if (
      exchangeHint === "NASDAQ" ||
      exchangeHint === "NYSE" ||
      exchangeHint === "US" ||
      exchangeHint === "GLOBAL"
    ) {
      return "US_EQUITY"
    }

    // Forex spot
    if (exchangeHint === "FX" || rawSegment === "FOREX") {
      return "FX_SPOT"
    }

    // Indian currency derivatives
    if (exchangeHint === "CDS" || rawSegment.startsWith("CDS")) return "CDS"
    if (exchangeHint === "BCD" || rawSegment.startsWith("BCD")) return "BCD"

    // Index venue (NSE/BSE indices like NIFTY 50, SENSEX)
    if (
      exchangeHint === "IDX" ||
      rawInstrumentType === "IDX" ||
      rawSegment === "INDICES"
    ) {
      return "INDEX"
    }

    // International NSE (GIFT City)
    if (exchangeHint === "NSEIX") return "NSEIX"

    // Indian commodity venues
    if (exchangeHint.includes("MCX") || rawSegment.includes("MCX")) return "MCX"
    if (exchangeHint === "NCO" || exchangeHint === "NCO_FO" || rawSegment.startsWith("NCO")) {
      return "NCO"
    }

    // Indian equity / equity-derivatives
    if (
      exchangeHint === "BSE" ||
      exchangeHint === "BFO" ||
      exchangeHint === "BSE_EQ" ||
      exchangeHint === "BSE_FO" ||
      rawSegment.startsWith("BSE") ||
      rawSegment === "BFO"
    ) {
      return "BSE"
    }
    if (
      exchangeHint === "NSE" ||
      exchangeHint === "NFO" ||
      exchangeHint === "NSE_EQ" ||
      exchangeHint === "NSE_FO" ||
      exchangeHint === "NSE-FO" ||
      exchangeHint === "NSE-EQ" ||
      rawSegment.startsWith("NSE") ||
      rawSegment === "NFO"
    ) {
      return "NSE"
    }

    // Empty input → keep today's NSE default for plain Indian equity adds.
    if (!exchangeHint && !rawSegment) return "NSE"

    // Truly unknown prefix — preserve as-is so storage doesn't lie.
    return "UNKNOWN"
  })()

  const derivative = hasDerivativeMetadata
  const instrumentType: string | undefined = (() => {
    if (isOption) return optionType // "CE" | "PE"
    if (looksLikeFuture) return "FUT"
    if (rawInstrumentType === "ETF") return "ETF"
    if (rawInstrumentType === "IDX" || venue === "INDEX") return "IDX"
    if (rawInstrumentType === "EQ") return "EQ"
    if (venue === "NSE" || venue === "BSE" || venue === "US_EQUITY") {
      // Equity-shape default when no explicit type and no derivative metadata.
      return "EQ"
    }
    if (rawInstrumentType) return rawInstrumentType // pass-through (e.g. "SPOT")
    return undefined
  })()

  // Pick canonical (exchange, segment) per venue.
  switch (venue) {
    case "NSE":
      return {
        exchange: derivative ? "NSE_FO" : "NSE",
        segment: derivative ? "NSE_FO" : "NSE",
        instrumentType,
      }
    case "BSE":
      return {
        exchange: derivative ? "BSE_FO" : "BSE",
        segment: derivative ? "BSE_FO" : "BSE",
        instrumentType,
      }
    case "MCX":
      // MCX is essentially derivative-only at retail; keep MCX_FO regardless.
      return { exchange: "MCX_FO", segment: "MCX_FO", instrumentType }
    case "NCO":
      return {
        exchange: derivative ? "NCO_FO" : "NCO",
        segment: derivative ? "NCO_FO" : "NCO",
        instrumentType,
      }
    case "CDS":
      return {
        exchange: derivative ? "CDS_FO" : "CDS",
        segment: derivative ? "CDS_FO" : "CDS",
        instrumentType,
      }
    case "BCD":
      return {
        exchange: derivative ? "BCD_FO" : "BCD",
        segment: derivative ? "BCD_FO" : "BCD",
        instrumentType,
      }
    case "FX_SPOT":
      return { exchange: "FX", segment: "FX", instrumentType: instrumentType ?? "SPOT" }
    case "INDEX":
      return { exchange: "IDX", segment: "INDICES", instrumentType: "IDX" }
    case "US_EQUITY":
      // Preserve the specific venue (NASDAQ vs NYSE vs generic US) for routing & display.
      return { exchange: exchangeHint || "US", segment: exchangeHint || "US", instrumentType: instrumentType ?? "EQ" }
    case "NSEIX":
      return { exchange: "NSEIX", segment: "NSEIX", instrumentType }
    case "CRYPTO":
      return {
        exchange: exchangeHint === "CRYPTO" ? "CRYPTO" : "BINANCE",
        segment: rawSegment === "SPOT" ? "SPOT" : "CRYPTO",
        instrumentType: instrumentType ?? "SPOT",
      }
    case "UNKNOWN":
    default:
      // Preserve whatever came in — better to surface "WEIRD_VENUE" than to lie with NSE.
      return {
        exchange: exchangeHint || "NSE",
        segment: rawSegment || exchangeHint || "NSE",
        instrumentType,
      }
  }
}

type Venue =
  | "NSE"
  | "BSE"
  | "MCX"
  | "NCO"
  | "CDS"
  | "BCD"
  | "FX_SPOT"
  | "INDEX"
  | "US_EQUITY"
  | "NSEIX"
  | "CRYPTO"
  | "UNKNOWN"

/**
 * Canonical "is this a derivative segment?" predicate. Returns true for any segment that
 * trades futures or options on an Indian exchange — covering both legacy aliases the order
 * route may still receive (NFO/BFO/FNO/MCX) and the canonical *_FO suffixes that
 * `normalizeInstrumentSegment` produces (NSE_FO, BSE_FO, MCX_FO, NCO_FO, CDS_FO, BCD_FO).
 *
 * Use this everywhere the pipeline must decide:
 *   - default product type (NRML for derivatives, CNC for cash)
 *   - whether to enforce `quantity % lotSize === 0`
 *   - which margin formula to apply
 *
 * NOT true for: equity ("NSE", "BSE", "NSE_EQ"), index spot ("IDX"), forex spot ("FX"),
 * US equity ("NASDAQ"/"NYSE"/"US"), crypto ("BINANCE"/"CRYPTO"/"SPOT"), NSEIX ("NSEIX").
 * Those venues have their own product-type semantics or aren't directly tradable as cash.
 */
export function isFOSegment(segment: string | null | undefined): boolean {
  if (typeof segment !== "string") return false
  const token = segment.trim().toUpperCase()
  if (!token) return false
  if (token.endsWith("_FO")) return true
  return token === "NFO" || token === "BFO" || token === "FNO" || token === "MCX"
}

/**
 * Map a (segment, exchange) tuple to the SINGLE display label the order-panel header should
 * show. Pre-2026-05 the order screen rendered a hardcoded NSE/BSE toggle for every
 * instrument — including BTCUSDT (CRYPTO), GOLD (MCX), USDINR (CDS) — which was visually wrong
 * and implied trade routing that doesn't exist. The order placement service routes by
 * `segment` alone, so the badge must reflect that segment, not a static option set.
 *
 * Returns:
 *   - "NSE"     for NSE / NSE_EQ / NSE_FO / NFO / FNO   (Indian equity + equity F&O)
 *   - "BSE"     for BSE / BSE_EQ / BSE_FO / BFO         (BSE equity + BSE F&O)
 *   - "MCX"     for MCX / MCX_FO                        (Indian commodity)
 *   - "NCO"     for NCO / NCO_FO                        (BSE non-MCX commodity)
 *   - "CDS"     for CDS / CDS_FO                        (NSE currency derivatives)
 *   - "BCD"     for BCD / BCD_FO                        (BSE currency derivatives)
 *   - "BINANCE" for BINANCE / CRYPTO / SPOT (with crypto context)
 *   - "NASDAQ" / "NYSE" / "US" — preserved as-is for global equity
 *   - "FX"      for FX / FOREX                          (forex spot)
 *   - "INDEX"   for IDX / INDICES                       (index spot — informational only)
 *   - "NSEIX"   for NSEIX                               (GIFT City international NSE)
 *   - exchange-as-given fallback when nothing matches (better to surface "WEIRD" than lie).
 */
export function resolveVenueDisplayLabel(
  segment: string | null | undefined,
  exchange: string | null | undefined,
): string {
  const seg = (segment || "").trim().toUpperCase()
  const exch = (exchange || "").trim().toUpperCase()

  // Crypto first — exchange hint is more reliable than segment for these
  if (exch === "BINANCE" || seg === "BINANCE") return "BINANCE"
  if (exch === "CRYPTO" || seg === "CRYPTO") return "CRYPTO"

  // US equity venues — preserve specific exchange (NASDAQ vs NYSE)
  if (exch === "NASDAQ" || seg === "NASDAQ") return "NASDAQ"
  if (exch === "NYSE" || seg === "NYSE") return "NYSE"
  if (exch === "US" || seg === "US") return "US"

  // Forex
  if (exch === "FX" || seg === "FX" || seg === "FOREX") return "FX"

  // Indian commodity #2 (NCO) — match before MCX since NCO_FO contains "NCO"
  if (exch.startsWith("NCO") || seg.startsWith("NCO")) return "NCO"

  // Indian commodity #1 (MCX)
  if (exch.includes("MCX") || seg.includes("MCX")) return "MCX"

  // Indian currency derivatives — BCD before BSE_FO since BCD belongs to BSE family
  if (exch.startsWith("BCD") || seg.startsWith("BCD")) return "BCD"
  if (exch.startsWith("CDS") || seg.startsWith("CDS")) return "CDS"

  // Index venues
  if (exch === "IDX" || seg === "IDX" || seg === "INDICES") return "INDEX"

  // GIFT City
  if (exch === "NSEIX" || seg === "NSEIX") return "NSEIX"

  // BSE family — equity + F&O, including legacy BFO alias
  if (
    exch === "BSE" ||
    exch === "BFO" ||
    exch.startsWith("BSE_") ||
    seg.startsWith("BSE") ||
    seg === "BFO"
  ) {
    return "BSE"
  }

  // NSE family — equity + F&O, including legacy NFO/FNO aliases (default for plain Indian eq)
  if (
    exch === "NSE" ||
    exch === "NFO" ||
    exch === "FNO" ||
    exch.startsWith("NSE_") ||
    seg.startsWith("NSE") ||
    seg === "NFO" ||
    seg === "FNO"
  ) {
    return "NSE"
  }

  // Truly unknown — return whatever exchange the caller had so storage doesn't lie. If even
  // that's empty, return "—" so the header shows a placeholder rather than an empty pill.
  return exch || seg || "—"
}
