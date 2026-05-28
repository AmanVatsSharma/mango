"use client"

/**
 * @file stats-and-risk.tsx
 * @module admin-console/trades-blotter
 * @description Top-right cell — 6 StatCards in a 3×2 grid (Today P&L / Open exposure / Closed / Win rate / Volume / Charges)
 *              plus the RiskFlagsStrip below. Stats derive from /api/admin/trades (includeStats=1).
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useCallback, useEffect, useState } from "react"
import {
  Activity,
  CheckCircle2,
  DollarSign,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { RiskFlagsStrip } from "./risk-flags-strip"
import {
  formatTradesBlotterCompactRupees,
  tradesBlotterPnlClass,
} from "@/components/admin-console/trades-blotter-number-utils"
import type { TradeStats, TradesListResponse } from "@/app/api/admin/trades/types"

function StatCard({
  label,
  value,
  sub,
  icon,
  colorClass,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  colorClass: string
  valueClass?: string
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider truncate font-medium">
          {label}
        </span>
        <span className={colorClass}>{icon}</span>
      </div>
      <div className={`text-base font-bold tabular-nums leading-tight mt-0.5 ${valueClass ?? "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground truncate leading-tight">{sub}</div>}
    </div>
  )
}

export function StatsAndRisk({
  onUserClick,
  onSymbolClick,
  pausedAutoRefresh,
}: {
  onUserClick: (userId: string, clientId: string | null, name: string | null) => void
  onSymbolClick: (symbol: string, segment: string | null) => void
  pausedAutoRefresh?: boolean
}) {
  const [stats, setStats] = useState<TradeStats | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/trades?includeStats=1&limit=1")
      if (!res.ok) return
      const data: TradesListResponse = await res.json()
      setStats(data.stats ?? null)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (pausedAutoRefresh) return
    const id = window.setInterval(() => {
      void fetchStats()
    }, 10_000)
    return () => window.clearInterval(id)
  }, [pausedAutoRefresh, fetchStats])

  const s = stats
  const todayPnL = s?.todayNetPnL ?? 0
  const openExposure = s?.openUnrealizedPnL ?? 0
  const closedToday = s?.closedToday ?? 0
  const winRate = s?.winRatePct ?? 0
  const volume = s?.totalVolumeNotional ?? 0
  const charges = s?.todayCharges ?? 0

  return (
    <div className="h-full flex flex-col rounded-lg border border-border/60 bg-card p-2 gap-2 overflow-hidden">
      <div className="grid grid-cols-3 gap-1.5 shrink-0">
        <StatCard
          label="Today P&L"
          value={formatTradesBlotterCompactRupees(todayPnL)}
          sub={`${s?.winsToday ?? 0}W / ${s?.lossesToday ?? 0}L`}
          icon={<DollarSign className="w-3.5 h-3.5" />}
          colorClass={tradesBlotterPnlClass(todayPnL)}
          valueClass={tradesBlotterPnlClass(todayPnL)}
        />
        <StatCard
          label="Open unrealized"
          value={formatTradesBlotterCompactRupees(openExposure)}
          sub={`${s?.openPositionsCount ?? 0} open`}
          icon={<Activity className="w-3.5 h-3.5" />}
          colorClass={tradesBlotterPnlClass(openExposure)}
          valueClass={tradesBlotterPnlClass(openExposure)}
        />
        <StatCard
          label="Closed today"
          value={String(closedToday)}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          colorClass="text-emerald-500"
        />
        <StatCard
          label="Win rate"
          value={`${winRate.toFixed(0)}%`}
          icon={<Target className="w-3.5 h-3.5" />}
          colorClass="text-sky-500"
        />
        <StatCard
          label="Volume"
          value={formatTradesBlotterCompactRupees(volume)}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          colorClass="text-blue-500"
        />
        <StatCard
          label="Charges today"
          value={formatTradesBlotterCompactRupees(charges)}
          icon={<Wallet className="w-3.5 h-3.5" />}
          colorClass="text-amber-500"
        />
      </div>
      <div className="flex-1 min-h-0 border-t border-border/40 pt-1.5">
        <RiskFlagsStrip
          onUserClick={onUserClick}
          onSymbolClick={onSymbolClick}
          pausedAutoRefresh={pausedAutoRefresh}
        />
      </div>
    </div>
  )
}
