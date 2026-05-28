/**
 * File:        lib/services/search/milli-client.ts
 * Module:      Services · Search
 * Purpose:     Client for the internal milli-search proxy routes (suggest/search/filters/SSE/telemetry)
 *              with an optional direct-upstream fast path that matches the marketdata admin
 *              dashboard's same-origin call pattern. The BFF route is kept as a safe fallback
 *              for environments where CORS isn't available on the upstream.
 *
 * Exports:
 *   - suggest(params, signal?)      → MilliInstrument[]
 *   - search(params)                → MilliInstrument[]
 *   - filters(params)               → any
 *   - telemetrySelection(body)      → void (fire-and-forget)
 *   - buildStreamURL(params)        → string  (SSE URL for EventSource)
 *   - milliClient                   — object bundling all exports
 *   - MilliInstrument               — normalised instrument shape
 *   - MilliMode                     — 'eq' | 'fno' | 'curr' | 'commodities'
 *   - MilliSearchParams             — full search parameter shape
 *   - MilliSuggestParams            — lightweight autocomplete parameters (q, mode, exchange, assetClass, ltp_only)
 *   - MilliFiltersParams            — facet filter parameters
 *
 * Depends on:
 *   - /api/milli-search/*  — internal Next.js proxy routes for suggest/search (BFF fallback;
 *     adds the x-admin-token + ?include=internal so broker tokens are returned for save flows)
 *   - NEXT_PUBLIC_MARKETDATA_BASE_URL — when set AND the upstream serves CORS for the app
 *     origin, suggest/search/filters/stream are called *directly* from the browser. This
 *     skips a Next.js BFF round-trip and matches the dashboard's lightning-fast path. Direct
 *     calls do NOT include the admin token, so responses lack broker tokens — that is fine
 *     because watchlist persistence stores `uirId` + `canonicalSymbol` (provider-agnostic).
 *
 * Side-effects:
 *   - Outbound fetch to /api/milli-search/* (BFF, same-origin) or directly to upstream
 *     when NEXT_PUBLIC_MARKETDATA_BASE_URL is set.
 *
 * Key invariants:
 *   - normalizeItem sets `id`/`uirId` from the UIR id for SSE keying
 *   - normalizeItem sets `token`/`instrumentToken` from vortexToken ?? kiteToken ?? id
 *     (broker token preferred; falls back to UIR id when only the public response is available)
 *   - SSE stream payload is { quotes: { "<uirId>": { last_price: N } }, ts: "..." }
 *   - buildStreamURL uses ?ids= (UIR ids) — the upstream also accepts legacy ?tokens= alias
 *   - Direct path strips ?include=internal so the upstream returns the public response only
 *   - Direct path always sends a `?fields=` projection list to trim payload size at the source
 *   - When NEXT_PUBLIC_MARKETDATA_BASE_URL is unset, all calls fall back to the BFF (no behaviour change)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

export type MilliMode = 'eq' | 'fno' | 'curr' | 'commodities'

export interface MilliInstrument {
  /** Universal instrument id (UIR) — provider-agnostic, used as SSE stream key */
  id?: number
  uirId?: number
  wsSubscribeUirId?: number
  /** Canonical display symbol from the search-api */
  canonicalSymbol?: string
  /** Broker token for WS subscriptions and watchlist storage (vortexToken ?? kiteToken ?? id) */
  instrumentToken?: number
  token?: number
  symbol: string
  tradingSymbol?: string
  companyName?: string
  name?: string
  exchange: string
  segment: string
  instrumentType?: string
  expiryDate?: string
  expiry?: string
  strike?: number
  strike_price?: number
  optionType?: 'CE' | 'PE'
  option_type?: 'CE' | 'PE'
  lotSize?: number
  lot_size?: number
  last_price?: number
  priceStatus?: 'live' | 'stale'
  streamProvider?: string
  /** Internal fields — present when proxies pass ?include=internal (MARKETDATA_ADMIN_TOKEN set) */
  kiteToken?: number
  vortexToken?: number
  vortexExchange?: string
  massiveToken?: string | number
  binanceToken?: string | number
  _internalProvider?: string
  ticker?: string
  underlyingSymbol?: string
  isDerivative?: boolean
  logo_url?: string
  [key: string]: any
}

export interface MilliSearchParams {
  q: string
  exchange?: string
  segment?: string
  instrumentType?: string
  /** equity | crypto | currency | commodity */
  assetClass?: string
  mode?: MilliMode
  expiry_from?: string
  expiry_to?: string
  strike_min?: number
  strike_max?: number
  ltp_only?: boolean
}

export interface MilliSuggestParams extends Pick<MilliSearchParams, 'q' | 'mode' | 'exchange' | 'assetClass' | 'ltp_only'> {}

export interface MilliFiltersParams extends Omit<MilliSearchParams, 'limit'> {}

function normalizeItem(item: MilliInstrument): MilliInstrument {
  // UIR id — provider-agnostic, keyed by SSE stream quotes
  const id = item.id ?? item.uirId ?? item.wsSubscribeUirId

  // Broker token: prefer numeric vortex/kite tokens for WS subscriptions and watchlist saves.
  // massiveToken/binanceToken are string symbols (e.g. "AAPL", "BTCUSDT") — incompatible with
  // WatchlistItem.token (Int?). Fall back to id so the UI at least has a usable key.
  const brokerToken =
    (typeof item.vortexToken === 'number' ? item.vortexToken : undefined) ??
    (typeof item.kiteToken === 'number' ? item.kiteToken : undefined) ??
    item.token ??
    item.instrumentToken ??
    (typeof id === 'number' ? id : undefined)

  const exchange = item.vortexExchange ?? item.exchange
  const expiry = item.expiry ?? item.expiryDate
  const strike_price = item.strike_price ?? item.strike
  const option_type = item.option_type ?? item.optionType
  const lot_size = item.lot_size ?? item.lotSize
  const symbol = item.symbol ?? item.canonicalSymbol ?? ''
  const name = item.name ?? item.companyName ?? item.canonicalSymbol ?? symbol

  return {
    ...item,
    id,
    uirId: id,
    wsSubscribeUirId: id,
    token: brokerToken,
    instrumentToken: brokerToken,
    exchange,
    symbol,
    tradingSymbol: item.tradingSymbol ?? symbol,
    name,
    companyName: name,
    expiry,
    expiryDate: expiry,
    strike_price,
    strike: strike_price,
    option_type,
    optionType: option_type,
    lot_size,
    lotSize: lot_size,
  }
}

function withDefaults<T extends MilliSearchParams | MilliSuggestParams>(params: T): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {}
  if (params.q) p.q = params.q
  if ('mode' in params && params.mode) p.mode = params.mode
  if ('exchange' in params && params.exchange) p.exchange = params.exchange as string
  if ('segment' in params && params.segment) p.segment = params.segment as string
  if ('instrumentType' in params && params.instrumentType) p.instrumentType = params.instrumentType as string
  if ('assetClass' in params && params.assetClass) p.assetClass = params.assetClass as string
  if ('expiry_from' in params && params.expiry_from) p.expiry_from = params.expiry_from as string
  if ('expiry_to' in params && params.expiry_to) p.expiry_to = params.expiry_to as string
  if ('strike_min' in params && params.strike_min !== undefined) p.strike_min = params.strike_min as number
  if ('strike_max' in params && params.strike_max !== undefined) p.strike_max = params.strike_max as number
  p.ltp_only = params.ltp_only ?? true
  return p
}

/**
 * Public fields the typeahead UI actually reads from the response. Sending this as
 * `?fields=` trims the payload at the source — both Meili's `attributesToRetrieve` and
 * the JSON wire size shrink. Anchor fields (id, canonicalSymbol, wsSubscribeUirId,
 * last_price, priceStatus, streamProvider) are returned regardless of this list.
 */
const DIRECT_SUGGEST_FIELDS = [
  'symbol',
  'name',
  'exchange',
  'segment',
  'instrumentType',
  'assetClass',
  'lotSize',
  'tickSize',
  'strike',
  'expiry',
  'optionType',
  'isDerivative',
  'underlyingSymbol',
  'vortexExchange',
].join(',')

/** BFF-relative base — always same-origin, no CORS issues. */
function bffBase(): string {
  return typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
}

/**
 * Direct upstream base — used when NEXT_PUBLIC_MARKETDATA_BASE_URL is set AND the
 * upstream serves CORS headers for the app's origin. The marketdata search-api
 * enables CORS for tradebazar.live + localhost dev origins (apps/search-api/src/main.ts),
 * so suggest/search/filters/stream all flow direct from the browser, skipping the
 * Next.js BFF hop and shaving ~50-100ms per request.
 */
const DIRECT_BASE: string | undefined =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_MARKETDATA_BASE_URL || undefined)
    : undefined

function buildURL(
  bffPath: string,
  directPath: string | null,
  qp: Record<string, string | number | boolean>,
  allowDirect: boolean,
): URL {
  const useDirect = allowDirect && !!DIRECT_BASE && directPath !== null
  const base = useDirect ? DIRECT_BASE! : bffBase()
  const path = useDirect ? directPath! : bffPath
  const url = new URL(path, base.replace(/\/$/, ''))
  Object.entries(qp).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  return url
}

/**
 * Suggest / typeahead.
 *
 * - Direct path (NEXT_PUBLIC_MARKETDATA_BASE_URL set): browser → upstream, public response
 *   only, payload trimmed via ?fields=. No broker tokens — normalizeItem falls back to UIR id.
 * - BFF fallback: browser → /api/milli-search/suggest → upstream with x-admin-token,
 *   so the response includes broker tokens for save flows that haven't migrated to UIR id.
 */
export async function suggest(params: MilliSuggestParams, signal?: AbortSignal): Promise<MilliInstrument[]> {
  const qp = withDefaults(params)
  const useDirect = !!DIRECT_BASE
  if (useDirect) qp.fields = DIRECT_SUGGEST_FIELDS
  const url = buildURL('/api/milli-search/suggest', '/api/search/suggest', qp, useDirect)
  const res = await fetch(url.toString(), { method: 'GET', credentials: 'omit', signal })
  const payload: any = await res.json().catch(() => ({}))
  const list: MilliInstrument[] = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data?.instruments)
      ? payload.data.instruments
      : Array.isArray(payload?.data)
        ? payload.data
        : []
  return list.map(normalizeItem)
}

/**
 * Full search (larger result set, used by admin / browse flows).
 * Same direct/BFF selection logic as suggest() — see that doc-comment for details.
 */
export async function search(params: MilliSearchParams): Promise<MilliInstrument[]> {
  const qp = withDefaults(params)
  const useDirect = !!DIRECT_BASE
  if (useDirect) qp.fields = DIRECT_SUGGEST_FIELDS
  const url = buildURL('/api/milli-search', '/api/search', qp, useDirect)
  const res = await fetch(url.toString(), { method: 'GET', credentials: 'omit' })
  const payload: any = await res.json().catch(() => ({}))
  const list: MilliInstrument[] = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data?.instruments)
      ? payload.data.instruments
      : Array.isArray(payload?.data)
        ? payload.data
        : []
  return list.map(normalizeItem)
}

/**
 * Filters: goes direct when NEXT_PUBLIC_MARKETDATA_BASE_URL is set (no auth needed).
 * Falls back to BFF otherwise.
 */
export async function filters(params: MilliFiltersParams): Promise<any> {
  const qp = withDefaults(params as MilliSearchParams)
  const url = buildURL('/api/milli-search/filters', '/api/search/filters', qp, true)
  const res = await fetch(url.toString(), { method: 'GET', credentials: 'omit' })
  const payload: any = await res.json().catch(() => ({}))
  return payload?.data ?? payload ?? {}
}

export async function telemetrySelection(body: {
  q: string
  symbol: string
  instrumentToken?: number | string
}): Promise<void> {
  try {
    const base = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    await fetch(`${base}/api/milli-search/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit',
    })
  } catch {
    // best-effort
  }
}

/**
 * SSE stream URL builder.
 * Goes direct to upstream when NEXT_PUBLIC_MARKETDATA_BASE_URL is set (no auth needed).
 * Falls back to BFF proxy (/api/milli-search/stream) otherwise.
 */
export function buildStreamURL(params: {
  /** UIR ids to subscribe to (preferred — provider-agnostic) */
  ids?: Array<number | string> | string
  /** Legacy alias for ids — treated as UIR ids by the upstream search-api */
  tokens?: Array<number | string> | string
  q?: string
  ltp_only?: boolean
}): string {
  const useDirect = !!DIRECT_BASE
  const base = useDirect
    ? DIRECT_BASE!.replace(/\/$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  const path = useDirect ? '/api/search/stream' : '/api/milli-search/stream'

  const url = new URL(path, base)
  const rawIds = params.ids ?? params.tokens
  if (rawIds) {
    const joined = Array.isArray(rawIds) ? rawIds.join(',') : String(rawIds)
    url.searchParams.set('ids', joined)
  }
  if (params.q) url.searchParams.set('q', params.q)
  url.searchParams.set('ltp_only', String(params.ltp_only ?? true))
  return url.toString()
}

export const milliClient = {
  suggest,
  search,
  filters,
  telemetrySelection,
  buildStreamURL,
}
