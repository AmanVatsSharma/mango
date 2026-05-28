/**
 * @file components/admin-v2/house/house-dashboard.tsx
 * @module admin-v2/house
 * @description House Book Dashboard — composes the live broker counterparty view.
 *              Hero strip: live broker P&L (unrealised + day) + KPI tiles for gross book,
 *              net exposure, active clients. Body: top-exposure heatmap, concentration
 *              meters, segment breakdown, scenario VaR ladders, realised P&L history.
 *
 *              Permissions: gated by admin.house.read on the API side; this component
 *              assumes the user is authorised (parent route checks).
 *
 *              Refresh cadence:
 *                - Exposure (KPI strip + heatmap + concentration + segments + scenario):
 *                  every 2s via SWR.
 *                - Realised P&L history: every 60s.
 *
 *              Side-effects: SWR polling.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  Building2,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { Button } from "@/components/ui/button"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { useHouseExposure, useHousePnl, useHouseScenario } from "./hooks"
import { HousePnlTile } from "./house-pnl-tile"
import { ExposureHeatmap } from "./exposure-heatmap"
import { ConcentrationMeter } from "./concentration-meter"
import { ScenarioLadderCard } from "./scenario-ladder"
import { PnlHistoryChart } from "./pnl-history-chart"
import type { HousePnlPeriod } from "./types"

const PERIODS: { id: HousePnlPeriod; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
]

export function HouseDashboard() {
  const [pnlPeriod, setPnlPeriod] = React.useState<HousePnlPeriod>("day")
  const exposure = useHouseExposure({ refreshMs: 2000 })
  const scenario = useHouseScenario({ refreshMs: 5000 })
  const pnl = useHousePnl({ period: pnlPeriod, refreshMs: 60_000 })

  const snap = exposure.data?.snapshot
  const ladders = scenario.data?.ladders ?? []
  const series = pnl.data?.series

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">House Book</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              {snap ? `live · last ${formatRelativeIst(snap.asOf)}` : "loading…"}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Counterparty book
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            The broker is the counterparty for every client position. This is the single source of
            truth for the broker's P&amp;L, gross + net exposure, concentration risk, and scenario
            impact across the live book.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin-v2/house/winners"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Winner Mitigation
          </Link>
          <Link
            href="/admin-v2/house/quotes"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
          >
            <Sparkles className="h-3.5 w-3.5" /> Spread &amp; Quotes
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void exposure.mutate()
              void scenario.mutate()
              void pnl.mutate()
            }}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <HousePnlTile
          label="Broker unrealised P&L"
          amount={snap?.brokerUnrealizedPnl}
          isLoading={exposure.isLoading}
        />
        <HousePnlTile
          label="Broker day P&L"
          amount={snap?.brokerDayPnl}
          isLoading={exposure.isLoading}
          compact
        />
        <div className="grid gap-3">
          <KpiTile
            label="Net exposure"
            value={formatInr(snap?.netNotional ?? 0)}
            tone="info"
            icon={<Activity className="h-4 w-4" />}
            hint="Σ(broker net signed notional)"
          />
          <KpiTile
            label="Gross book"
            value={formatInr(snap?.grossNotional ?? 0)}
            tone="neutral"
            icon={<Layers className="h-4 w-4" />}
            hint="Σ(|notional|) — book size"
          />
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Open positions"
          value={snap?.openPositions ?? 0}
          tone="neutral"
          icon={<Building2 className="h-4 w-4" />}
        />
        <KpiTile
          label="Active clients"
          value={snap?.activeClients ?? 0}
          tone="neutral"
          icon={<Users className="h-4 w-4" />}
        />
        <ConcentrationMeter
          label="Top-5 symbols share"
          share={snap?.concentrationTop5 ?? 0}
          hint="% of gross book in top 5 symbols"
        />
        <ConcentrationMeter
          label="Top-5 clients share"
          share={snap?.concentrationTop5Clients ?? 0}
          hint="% of gross book held by top 5 clients"
        />
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--v2-text)]">Top exposures</h2>
            <p className="text-xs text-[var(--v2-text-mute)]">
              Symbols ranked by absolute notional · tinted by broker P&amp;L direction
            </p>
          </div>
        </div>
        {exposure.isLoading ? (
          <div className="v2-card flex h-48 items-center justify-center text-sm text-[var(--v2-text-mute)]">
            Loading exposure…
          </div>
        ) : !snap || snap.topSymbols.length === 0 ? (
          <EmptyState
            title="No open positions"
            description="The broker book is currently flat. New client positions will appear here in real time."
          />
        ) : (
          <ExposureHeatmap rows={snap.topSymbols} total={snap.grossNotional} />
        )}
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-[var(--v2-text)]">Segment breakdown</h3>
          <div className="v2-card overflow-hidden">
            {snap && snap.bySegment.length > 0 ? (
              <ul className="divide-y divide-white/[0.04]">
                {snap.bySegment.map((seg) => {
                  const positive = seg.brokerPnl >= 0
                  return (
                    <li
                      key={seg.segment}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-[var(--v2-text)]">{seg.segment}</div>
                        <div className="text-[10px] text-[var(--v2-text-faint)]">
                          {formatInr(seg.absNotional)} gross · net{" "}
                          <span className="font-mono">{formatInr(seg.netNotional)}</span>
                        </div>
                      </div>
                      <span
                        className={
                          positive
                            ? "v2-num text-sm font-semibold text-[var(--v2-gain)]"
                            : "v2-num text-sm font-semibold text-[var(--v2-loss)]"
                        }
                      >
                        {formatInr(seg.brokerPnl)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-xs text-[var(--v2-text-mute)]">
                Empty
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--v2-text)]">Scenario VaR ladders</h3>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <AlertTriangle className="h-3 w-3" />
              naive linear · phase 13 lands Greeks
            </span>
          </div>
          {ladders.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {ladders.map((ladder) => (
                <ScenarioLadderCard key={ladder.scenario} ladder={ladder} />
              ))}
            </div>
          ) : (
            <div className="v2-card flex h-48 items-center justify-center text-sm text-[var(--v2-text-mute)]">
              {scenario.isLoading ? "Loading scenarios…" : "No scenarios yet"}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--v2-text)]">Realised P&L history</h2>
            <p className="text-xs text-[var(--v2-text-mute)]">
              Settled trade outcomes from the broker's POV
              {series ? ` · total ${formatInr(series.totalBrokerPnl)} · ${series.totalTrades} trades` : ""}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
            {PERIODS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="outline"
                onClick={() => setPnlPeriod(p.id)}
                className={
                  pnlPeriod === p.id
                    ? "v2-btn-cta"
                    : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
                }
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="v2-card p-4">
          <PnlHistoryChart points={series?.points ?? []} isLoading={pnl.isLoading} />
        </div>
      </section>
    </div>
  )
}
