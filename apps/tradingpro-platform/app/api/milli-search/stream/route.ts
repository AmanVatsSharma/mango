/**
 * File:        app/api/milli-search/stream/route.ts
 * Module:      API · Search Proxy · SSE Stream
 * Purpose:     SSE proxy for the marketdata LTP stream. Forwards UIR ids so the upstream
 *              can push live price ticks keyed by UIR id. Handles client disconnects cleanly
 *              to avoid orphaned upstream connections.
 *
 * Exports:
 *   - GET(request) → NextResponse (text/event-stream)  — streams LTP ticks
 *
 * Depends on:
 *   - MARKETDATA_BASE_URL — market-data service base URL (server-side)
 *
 * Side-effects:
 *   - Long-lived outbound HTTP connection to marketdata.vedpragya.com SSE endpoint.
 *     Aborted when the client disconnects or the stream closes.
 *
 * Key invariants:
 *   - Upstream sends: event:ltp  data:{"quotes":{"<uirId>":{"last_price":N}},"ts":"..."}
 *   - ltp_only=true injected by default — only instruments with live prices are included
 *   - Accepts both ?ids= and legacy ?tokens= (search-api treats both as UIR ids)
 *   - ReadableStream.cancel() aborts the upstream connection when the browser disconnects
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-04
 */

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const BASE = (process.env.MARKETDATA_BASE_URL || 'https://marketdata.vedpragya.com').replace(/\/$/, '')

export async function GET(request: NextRequest) {
  const upstreamAbort = new AbortController()

  // Forward client disconnect to the upstream connection
  request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true })

  let upstream: Response
  try {
    const { searchParams } = new URL(request.url)
    const target = new URL(`${BASE}/api/search/stream`)
    searchParams.forEach((v, k) => target.searchParams.set(k, v))
    if (!target.searchParams.has('ltp_only')) target.searchParams.set('ltp_only', 'true')

    upstream = await fetch(target.toString(), {
      method: 'GET',
      signal: upstreamAbort.signal,
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return new NextResponse(null, { status: 499 })
    }
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 })
  }

  const reader = upstream.body.getReader()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          if (upstreamAbort.signal.aborted) {
            controller.close()
            return
          }
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          controller.enqueue(value)
        }
      } catch {
        controller.close()
      }
    },
    cancel() {
      upstreamAbort.abort()
      reader.cancel().catch(() => {})
    },
  })

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
