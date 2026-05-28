/**
 * @file components/admin-v2/home/ops-home.tsx
 * @module admin-v2/home
 * @description Ops-persona home variant. Hero + live trade KPIs + risk flags strip + link to
 *              the full Trade Command Centre. Same SWR hooks as the Command Centre — switching
 *              between this home and the Command Centre is instant (cache shared).
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Activity, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives"
import RiskFlagsStrip from "@/components/admin-v2/command-centre/risk-flags-strip"
import { useTradesList } from "@/components/admin-v2/command-centre/hooks"
import { useHouseExposure } from "@/components/admin-v2/house/hooks"
import { HousePnlTile } from "@/components/admin-v2/house/house-pnl-tile"
import { formatInr } from "@/lib/admin-v2/api-client"
import HomeHeader from "./home-header"

export default function OpsHome() {
  // Hits the same cache key as the Command Centre's first paint
  const q = useTradesList({ status: "OPEN", limit: 1, includeStats: true })
  const stats = q.data?.stats
  const exposure = useHouseExposure({ refreshMs: 3000 })
  const houseUnrealised = exposure.data?.snapshot.brokerUnrealizedPnl

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <HomeHeader
        chip={{ label: "Ops", tone: "danger" }}
        title="Live operations"
        subtitle="House-level P&L · open positions · risk flags · jump into Command Centre to act."
        primaryCta={{ href: "/admin-v2/command-centre", label: "Open Command Centre" }}
        secondaryCta={{ href: "/admin-v2/house", label: "House Book" }}
      />

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <HousePnlTile
          label="Broker unrealised P&L"
          amount={houseUnrealised}
          isLoading={exposure.isLoading}
        />
        <KpiTile
          label="Concentration · top 5 symbols"
          value={`${((exposure.data?.snapshot.concentrationTop5 ?? 0) * 100).toFixed(1)}%`}
          tone={(exposure.data?.snapshot.concentrationTop5 ?? 0) > 0.6 ? "danger" : "info"}
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Active clients"
          value={exposure.data?.snapshot.activeClients ?? 0}
          tone="neutral"
          icon={<Sparkles className="h-4 w-4" />}
          hint={`${exposure.data?.snapshot.openPositions ?? 0} open positions`}
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Today P&L"
          value={formatInr(stats?.todayNetPnL ?? 0)}
          tone={(stats?.todayNetPnL ?? 0) >= 0 ? "success" : "danger"}
          icon={
            (stats?.todayNetPnL ?? 0) >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
        />
        <KpiTile
          label="Open unrealized"
          value={formatInr(stats?.openUnrealizedPnL ?? 0)}
          tone={(stats?.openUnrealizedPnL ?? 0) >= 0 ? "success" : "danger"}
        />
        <KpiTile
          label="Open positions"
          value={stats?.openPositionsCount ?? 0}
          tone="info"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Win rate today"
          value={
            stats?.winRatePct != null ? `${stats.winRatePct.toFixed(0)}%` : "—"
          }
          tone={(stats?.winRatePct ?? 0) >= 50 ? "success" : "warning"}
        />
        <KpiTile
          label="Volume notional"
          value={formatInr(stats?.totalVolumeNotional ?? 0)}
          tone="neutral"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </section>

      <RiskFlagsStrip />
    </div>
  )
}
