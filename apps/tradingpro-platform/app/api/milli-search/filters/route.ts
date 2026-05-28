/**
 * File:        app/api/milli-search/filters/route.ts
 * Module:      API · Search Proxy · Filters
 * Purpose:     Server-side proxy for the marketdata filters (facets) endpoint.
 *
 * Exports:
 *   - GET(request) → NextResponse  — proxies to /api/search/filters
 *
 * Depends on:
 *   - MARKETDATA_BASE_URL — market-data service base URL (server-side)
 *
 * Side-effects:
 *   - Outbound HTTP GET to marketdata.vedpragya.com
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-04
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const BASE = (process.env.MARKETDATA_BASE_URL || 'https://marketdata.vedpragya.com').replace(/\/$/, '')

export async function GET(request: NextRequest) {
  try {
    const src = request.nextUrl
    const target = new URL(`${BASE}/api/search/filters`)
    src.searchParams.forEach((v, k) => target.searchParams.set(k, v))

    const res = await fetch(target.toString(), { method: 'GET', cache: 'no-store' })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Proxy error' }, { status: 500 })
  }
}
