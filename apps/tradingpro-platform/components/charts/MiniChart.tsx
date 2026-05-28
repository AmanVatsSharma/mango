/**
 * @file MiniChart.tsx
 * @description Lightweight Charts mini area chart for watchlist items
 */

"use client"

import React, { useEffect, useRef, useState } from "react"
import { createChart, ColorType, CrosshairMode } from "lightweight-charts"
import { cn } from "@/lib/utils"

interface MiniChartProps {
  symbol: string
  currentPrice: number
  previousClose: number
  height?: number
  className?: string
  data?: Array<{
    time: number
    value: number
  }>
}

export function MiniChart({ symbol, currentPrice, previousClose, height = 80, className, data }: MiniChartProps) {
  // Container and series refs
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Derived values
  const isPositive = currentPrice >= previousClose
  const changePercent = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0

  // Generate mock intraday data when no external data provided
  const generateMockData = () => {
    try {
      const points: Array<{ time: number; value: number }> = []
      const baseTime = new Date()
      baseTime.setHours(9, 15, 0, 0) // Market open time (IST typical)

      let price = Math.max(previousClose, 0.01)
      const volatility = 0.02 // 2% volatility over the day
      const trend = previousClose > 0 ? (currentPrice - previousClose) / previousClose : 0

      for (let i = 0; i < 375; i++) { // ~375 minutes in a trading day
        const time = new Date(baseTime.getTime() + i * 60000)
        const change = (Math.random() - 0.5) * volatility + trend / 375
        price = price * (1 + change)
        points.push({ time: Math.floor(time.getTime() / 1000), value: price })
      }

      // Ensure last value matches current price for visual accuracy
      if (points.length > 0) points[points.length - 1].value = currentPrice
      return points
    } catch (err) {
      console.error("[MiniChart] generateMockData error", err)
      return []
    }
  }

  // Create chart and series
  useEffect(() => {
    console.debug("[MiniChart] init", { symbol, currentPrice, previousClose, height })
    const container = chartContainerRef.current
    if (!container) {
      console.error("[MiniChart] container ref is null")
      return
    }

    setIsLoading(true)
    try {
      const chart = createChart(container, {
        width: container.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#6B7280",
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        crosshair: { mode: CrosshairMode.Hidden },
        rightPriceScale: { visible: false, mode: 1 },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, fixLeftEdge: true, fixRightEdge: true },
      })

      const areaSeries = chart.addAreaSeries({
        lineColor: isPositive ? "#10B981" : "#EF4444",
        topColor: isPositive ? "#10B98120" : "#EF444420",
        bottomColor: "transparent",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })

      const seriesData = data && data.length > 0 ? data : generateMockData()
      areaSeries.setData(seriesData as any)

      chart.timeScale().fitContent()
      chartRef.current = chart
      seriesRef.current = areaSeries
      console.debug("[MiniChart] chart created", { points: seriesData.length })
    } catch (err) {
      console.error("[MiniChart] chart creation failed", err)
    } finally {
      setIsLoading(false)
    }

    // Observe container resize for responsive width
    try {
      if (typeof ResizeObserver !== "undefined" && chartContainerRef.current) {
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (!entry) return
          const width = Math.floor(entry.contentRect.width)
          if (width > 0 && chartRef.current) {
            chartRef.current.applyOptions({ width })
            console.debug("[MiniChart] resizeObserver", { width })
          }
        })
        ro.observe(chartContainerRef.current)
        resizeObserverRef.current = ro
      }
    } catch (err) {
      console.warn("[MiniChart] ResizeObserver not available", err)
    }
    return () => {
      if (resizeObserverRef.current && chartContainerRef.current) {
        try {
          resizeObserverRef.current.unobserve(chartContainerRef.current)
          resizeObserverRef.current.disconnect()
        } catch {}
        resizeObserverRef.current = null
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        seriesRef.current = null
        console.debug("[MiniChart] cleanup")
      }
    }
  }, [symbol, currentPrice, previousClose, height, isPositive])

  // Update series data when inputs change
  useEffect(() => {
    if (!seriesRef.current) return
    try {
      const seriesData = data && data.length > 0 ? data : generateMockData()
      seriesRef.current.setData(seriesData as any)
      chartRef.current?.timeScale().fitContent()
      console.debug("[MiniChart] data updated", { points: seriesData.length })
    } catch (err) {
      console.error("[MiniChart] setData failed", err)
    }
  }, [symbol, currentPrice, previousClose, data])

  if (isLoading) {
    // Fallback sparkline using mock data so UI isn't blank while initializing chart
    const fallback = generateMockData()
    const values = fallback.map(p => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(max - min, 1e-6)
    const w = 300
    const h = height
    const path = fallback
      .map((p, i) => {
        const x = (i / Math.max(fallback.length - 1, 1)) * w
        const y = h - ((p.value - min) / range) * (h - 4) - 2
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

    return (
      <div className={cn("relative", className)} style={{ height }}>
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <path d={path} fill="none" stroke={isPositive ? '#10B981' : '#EF4444'} strokeWidth="2" opacity="0.8" />
        </svg>
        <div className="absolute top-2 left-2 text-xs font-medium">
          <span className={cn("font-mono", isPositive ? "text-green-600" : "text-red-600")}>
            {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
          </span>
        </div>
         <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      <div ref={chartContainerRef} style={{ height }} />
      <div className="absolute top-2 left-2 text-xs font-medium">
        <span className={cn("font-mono", isPositive ? "text-green-600" : "text-red-600")}> 
          {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}
