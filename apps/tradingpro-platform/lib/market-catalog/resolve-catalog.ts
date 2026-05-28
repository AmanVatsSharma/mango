/**
 * @file resolve-catalog.ts
 * @module lib/market-catalog
 * @description Recipe-to-tree resolver. Takes a raw MarketCatalogV1 (which contains both
 *              pre-resolved instrument items and options-chain *recipes*) and expands every
 *              recipe against the live Vedpragya feed to produce a ResolvedCatalog the UI
 *              can render directly.
 *
 *              The expansion logic for an options-chain recipe:
 *                1. Fetch the underlying spot LTP → derive ATM strike (round to nearest step).
 *                2. Fetch all instruments matching the underlying root with ltp_only=true.
 *                3. Filter to options (CE/PE), restrict to future expiries.
 *                4. Pick the next N expiries per the recipe's strategy.
 *                5. For each expiry, restrict strikes to ATM ± window·step (or the explicit list).
 *                6. Pair CE+PE per strike into a row; sort strikes ascending.
 *
 *              Resolution is process-cached for RESOLVE_CACHE_TTL_MS (30s) keyed by the catalog
 *              hash so back-to-back user reads don't re-hit Vedpragya. Admin saves invalidate
 *              the cache via `invalidateResolveCatalogCache()`.
 *
 *              Failure mode: if Vedpragya is down for a single recipe, that recipe expands to
 *              an empty tree (so the rest of the catalog still renders). No throw.
 *
 * Exports:
 *   - resolveCatalog(raw)                   — main entry; returns ResolvedCatalog
 *   - invalidateResolveCatalogCache()       — drop process cache (called on admin PUT)
 *   - ResolvedCatalog, ResolvedGroup, ResolvedItem, ResolvedOptionsChain, OptionsStrikeRow — types
 *
 * Side-effects:
 *   - Read calls to Vedpragya via upstream-instruments-client (server-only).
 *   - Module-scoped resolution cache (in-process, 30s).
 *
 * Key invariants:
 *   - All times are IST. "Future" = expiry >= today (IST midnight).
 *   - Cache key is a stable hash of the raw catalog string — admin changes mint a new key.
 *   - Strike rounding always uses Math.round (nearest), not floor/ceil.
 *
 * Read order:
 *   1. ResolvedCatalog types — see what the UI consumes.
 *   2. resolveCatalog → resolveGroup → resolveOptionsChain — top-down.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

import "server-only"

import type {
  CatalogGroup,
  CatalogItem,
  ExpiryStrategy,
  InstrumentItem,
  MarketCatalogV1,
  OptionsChainItem,
  StrikeStrategy,
} from "./catalog-schema"
import { resolveStrikeStep } from "./strike-step"
import {
  fetchInstruments,
  fetchUnderlyingLtp,
  type UpstreamInstrument,
} from "./upstream-instruments-client"

/* ────────────────────────────────────────────────────────────────────────────────
 * Resolved tree types — what the UI consumes
 * ────────────────────────────────────────────────────────────────────────────── */

export interface ResolvedInstrument {
  kind: "instrument"
  token: number
  uirId?: number
  symbol: string
  name?: string
  exchange: string
  segment: string
  ltp?: number
}

export interface ResolvedOptionLeg {
  token: number
  uirId?: number
  symbol: string
  ltp?: number
  lotSize?: number
}

export interface OptionsStrikeRow {
  strike: number
  /** True iff this is the ATM-rounded strike (highlighted in the UI). */
  isAtm: boolean
  ce?: ResolvedOptionLeg
  pe?: ResolvedOptionLeg
}

export interface ResolvedOptionsExpiry {
  /** YYYY-MM-DD in IST. */
  expiry: string
  strikes: OptionsStrikeRow[]
}

export interface ResolvedOptionsChain {
  kind: "options-chain"
  underlying: { token: number; symbol: string; segment: string; spot?: number; atm?: number }
  expiries: ResolvedOptionsExpiry[]
}

export type ResolvedItem = ResolvedInstrument | ResolvedOptionsChain

export interface ResolvedGroup {
  id: string
  label: string
  description?: string
  icon?: string
  sortOrder: number
  items: ResolvedItem[]
}

export interface ResolvedCatalog {
  version: 1
  groups: ResolvedGroup[]
  resolvedAt: string
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Process-level resolution cache (30s)
 * ────────────────────────────────────────────────────────────────────────────── */

const RESOLVE_CACHE_TTL_MS = 30_000

let resolveCache: { key: string; value: ResolvedCatalog; cachedAt: number } | null = null

export function invalidateResolveCatalogCache(): void {
  resolveCache = null
}

function hashCatalog(raw: MarketCatalogV1): string {
  // Stable JSON shape for key — group/item ordering is meaningful so don't sort.
  return JSON.stringify(raw)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * IST date helpers
 * ────────────────────────────────────────────────────────────────────────────── */

function nowIstYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

function normalizeExpiryYmd(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // Some Vedpragya rows return YYYYMMDD — accept that too.
  const m2 = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  // Or DD-MMM-YYYY (rarer) — last-resort parse.
  const d = new Date(value)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Strategy → strike & expiry resolution
 * ────────────────────────────────────────────────────────────────────────────── */

interface StrikeWindow {
  strikes: number[]
  step: number
  atm: number | null
}

async function resolveStrikeWindow(
  underlyingSymbol: string,
  strategy: StrikeStrategy,
): Promise<StrikeWindow> {
  if (strategy.mode === "explicit") {
    const sorted = [...strategy.strikes].sort((a, b) => a - b)
    const step = sorted.length >= 2 ? sorted[1] - sorted[0] : resolveStrikeStep(underlyingSymbol)
    return { strikes: sorted, step, atm: null }
  }
  const step = resolveStrikeStep(underlyingSymbol, strategy.step)
  const spot = await fetchUnderlyingLtp(underlyingSymbol)
  if (spot === null) {
    return { strikes: [], step, atm: null }
  }
  const atm = Math.round(spot / step) * step
  const strikes: number[] = []
  for (let i = -strategy.window; i <= strategy.window; i++) {
    strikes.push(atm + i * step)
  }
  return { strikes, step, atm }
}

function pickFutureExpiries(
  available: string[],
  todayIst: string,
  strategy: ExpiryStrategy,
): string[] {
  const future = available.filter((e) => e >= todayIst).sort()
  if (strategy.mode === "explicit") {
    return strategy.dates.filter((d) => future.includes(d)).sort()
  }
  // For weekly/monthly, Vedpragya already returns expiries — we just pick the first N.
  // We can't reliably tell weekly from monthly without a calendar; for v1, "next-n-weekly"
  // and "next-n-monthly" both walk the available expiries. Future iteration: filter by
  // last-Thursday-of-month for monthly.
  return future.slice(0, strategy.count)
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Per-item resolvers
 * ────────────────────────────────────────────────────────────────────────────── */

function resolveInstrumentItem(item: InstrumentItem): ResolvedInstrument {
  return {
    kind: "instrument",
    token: item.token,
    uirId: item.uirId ?? item.id,
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    segment: item.segment,
  }
}

function pickToken(inst: UpstreamInstrument): number | null {
  const t = inst.token ?? inst.instrumentToken
  return typeof t === "number" && t > 0 ? t : null
}

function pickUirId(inst: UpstreamInstrument): number | null {
  const u = inst.uirId ?? inst.id
  return typeof u === "number" && u > 0 ? u : null
}

function pickStrike(inst: UpstreamInstrument): number | null {
  const s = inst.strike ?? inst.strike_price
  return typeof s === "number" && s > 0 ? s : null
}

function pickExpiry(inst: UpstreamInstrument): string | null {
  const raw = inst.expiry ?? inst.expiry_date
  return raw ? normalizeExpiryYmd(raw) : null
}

function pickOptionType(inst: UpstreamInstrument): "CE" | "PE" | null {
  const t = inst.option_type ?? inst.optionType
  return t === "CE" || t === "PE" ? t : null
}

async function resolveOptionsChain(item: OptionsChainItem): Promise<ResolvedOptionsChain> {
  const todayIst = nowIstYmd()

  // 1. Strike window (and ATM, if derivable).
  const { strikes, atm } = await resolveStrikeWindow(item.underlying.symbol, item.strikeStrategy)

  // 2. Pull a wide slice of options for the underlying root from Vedpragya.
  //    We pass min/max strike if we have them so Vedpragya server-side filters; for explicit
  //    strikes we leave it open and filter ourselves.
  const strikeMin = strikes.length ? Math.min(...strikes) : undefined
  const strikeMax = strikes.length ? Math.max(...strikes) : undefined
  const upstream = await fetchInstruments({
    q: item.underlying.symbol,
    strike_min: strikeMin,
    strike_max: strikeMax,
    limit: 500,
  })

  // 3. Group by expiry. Track unique expiries for the strategy picker.
  const optionsByExpiry = new Map<string, UpstreamInstrument[]>()
  for (const inst of upstream) {
    const ot = pickOptionType(inst)
    if (!ot) continue
    if (ot === "CE" && !item.includeCE) continue
    if (ot === "PE" && !item.includePE) continue
    const exp = pickExpiry(inst)
    if (!exp) continue
    if (!optionsByExpiry.has(exp)) optionsByExpiry.set(exp, [])
    optionsByExpiry.get(exp)!.push(inst)
  }

  // 4. Pick expiries per strategy.
  const wantedExpiries = pickFutureExpiries(
    Array.from(optionsByExpiry.keys()),
    todayIst,
    item.expiryStrategy,
  )

  // 5. Build strike rows per chosen expiry.
  const expiries: ResolvedOptionsExpiry[] = []
  for (const expiry of wantedExpiries) {
    const slots = optionsByExpiry.get(expiry) ?? []
    const byStrike = new Map<number, OptionsStrikeRow>()

    const seedStrike = (strike: number) => {
      if (!byStrike.has(strike)) {
        byStrike.set(strike, { strike, isAtm: atm !== null && strike === atm })
      }
    }

    if (item.strikeStrategy.mode === "explicit") {
      for (const s of strikes) seedStrike(s)
    } else if (strikes.length) {
      for (const s of strikes) seedStrike(s)
    }

    for (const inst of slots) {
      const strike = pickStrike(inst)
      if (strike === null) continue
      // For atm-window: only keep strikes inside the window. For explicit: only keep the listed ones.
      if (strikes.length && !strikes.includes(strike)) continue
      seedStrike(strike)
      const row = byStrike.get(strike)!
      const token = pickToken(inst)
      if (token === null) continue
      const leg: ResolvedOptionLeg = {
        token,
        uirId: pickUirId(inst) ?? undefined,
        symbol: inst.symbol,
        ltp: typeof inst.last_price === "number" ? inst.last_price : inst.ltp,
        lotSize: inst.lot_size ?? inst.lotSize,
      }
      const ot = pickOptionType(inst)
      if (ot === "CE") row.ce = leg
      else if (ot === "PE") row.pe = leg
    }

    const rows = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike)
    expiries.push({ expiry, strikes: rows })
  }

  return {
    kind: "options-chain",
    underlying: {
      token: item.underlying.token,
      symbol: item.underlying.symbol,
      segment: item.underlying.segment,
      atm: atm ?? undefined,
    },
    expiries,
  }
}

async function resolveItem(item: CatalogItem): Promise<ResolvedItem> {
  if (item.kind === "instrument") return resolveInstrumentItem(item)
  return resolveOptionsChain(item)
}

async function resolveGroup(group: CatalogGroup): Promise<ResolvedGroup> {
  const items = await Promise.all(group.items.map((it) => resolveItem(it).catch(() => null)))
  return {
    id: group.id,
    label: group.label,
    description: group.description,
    icon: group.icon,
    sortOrder: group.sortOrder,
    items: items.filter((x): x is ResolvedItem => x !== null),
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Public entry
 * ────────────────────────────────────────────────────────────────────────────── */

export async function resolveCatalog(raw: MarketCatalogV1): Promise<ResolvedCatalog> {
  const key = hashCatalog(raw)
  const now = Date.now()
  if (resolveCache && resolveCache.key === key && now - resolveCache.cachedAt < RESOLVE_CACHE_TTL_MS) {
    return resolveCache.value
  }

  const groups = await Promise.all(raw.groups.map((g) => resolveGroup(g)))
  groups.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))

  const resolved: ResolvedCatalog = {
    version: 1,
    groups,
    resolvedAt: new Date().toISOString(),
  }
  resolveCache = { key, value: resolved, cachedAt: Date.now() }
  return resolved
}
