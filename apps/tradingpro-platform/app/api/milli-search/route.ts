/**
 * File:        app/api/milli-search/route.ts
 * Module:      API · Search Proxy
 * Purpose:     Server-side proxy for the marketdata search endpoint, adding the admin
 *              token so the response includes broker tokens (vortexToken/kiteToken) needed
 *              for watchlist saves and real-time WS subscriptions.
 *
 * Exports:
 *   - GET(request) → NextResponse  — proxies to /api/search with auth + ?include=internal
 *
 * Depends on:
 *   - MARKETDATA_BASE_URL   — market-data service base URL (server-side)
 *   - MARKETDATA_ADMIN_TOKEN — shared admin token for ?include=internal
 *
 * Side-effects:
 *   - Outbound HTTP GET to marketdata.vedpragya.com (10 s timeout, client-abort forwarded)
 *
 * Key invariants:
 *   - ltp_only=true is injected by default so only live instruments are returned
 *   - ?include=internal is added only when MARKETDATA_ADMIN_TOKEN is set
 *   - Admin token never reaches the browser — server-side only
 *   - Client disconnect aborts the upstream fetch so no dangling server connections
 *   - 10-second timeout returns 504 rather than hanging indefinitely
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-04
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const BASE = (process.env.MARKETDATA_BASE_URL || 'https://marketdata.vedpragya.com').replace(/\/$/, '')
const ADMIN_TOKEN = process.env.MARKETDATA_ADMIN_TOKEN || ''
const TIMEOUT_MS = 10_000

export async function GET(request: NextRequest) {
  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort(), TIMEOUT_MS)

  request.signal.addEventListener('abort', () => abort.abort(), { once: true })

  try {
    const src = request.nextUrl
    const target = new URL(`${BASE}/api/search`)
    src.searchParams.forEach((v, k) => target.searchParams.set(k, v))
    if (!target.searchParams.has('ltp_only')) target.searchParams.set('ltp_only', 'true')
    if (ADMIN_TOKEN) target.searchParams.set('include', 'internal')

    const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
    if (ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN

    const res = await fetch(target.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: abort.signal,
    })

    clearTimeout(timeoutId)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out or was cancelled' }, { status: 504 })
    }
    return NextResponse.json({ error: error?.message || 'Proxy error' }, { status: 500 })
  }
}
