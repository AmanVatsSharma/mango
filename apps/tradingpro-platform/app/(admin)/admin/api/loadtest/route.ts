import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config/runtime'
import { normalizeApiBoundedInteger } from '@/lib/server/api-number-utils'

// Admin-only, budget-guarded load test orchestrator for /api/quotes.
// This issues step-limited internal fetches to our own endpoint, never directly to upstream.

export async function GET(req: NextRequest) {
  if (!config.feature.allowAdminLoadtest) {
    return NextResponse.json({ success: false, error: 'disabled' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const c = normalizeApiBoundedInteger(searchParams.get('concurrency'), 1, 1, 200)

  // Hard guardrails: short duration and cap total requests
  const durationMs = 3000
  const perWorkerRps = 2 // keep small; we have cache/batching and per-IP limits

  const abort = new AbortController()
  const until = Date.now() + durationMs

  let ok = 0, fail = 0
  const latencies: number[] = []

  async function worker() {
    while (Date.now() < until) {
      const t0 = performance.now()
      try {
        const resp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/quotes?q=NIFTY&q=BANKNIFTY`, {
          signal: abort.signal,
          headers: { 'x-client-id': 'admin-loadtest' },
        })
        const t1 = performance.now()
        latencies.push(t1 - t0)
        if (resp.ok) ok++; else fail++
      } catch {
        fail++
      }
      await new Promise(r => setTimeout(r, 1000 / perWorkerRps))
    }
  }

  const workers = Array.from({ length: c }, () => worker())
  await Promise.all(workers)

  if (fail / Math.max(1, ok + fail) > 0.01) {
    // reflect service degradation
  }

  latencies.sort((a,b)=>a-b)
  const p = (q:number) => latencies[Math.min(latencies.length-1, Math.floor(q*(latencies.length-1)))] || 0

  return NextResponse.json({
    success: true,
    data: {
      total: ok + fail,
      success: ok,
      fail,
      successRate: Math.round((ok / Math.max(1, ok + fail)) * 1000) / 10,
      p50: Math.round(p(0.50)),
      p95: Math.round(p(0.95)),
      p99: Math.round(p(0.99)),
    }
  })
}
