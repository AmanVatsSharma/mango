/**
 * File:        components/admin-console/user-activity-chart.tsx
 * Module:      admin-console · Dashboard Charts
 * Purpose:     7-day active vs new user bar chart card for the admin home dashboard
 *
 * Exports:
 *   - UserActivityChart() — self-contained card; fetches /api/admin/charts/activity?days=7
 *
 * Depends on:
 *   - @/components/ui/card — Card primitives
 *   - framer-motion — bar entrance animations
 *
 * Side-effects:
 *   - GET /api/admin/charts/activity?days=7 on mount; auto-refresh every 5 min
 *
 * Key invariants:
 *   - Falls back to mock data silently; "sample" pill shown in header
 *   - No console.log — logging suppressed per project rules
 *   - Bar height scales relative to the peak day, max 140px
 *
 * Read order:
 *   1. ActivityDataPoint — data shape
 *   2. UserActivityChart — component
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Users, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface ActivityDataPoint {
  day: string
  date: string
  active: number
  new: number
}

const MOCK_ACTIVITY_DATA: ActivityDataPoint[] = [
  { day: "Sun", date: "2026-04-19", active: 850, new: 45 },
  { day: "Mon", date: "2026-04-20", active: 920, new: 52 },
  { day: "Tue", date: "2026-04-21", active: 780, new: 38 },
  { day: "Wed", date: "2026-04-22", active: 1100, new: 67 },
  { day: "Thu", date: "2026-04-23", active: 1250, new: 78 },
  { day: "Fri", date: "2026-04-24", active: 980, new: 41 },
  { day: "Sat", date: "2026-04-25", active: 720, new: 29 },
]

const MAX_BAR_H = 140

export function UserActivityChart() {
  const [activityData, setActivityData] = useState<ActivityDataPoint[]>(MOCK_ACTIVITY_DATA)
  const [loading, setLoading] = useState(true)
  const [isSample, setIsSample] = useState(true)

  const fetchActivityData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/charts/activity?days=7").catch(() => null)
      if (response?.ok) {
        const data = await response.json()
        if (data.success && data.chartData?.length > 0) {
          setActivityData(data.chartData)
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
    fetchActivityData()
    const interval = setInterval(fetchActivityData, 300_000)
    return () => clearInterval(interval)
  }, [])

  const maxActive = Math.max(...activityData.map((d) => d.active), 1)
  const peakDay = activityData.reduce((best, d) => (d.active > best.active ? d : best), activityData[0])
  const avgActive = Math.round(activityData.reduce((s, d) => s + d.active, 0) / activityData.length)
  const totalNew = activityData.reduce((s, d) => s + d.new, 0)

  return (
    <Card className="bg-card border-border shadow-sm overflow-hidden">
      <CardHeader className="px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm font-semibold text-foreground">User Activity</p>
              {isSample && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500/80 font-medium">
                  sample
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Active vs new · 7 days</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Inline legend */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-primary/40" />
                Active
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-primary" />
                New
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchActivityData}
              disabled={loading}
              className="h-7 w-7 p-0 text-muted-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-5 pb-4">
        {/* Bar chart */}
        <div
          className="flex items-end gap-2"
          style={{ height: MAX_BAR_H + 32 }}
        >
          {activityData.map((data, index) => {
            const barH = Math.max((data.active / maxActive) * MAX_BAR_H, 4)
            const newH = Math.max((data.new / data.active) * barH, 2)
            const isPeak = data.day === peakDay?.day

            return (
              <div key={data.day} className="flex-1 flex flex-col items-center gap-1.5">
                {/* Peak label */}
                <div className="h-4 flex items-center justify-center">
                  {isPeak && (
                    <span className="text-[9px] font-bold text-primary">{data.active}</span>
                  )}
                </div>

                {/* Bar */}
                <div className="w-full relative" style={{ height: barH }}>
                  {/* Ghost (active) */}
                  <motion.div
                    className="absolute inset-0 bg-primary/20 rounded-t-sm"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ transformOrigin: "bottom" }}
                    transition={{ duration: 0.6, delay: index * 0.07 }}
                  />
                  {/* Solid cap (new users) */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm"
                    initial={{ height: 0 }}
                    animate={{ height: newH }}
                    transition={{ duration: 0.5, delay: index * 0.07 + 0.25 }}
                  />
                </div>

                {/* Day label */}
                <span className="text-[10px] text-muted-foreground">{data.day}</span>
              </div>
            )
          })}
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-border/50">
          <div>
            <p className="text-xs text-muted-foreground">Peak day</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {peakDay?.active.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">{peakDay?.day}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg active</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {avgActive.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">per day</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">New signups</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {totalNew.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">this week</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
