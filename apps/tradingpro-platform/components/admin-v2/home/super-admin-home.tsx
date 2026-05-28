/**
 * File:        components/admin-v2/home/super-admin-home.tsx
 * Module:      admin-v2/home
 * Purpose:     Super-admin home variant. Cross-cutting KPI deck (Compliance + Ops + RM) + a
 *              shortcut grid to every workbench. The "I want to see everything at a glance"
 *              landing. Phase 17: Cutover Readiness tile now wired to real rollout config.
 *
 * Exports:
 *   - default SuperAdminHome  — no props
 *
 * Depends on:
 *   - @/components/admin-v2/primitives  — KpiTile, StatusPill
 *   - @/lib/admin-v2/api-client         — formatInr, jsonFetcher
 *   - various admin-v2 hooks            — KYC, trades, callbacks, RMs, house exposure
 *
 * Side-effects: SWR polling on 6 endpoints.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import Link from "next/link"
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  GitFork,
  LayoutDashboard,
  Monitor,
  ShieldAlert,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import useSWR from "swr"
import { KpiTile, StatusPill } from "@/components/admin-v2/primitives"
import { useKycQueue } from "@/components/admin-v2/compliance/hooks"
import { useTradesList } from "@/components/admin-v2/command-centre/hooks"
import { useCallbackRadarCounts } from "@/components/admin-v2/crm/hooks"
import { useRmList } from "@/components/admin-v2/rm/hooks"
import { useHouseExposure } from "@/components/admin-v2/house/hooks"
import { HousePnlTile } from "@/components/admin-v2/house/house-pnl-tile"
import { formatInr, jsonFetcher } from "@/lib/admin-v2/api-client"
import type { RolloutStatus } from "@/lib/admin-v2/auth-gate"
import HomeHeader from "./home-header"

function useRolloutStatus() {
  return useSWR<{ success: boolean; data: RolloutStatus }>(
    "/api/admin-v2/rollout-status",
    jsonFetcher,
    { refreshInterval: 120_000, revalidateOnFocus: false },
  )
}

const SHORTCUTS: { href: string; label: string; icon: React.ReactNode; description: string }[] = [
  {
    href: "/admin-v2/clients",
    label: "Clients",
    icon: <Users className="h-4 w-4" />,
    description: "Search, filter, drill into Client 360.",
  },
  {
    href: "/admin-v2/kyc",
    label: "Compliance",
    icon: <ClipboardList className="h-4 w-4" />,
    description: "KYC queue with bulk approve / reject.",
  },
  {
    href: "/admin-v2/sales",
    label: "Sales",
    icon: <Briefcase className="h-4 w-4" />,
    description: "Callback Radar + CRM workflow.",
  },
  {
    href: "/admin-v2/rms",
    label: "RM & Teams",
    icon: <GitFork className="h-4 w-4" />,
    description: "Roster · org tree · leaderboard.",
  },
  {
    href: "/admin-v2/command-centre",
    label: "Command Centre",
    icon: <LayoutDashboard className="h-4 w-4" />,
    description: "Live blotter · risk flags · saved scopes.",
  },
  {
    href: "/admin-v2/house",
    label: "House Book",
    icon: <Building2 className="h-4 w-4" />,
    description: "Counterparty exposure · P&L · concentration · scenarios.",
  },
  {
    href: "/admin-v2/funds",
    label: "Funds",
    icon: <Building2 className="h-4 w-4" />,
    description: "Deposits · withdrawals · settlements.",
  },
  {
    href: "/admin-v2/audit",
    label: "Audit",
    icon: <ShieldAlert className="h-4 w-4" />,
    description: "Cross-cutting admin actions log.",
  },
  {
    href: "/admin-v2/reports",
    label: "Reports",
    icon: <BarChart3 className="h-4 w-4" />,
    description: "Financial reports · fund flows · brokerage breakdown.",
  },
  {
    href: "/admin-v2/observability",
    label: "Observability",
    icon: <Monitor className="h-4 w-4" />,
    description: "System health · services · queues · market-data feed.",
  },
]

const MODE_HINT: Record<string, string> = {
  none: "No users have v2",
  allowlist_only: "Allowlist users only",
  percentage: "Ramp active",
  all: "100% — ready for Phase 18",
}

const MODE_TONE: Record<string, "neutral" | "info" | "warning" | "success"> = {
  none: "neutral",
  allowlist_only: "info",
  percentage: "warning",
  all: "success",
}

export default function SuperAdminHome() {
  const kyc = useKycQueue({ status: "PENDING", limit: 1 })
  const trades = useTradesList({ status: "OPEN", limit: 1, includeStats: true })
  const callbacks = useCallbackRadarCounts()
  const rms = useRmList()
  const exposure = useHouseExposure({ refreshMs: 3000 })
  const rollout = useRolloutStatus()

  const kycPending = kyc.data?.statusCounts?.PENDING ?? 0
  const slaBreach = kyc.data?.meta?.overdueCount ?? 0
  const todayPnl = trades.data?.stats?.todayNetPnL ?? 0
  const openPositions = trades.data?.stats?.openPositionsCount ?? 0
  const houseUnrealised = exposure.data?.snapshot.brokerUnrealizedPnl
  const grossBook = exposure.data?.snapshot.grossNotional ?? 0
  const overdueCallbacks = callbacks.data?.radar.overdue ?? 0
  const dueToday = callbacks.data?.radar.dueToday ?? 0
  const totalManaged = (rms.data?.rms ?? []).reduce((s, r) => s + r.assignedUsersCount, 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <HomeHeader
        chip={{ label: "Super admin", tone: "info" }}
        title={
          <>
            Operations console,{" "}
            <span className="v2-text-grad-brand">re-imagined.</span>
          </>
        }
        subtitle="National-grade B-book admin. Cross-cutting KPIs first; each workbench one click away."
        primaryCta={{ href: "/admin-v2/clients", label: "Open Clients" }}
        secondaryCta={{ href: "/admin-v2/command-centre", label: "Command Centre" }}
      />

      <section className="mb-4 grid gap-3 lg:grid-cols-3">
        <HousePnlTile
          label="Broker unrealised P&L"
          amount={houseUnrealised}
          isLoading={exposure.isLoading}
        />
        <KpiTile
          label="Gross book"
          value={formatInr(grossBook)}
          tone="info"
          icon={<Building2 className="h-4 w-4" />}
          hint={`${exposure.data?.snapshot.activeClients ?? 0} active clients`}
        />
        <KpiTile
          label="Today P&L (clients)"
          value={formatInr(todayPnl)}
          tone={todayPnl >= 0 ? "success" : "danger"}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="Client view — broker is the inverse"
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile
          label="Open positions"
          value={openPositions}
          tone="info"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="KYC pending"
          value={kycPending}
          tone={slaBreach > 0 ? "warning" : "info"}
          icon={<ClipboardList className="h-4 w-4" />}
          hint={slaBreach > 0 ? `${slaBreach} past SLA` : "On track"}
        />
        <KpiTile
          label="Callbacks due today"
          value={dueToday}
          tone={overdueCallbacks > 0 ? "danger" : "info"}
          icon={<Timer className="h-4 w-4" />}
          hint={overdueCallbacks > 0 ? `${overdueCallbacks} overdue` : "All on track"}
        />
        <KpiTile
          label="Managed clients"
          value={totalManaged}
          tone="neutral"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiTile
          label="RMs"
          value={rms.data?.total ?? 0}
          tone="neutral"
          icon={<GitFork className="h-4 w-4" />}
        />
        <KpiTile
          label="v2 traffic ramp"
          value={
            rollout.data?.data
              ? `${rollout.data.data.trafficPct}%`
              : "—"
          }
          tone={
            rollout.data?.data
              ? MODE_TONE[rollout.data.data.effectiveMode] ?? "neutral"
              : "neutral"
          }
          loading={rollout.isLoading}
          icon={<Zap className="h-4 w-4" />}
          hint={
            rollout.data?.data
              ? MODE_HINT[rollout.data.data.effectiveMode] ?? ""
              : "Phase 17 feature flag"
          }
        />
        <KpiTile
          label="v1 status"
          value="Live"
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint="/admin-console untouched"
        />
      </section>

      <section>
        <header className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--v2-text)]">Workbenches</h2>
          <StatusPill tone="info" label="Foundation complete" size="sm" />
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="v2-card v2-card-hover flex items-start gap-3 p-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]">
                {s.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-semibold text-[var(--v2-text)]">
                  {s.label}
                  <ArrowUpRight className="h-3 w-3 text-[var(--v2-text-faint)]" />
                </div>
                <p className="mt-0.5 text-xs text-[var(--v2-text-mute)]">{s.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
