/**
 * File:        components/marketing/ticker-tape.tsx
 * Module:      Marketing · Ticker Tape
 * Purpose:     Scrolling marquee displaying live prices for configured ticker symbols via SSE stream.
 *
 * Exports:
 *   - TickerTape(props) — marquee with live price/change data
 *
 * Props:
 *   - symbols: string[]   — e.g. ["NSE:RELIANCE", "BSE:500325"]; empty array hides component
 *
 * Depends on:
 *   - /api/milli-search/stream SSE endpoint for live LTP data
 *   - Native EventSource (no shared SSE manager — independent stream per ticker instance)
 *
 * Side-effects:
 *   - Opens its own EventSource to /api/milli-search/stream; closed on unmount
 *   - No SSR — renders nothing on server
 *
 * Key invariants:
 *   - Symbols with no live data still render with "--" price; no blank gaps
 *   - Animation pauses on hover for accessibility
 *
 * Read order:
 *   1. useTickerPrices — SSE subscription + price state
 *   2. TickerTape — marquee layout
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-16
 */

"use client"

import React, { useEffect, useRef, useState } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"

interface TickerData {
  symbol: string
  price: number
  change: number
  changePercent: number
}

interface TickerTapeProps {
  symbols: string[]
}

/** Stable internal state so prices persist across re-renders */
interface PriceMap {
  [symbol: string]: TickerData
}

function useTickerPrices(symbols: string[]): PriceMap {
  const [prices, setPrices] = useState<PriceMap>(() => {
    const initial: PriceMap = {}
    for (const sym of symbols) {
      initial[sym] = { symbol: sym, price: 0, change: 0, changePercent: 0 }
    }
    return initial
  })

  const symbolsRef = useRef(symbols)
  const pricesRef = useRef(prices)

  // Keep refs current without triggering re-renders from SSE messages
  useEffect(() => {
    symbolsRef.current = symbols
    const next: PriceMap = {}
    for (const sym of symbols) {
      next[sym] = pricesRef.current[sym] ?? { symbol: sym, price: 0, change: 0, changePercent: 0 }
    }
    pricesRef.current = next
  }, [symbols])

  useEffect(() => {
    if (symbols.length === 0) return

    // Guard against SSR
    if (typeof window === "undefined") return

    const ids = symbols.join(",")
    const url = `/api/milli-search/stream?ids=${encodeURIComponent(ids)}`

    const es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        // Upstream sends: { quotes: { "<uirId>": { last_price, change, changePercent } } }
        // Or: { quotes: { "<symbol>": { last_price, ... } } } — normalize both shapes
        const quotes = parsed?.quotes ?? {}
        if (typeof quotes !== "object") return

        const next: PriceMap = { ...pricesRef.current }
        let hasUpdate = false

        for (const sym of symbolsRef.current) {
          // Try exact match first, then case-insensitive fallback
          let quote = quotes[sym] ?? Object.entries(quotes).find(([k]) => k.toUpperCase() === sym.toUpperCase())?.[1]
          if (quote) {
            const price = Number(quote.last_price) || 0
            const change = Number(quote.change) || 0
            const changePercent = Number(quote.changePercent) || 0
            if (next[sym]) {
              next[sym] = { ...next[sym], price, change, changePercent }
            } else {
              next[sym] = { symbol: sym, price, change, changePercent }
            }
            hasUpdate = true
          }
        }

        if (hasUpdate) {
          pricesRef.current = next
          setPrices(next)
        }
      } catch {
        // Silently ignore parse errors — don't break the stream
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects; no manual retry needed
    }

    return () => {
      es.close()
    }
  }, []) // Empty deps — symbols come via symbolsRef

  return prices
}

export function TickerTape({ symbols }: TickerTapeProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || symbols.length === 0) {
    return null
  }

  const prices = useTickerPrices(symbols)

  return (
    <div
      className="overflow-hidden bg-slate-900/80 border-b border-slate-700/50"
      aria-label="Live market ticker"
      role="marquee"
    >
      <div className="ticker-scroll flex items-center py-2 px-4 gap-6 whitespace-nowrap">
        {/* Duplicate content for seamless loop */}
        {[...symbols, ...symbols].map((sym, i) => {
          const data = prices[sym]
          const isPositive = (data?.changePercent ?? 0) >= 0

          return (
            <span key={`${sym}-${i}`} className="flex items-center gap-1.5 text-xs font-medium shrink-0">
              <span className="text-slate-400">{sym.split(":").pop()}</span>
              <span className="text-white font-semibold tabular-nums">
                {data?.price ? data.price.toFixed(2) : "--"}
              </span>
              {data?.price ? (
                <span className={`flex items-center gap-0.5 ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span className="tabular-nums">
                    {isPositive ? "+" : ""}{data.changePercent.toFixed(2)}%
                  </span>
                </span>
              ) : (
                <span className="text-slate-500 tabular-nums">--</span>
              )}
            </span>
          )
        })}
      </div>

      <style jsx>{`
        .ticker-scroll {
          animation: ticker-scroll 40s linear infinite;
        }
        .ticker-scroll:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}