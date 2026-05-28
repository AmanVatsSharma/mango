/**
 * File:        components/admin-console/trading-chart.tsx
 * Module:      admin-console · Dashboard Charts
 * Purpose:     7-day trading price + volume sparkline card for the admin home dashboard
 *
 * Exports:
 *   - TradingChart() — self-contained card; fetches /api/admin/charts/trading?days=7
 *
 * Depends on:
 *   - @/components/ui/card — Card primitives
 *   - framer-motion — path + circle entrance animations
 *
 * Side-effects:
 *   - GET /api/admin/charts/trading?days=7 on mount; auto-refresh every 5 min
 *
 * Key invariants:
 *   - Falls back to mock data silently; "sample" pill shown in header, NOT below chart
 *   - No console.log — logging suppressed per project rules
 *   - Colors use CSS custom properties (hsl(var(--primary))) to respect theme, not hardcoded hex
 *
 * Read order:
 *   1. ChartDataPoint — data shape
 *   2. formatVol — utility
 *   3. TradingChart — component
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface ChartDataPoint {
  time: string
  date: string
  price: number
  volume: number
}

const MOCK_CHART_DATA: ChartDataPoint[] = [
  { time: "Apr 19", date: "2026-04-19", price: 45230, volume: 1200 },
  { time: "Apr 20", date: "2026-04-20", price: 46150, volume: 1450 },
  { time: "Apr 21", date: "2026-04-21", price: 44890, volume: 1680 },
  { time: "Apr 22", date: "2026-04-22", price: 47320, volume: 2100 },
  { time: "Apr 23", date: "2026-04-23", price: 48750, volume: 1890 },
  { time: "Apr 24", date: "2026-04-24", price: 49200, volume: 1560 },
  { time: "Apr 25", date: "2026-04-25", price: 50100, volume: 1340 },
]

function formatVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function TradingChart() {
  const [chartData, setChartData] = useState<ChartDataPoint[]>(MOCK_CHART_DATA)
  const [loading, setLoading] = useState(true)
  const [isSample, setIsSample] = useState(true)

  const fetchChartData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/charts/trading?days=7").catch(() => null)
      if (response?.ok) {
        const data = await response.json()
        if (data.success && data.chartData?.length > 0) {
          setChartData(data.chartData)
          setIsSample(false)
        } else {
          setIsSample(true)
        }
      } else {
        setIsSample(true)
      }
    } catch {
      setIsSample(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChartData()
    const interval = setInterval(fetchChartData, 300_000)
    return () => clearInterval(interval)
  }, [])

  const maxPrice = Math.max(...chartData.map((d) => d.price), 1)
  const minPrice = Math.min(...chartData.map((d) => d.price))
  const priceRange = maxPrice - minPrice || 1

  const currentPrice = chartData[chartData.length - 1]?.price ?? 0
  const previousPrice = chartData[chartData.length - 2]?.price ?? currentPrice
  const priceChange = currentPrice - previousPrice
  const priceChangePct = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0
  const totalVolume = chartData.reduce((sum, d) => sum + d.volume, 0)

  const CHART_H = 160
  const CHART_W = 100
  const pad = 8

  const yOf = (price: number) =>
    pad + ((maxPrice - price) / priceRange) * (CHART_H - pad * 2)

  const pathPoints = chartData
    .map((d, i) => {
      const x = (i / (chartData.length - 1)) * CHART_W
      const y = yOf(d.price)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    })
    .join(" ")

  const areaPath =
    pathPoints +
    ` L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`

  const lastX = CHART_W
  const lastY = yOf(currentPrice)

  const isUp = priceChange >= 0

  return (
    <Card className="bg-card border-border shadow-sm overflow-hidden">
      <CardHeader className="px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm font-semibold text-foreground">Trading Volume</p>
              {isSample && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500/80 font-medium">
                  sample
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">7-day price movement</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1 text-sm font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp
                ? <TrendingUp className="h-3.5 w-3.5" />
                : <TrendingDown className="h-3.5 w-3.5" />}
              {isUp ? "+" : ""}{priceChangePct.toFixed(2)}%
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchChartData}
              disabled={loading}
              className="h-7 w-7 p-0 text-muted-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-5 pb-4">
        {/* SVG chart */}
        <div className="relative h-40 sm:h-48 w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <linearGradient id="tradingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
              {/* Subtle horizontal grid lines */}
              {[0.25, 0.5, 0.75].map((frac) => (
                <line
                  key={frac}
                  x1="0" y1={frac * CHART_H}
                  x2={CHART_W} y2={frac * CHART_H}
                  stroke="currentColor"
                  strokeOpacity="0.06"
                  strokeWidth="0.5"
                  className="text-foreground"
                />
              ))}
            </defs>

            {/* Area fill */}
            <motion.path
              d={areaPath}
              fill="url(#tradingGradient)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />

            {/* Price line */}
            <motion.path
              d={pathPoints}
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />

            {/* Endpoint dot */}
            <motion.circle
              cx={lastX}
              cy={lastY}
              r="2.5"
              fill="hsl(var(--primary))"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: 1.0 }}
            />
          </svg>

          {/* Y-axis labels — absolute positioned over the SVG */}
          <div className="absolute top-0 right-0 bottom-0 flex flex-col justify-between pointer-events-none pr-1">
            <span className="text-[9px] text-muted-foreground/60 tabular-nums leading-none">
              ₹{maxPrice.toLocaleString("en-IN")}
            </span>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums leading-none">
              ₹{Math.round((maxPrice + minPrice) / 2).toLocaleString("en-IN")}
            </span>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums leading-none">
              ₹{minPrice.toLocaleString("en-IN")}
            </span>
          </div>

          {/* X-axis labels — only even indexes */}
          <div className="absolute bottom-0 left-0 right-12 flex justify-between pointer-events-none">
            {chartData.filter((_, i) => i % 2 === 0).map((d) => (
              <span key={d.date} className="text-[9px] text-muted-foreground/60 truncate">
                {d.time}
              </span>
            ))}
          </div>
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-border/50">
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              ₹{currentPrice.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Change</p>
            <p className={`text-lg sm:text-xl font-bold tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{priceChangePct.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Volume</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {formatVol(totalVolume)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
