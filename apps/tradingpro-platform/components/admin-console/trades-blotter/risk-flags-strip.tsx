"use client"

/**
 * @file risk-flags-strip.tsx
 * @module admin-console/trades-blotter
 * @description Scrollable list of actionable alerts (margin >90%, SL breaches, top losers, pending approvals).
 *              Each flag is clickable — user target opens the user's tab, symbol opens a symbol tab, route navigates.
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Clock, ShieldAlert, TrendingDown } from "lucide-react"
import type { RiskFlag, RiskFlagsResponse } from "@/app/api/admin/trades/types"

function iconForKind(kind: RiskFlag["kind"]) {
  switch (kind) {
    case "MARGIN_HIGH":
      return <ShieldAlert className="w-3.5 h-3.5" />
    case "SL_BREACH_PENDING":
    case "TARGET_HIT_PENDING":
      return <AlertTriangle className="w-3.5 h-3.5" />
    case "TOP_LOSER":
      return <TrendingDown className="w-3.5 h-3.5" />
    case "APPROVAL_PENDING":
      return <Clock className="w-3.5 h-3.5" />
  }
}

function severityClass(severity: RiskFlag["severity"]) {
  if (severity === "critical") return "bg-rose-500/10 text-rose-600 border-rose-500/30"
  if (severity === "warn") return "bg-amber-500/10 text-amber-600 border-amber-500/30"
  return "bg-sky-500/10 text-sky-600 border-sky-500/30"
}

export function RiskFlagsStrip({
  onUserClick,
  onSymbolClick,
  pausedAutoRefresh,
}: {
  onUserClick: (userId: string, clientId: string | null, name: string | null) => void
  onSymbolClick: (symbol: string, segment: string | null) => void
  pausedAutoRefresh?: boolean
}) {
  const [flags, setFlags] = useState<RiskFlag[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/trades/risk-flags")
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data: RiskFlagsResponse = await res.json()
      setFlags(data.flags || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (pausedAutoRefresh) return
    const id = window.setInterval(() => {
      void fetchData()
    }, 15_000)
    return () => window.clearInterval(id)
  }, [pausedAutoRefresh, fetchData])

  const handleClick = (flag: RiskFlag) => {
    if (!flag.target) return
    if (flag.target.type === "user") {
      onUserClick(flag.target.userId, null, null)
    } else if (flag.target.type === "symbol") {
      onSymbolClick(flag.target.symbol, flag.target.segment)
    } else if (flag.target.type === "route" && typeof window !== "undefined") {
      window.location.href = flag.target.href
    }
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Risk & alerts
        </span>
        {loading && <span className="text-[10px] text-muted-foreground">updating…</span>}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {flags.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic py-2">
            No active alerts
          </div>
        )}
        {flags.map((flag, idx) => (
          <button
            key={`${flag.kind}-${idx}`}
            type="button"
            disabled={!flag.target}
            onClick={() => handleClick(flag)}
            className={`w-full text-left flex items-start gap-2 rounded-md border px-2 py-1.5 transition-colors ${severityClass(
              flag.severity,
            )} ${flag.target ? "hover:opacity-80 cursor-pointer" : "cursor-default opacity-80"}`}
          >
            <span className="mt-0.5 shrink-0">{iconForKind(flag.kind)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{flag.label}</div>
              {flag.detail && (
                <div className="text-[10px] opacity-80 truncate">{flag.detail}</div>
              )}
            </div>
            {flag.count > 1 && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-background/50">
                {flag.count}
              </Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
