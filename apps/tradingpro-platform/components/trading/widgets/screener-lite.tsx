/**
 * File:        components/trading/widgets/screener-lite.tsx
 * Module:      Trading · Widgets · Screener Lite
 * Purpose:     Lightweight in-app stock search/screener. Pre-fix the LTP and
 *              changePercent columns rendered the catalog snapshot the search
 *              backend returned at query time — could be minutes or hours
 *              stale. Now overlays the live WebSocket quote (via the dashboard
 *              market-data provider) on top of the snapshot when a tick has
 *              landed for the result's token.
 *
 * Exports:
 *   - ScreenerLite — React FC, optional `placeholder` prop
 *
 * Depends on:
 *   - @/lib/hooks/use-trading-data            — searchStocks (catalog query)
 *   - @/lib/market-data/providers/...         — useMarketDataLive / Stable
 *   - @/components/trading/widgets/market-widget-number-utils — row normalizer
 *
 * Side-effects:
 *   - Subscribes to result tokens via the provider on each search; unsubscribes
 *     on query change / unmount. Subscriptions piggyback on the dashboard's
 *     existing socket — no new connection.
 *
 * Key invariants:
 *   - Subscriptions are scoped: when the query changes or the widget unmounts,
 *     the previous result tokens are unsubscribed before/instead of leaking.
 *   - Live LTP wins over catalog LTP when present; catalog LTP is the fallback
 *     until the first live tick arrives (1-3s typical) — never blank.
 *   - Mode is 'ltp' (cheapest tick payload) since the screener row only renders
 *     last_trade_price + prev_close-derived change%.
 *
 * Read order:
 *   1. ScreenerLite — top-level component
 *   2. resolveLiveLtp — quote-map lookup with token-key + instrumentId fallback
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-d9s: replace static catalog LTP with live WebSocket overlay.
 */

"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { searchStocks } from "@/lib/hooks/use-trading-data"
import {
  normalizeScreenerChangePercentForBadge,
  normalizeScreenerWidgetRows,
  type ScreenerWidgetRow,
} from "@/components/trading/widgets/market-widget-number-utils"
import {
  useMarketDataLive,
  useMarketDataStable,
} from "@/lib/market-data/providers/WebSocketMarketDataProvider"

type ScreenerLiteProps = {
  placeholder?: string
}

const SUBSCRIBE_MODE = "ltp" as const

export function ScreenerLite({ placeholder = "Search stocks (e.g. RELIANCE, TCS)..." }: ScreenerLiteProps) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<ScreenerWidgetRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { quotes } = useMarketDataLive()
  const { subscribe, unsubscribe } = useMarketDataStable()

  // Track the tokens we currently have subscribed so we can unsubscribe
  // exactly that set on the next query (or on unmount). Storing in a ref
  // — not state — to avoid re-firing the search effect on every change.
  const subscribedTokensRef = useRef<number[]>([])

  // Search effect — debounced, with cancellation
  useEffect(() => {
    let cancelled = false
    const q = query.trim()
    if (q.length < 2) {
      setRows([])
      setError(null)
      return
    }

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result: any[] = await searchStocks(q)
        if (cancelled) return
        setRows(normalizeScreenerWidgetRows(result))
      } catch (e: any) {
        console.error("[ScreenerLite] search failed", e)
        if (!cancelled) setError(e?.message || "Search failed")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    const t = setTimeout(run, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  // Live-overlay subscription effect — runs whenever the result set changes.
  // Subscribes to the new set of tokens and unsubscribes any tokens that
  // dropped out (also runs the full unsubscribe on unmount).
  useEffect(() => {
    const newTokens = rows
      .map((r) => r.token)
      .filter((t): t is number => typeof t === "number" && t > 0)

    const newSet = new Set(newTokens)
    const oldTokens = subscribedTokensRef.current
    const oldSet = new Set(oldTokens)

    const toAdd = newTokens.filter((t) => !oldSet.has(t))
    const toRemove = oldTokens.filter((t) => !newSet.has(t))

    if (toAdd.length > 0) {
      try {
        subscribe(toAdd, SUBSCRIBE_MODE)
      } catch (e) {
        console.warn("[ScreenerLite] subscribe failed", e)
      }
    }
    if (toRemove.length > 0) {
      try {
        unsubscribe(toRemove, SUBSCRIBE_MODE)
      } catch (e) {
        console.warn("[ScreenerLite] unsubscribe failed", e)
      }
    }

    subscribedTokensRef.current = newTokens
  }, [rows, subscribe, unsubscribe])

  // Final cleanup on unmount: unsubscribe any tokens still in flight.
  useEffect(() => {
    return () => {
      const tokens = subscribedTokensRef.current
      if (tokens.length === 0) return
      try {
        unsubscribe(tokens, SUBSCRIBE_MODE)
      } catch {
        // best-effort cleanup
      }
      subscribedTokensRef.current = []
    }
  }, [unsubscribe])

  // Render rows — overlay live LTP when available, else fall back to catalog.
  const decoratedRows = useMemo(
    () =>
      rows.slice(0, 8).map((r) => {
        const live = resolveLiveLtp(quotes, r.token)
        const ltp = live ?? r.catalogLtp ?? r.ltp ?? null
        return { ...r, ltp: ltp ?? undefined, isLive: live !== null }
      }),
    [rows, quotes],
  )

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Screener</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
        {error && <div className="text-xs text-red-600">{error}</div>}
        {isLoading && <div className="text-xs text-muted-foreground">Searching…</div>}
        {!isLoading && rows.length === 0 && query.trim().length >= 2 && !error && (
          <div className="text-xs text-muted-foreground">No results.</div>
        )}
        {decoratedRows.length > 0 && (
          <div className="divide-y divide-border/50 rounded-lg border border-border/50 overflow-hidden lg:max-h-[360px] lg:overflow-y-auto scrollbar-mini">
            {decoratedRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    <span className="truncate">{r.symbol}</span>
                    {r.isLive && (
                      <span
                        className="text-[9px] uppercase tracking-wider font-bold text-green-600 dark:text-green-400 bg-green-500/10 px-1 py-px rounded leading-none"
                        title="Live tick from WebSocket"
                      >
                        ●&nbsp;LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold tabular-nums">
                    {typeof r.ltp === "number" ? `₹${r.ltp.toFixed(2)}` : "—"}
                  </div>
                  <div
                    className={`text-[10px] font-semibold ${
                      normalizeScreenerChangePercentForBadge(r.changePercent) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {typeof r.changePercent === "number"
                      ? `${r.changePercent >= 0 ? "+" : ""}${r.changePercent.toFixed(2)}%`
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Look up the live LTP for a token in the quotes map. The provider keys the
 * map by token (number → string), so a numeric lookup just works. Returns
 * null when no live tick has landed yet — caller falls back to catalog LTP.
 */
function resolveLiveLtp(
  quotes: Record<string, { last_trade_price?: number; display_price?: number; actual_price?: number }> | null | undefined,
  token: number | null,
): number | null {
  if (!quotes || token == null) return null
  const quote = quotes[String(token)]
  if (!quote) return null
  const ltp = quote.last_trade_price ?? quote.display_price ?? quote.actual_price
  return typeof ltp === "number" && Number.isFinite(ltp) && ltp > 0 ? ltp : null
}
