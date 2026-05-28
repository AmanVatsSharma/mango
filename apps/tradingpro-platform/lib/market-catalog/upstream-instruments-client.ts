/**
 * @file upstream-instruments-client.ts
 * @module lib/market-catalog
 * @description Server-only direct fetcher for the Vedpragya /api/stock/vayu/instruments endpoint.
 *              Used by the catalog resolver to expand options-chain recipes without going through
 *              the internal /api/market-data/options proxy (saves an HTTP loopback and avoids
 *              auth complications when running inside server-side resolvers).
 *
 *              IMPORTANT: this module reads MARKET_DATA_API_KEY from the environment. It MUST
 *              never be imported into client bundles. The catalog resolver is the only intended
 *              caller; route handlers should call the resolver, not this module directly.
 *
 * Exports:
 *   - fetchInstruments(query)               — fetches a list with filter params
 *   - fetchUnderlyingLtp(symbol)            — best-effort spot LTP for an underlying
 *   - UpstreamInstrument                    — TS shape of a returned instrument
 *
 * Side-effects:
 *   - Outbound HTTPS fetch to MARKET_DATA_API_URL with x-api-key header.
 *
 * Key invariants:
 *   - Server-only — guarded by `if (typeof window !== "undefined")` short-circuit.
 *   - 10s request timeout via AbortSignal — never blocks the event loop indefinitely.
 *   - All network errors are swallowed at the call site; the fns return [] / null on failure.
 *
 * Read order:
 *   1. fetchInstruments — main entry point.
 *   2. fetchUnderlyingLtp — convenience helper used to derive ATM strike.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

import "server-only"

const BASE_URL = process.env.MARKET_DATA_API_URL || "https://marketdata.vedpragya.com"
const API_KEY = process.env.MARKET_DATA_API_KEY || "marketpulse-key-1"

export interface UpstreamInstrument {
  token?: number
  instrumentToken?: number
  id?: number
  uirId?: number
  symbol: string
  name?: string
  exchange?: string
  segment?: string
  instrument_type?: string
  expiry?: string
  expiry_date?: string
  strike?: number
  strike_price?: number
  option_type?: "CE" | "PE"
  optionType?: "CE" | "PE"
  lot_size?: number
  lotSize?: number
  last_price?: number
  ltp?: number
}

export interface FetchInstrumentsParams {
  q: string
  expiry_from?: string
  expiry_to?: string
  strike_min?: number
  strike_max?: number
  limit?: number
  offset?: number
  ltp_only?: boolean
  is_active?: boolean
}

const DEFAULT_LIMIT = 200
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Fetch instruments from Vedpragya. Returns [] on any error (caller must tolerate empty).
 * Defaults: ltp_only=true, is_active=true, limit=200 — tuned for catalog resolution where
 * we want enough rows to span an ATM±N window for a single expiry.
 */
export async function fetchInstruments(params: FetchInstrumentsParams): Promise<UpstreamInstrument[]> {
  if (typeof window !== "undefined") return []
  const qs = new URLSearchParams()
  qs.set("q", params.q)
  qs.set("ltp_only", String(params.ltp_only ?? true))
  qs.set("is_active", String(params.is_active ?? true))
  qs.set("limit", String(params.limit ?? DEFAULT_LIMIT))
  qs.set("offset", String(params.offset ?? 0))
  if (params.expiry_from) qs.set("expiry_from", params.expiry_from)
  if (params.expiry_to) qs.set("expiry_to", params.expiry_to)
  if (params.strike_min !== undefined) qs.set("strike_min", String(params.strike_min))
  if (params.strike_max !== undefined) qs.set("strike_max", String(params.strike_max))

  const url = `${BASE_URL}/api/stock/vayu/instruments?${qs.toString()}`
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => null)
    const list = body?.data?.instruments
    return Array.isArray(list) ? (list as UpstreamInstrument[]) : []
  } catch {
    return []
  }
}

/**
 * Best-effort spot LTP for an index/equity underlying. Returns null on any failure;
 * the resolver then falls back to the strike midpoint of the available rows.
 */
export async function fetchUnderlyingLtp(symbol: string): Promise<number | null> {
  if (typeof window !== "undefined") return null
  const items = await fetchInstruments({ q: symbol, limit: 5, ltp_only: true })
  if (items.length === 0) return null
  const exact = items.find((i) => (i.symbol || "").toUpperCase() === symbol.toUpperCase())
  const pick = exact ?? items[0]
  const ltp = pick.last_price ?? pick.ltp
  return typeof ltp === "number" && ltp > 0 ? ltp : null
}
