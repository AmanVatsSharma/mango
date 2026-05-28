/**
 * @file components/admin-v2/client-360/tabs/risk.tsx
 * @module admin-v2/client-360
 * @description Risk tab — read-only view of the client's RiskLimit + cross-link to the
 *              Winner Controls tab where per-client overrides (spread×, position cap,
 *              instrument blocks, max notional) are managed.
 *
 *              Premium aesthetic — v2 brand tokens throughout (no zinc).
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 polish: v2 brand re-skin, link to Winner Controls.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, ShieldAlert } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { formatInr } from "@/lib/admin-v2/api-client"
import { useClientRiskLimit } from "../hooks"
import type { UserDetail } from "../types"

interface RiskLimit {
  maxDailyLoss?: string | number | null
  maxPositionSize?: string | number | null
  maxLeverage?: string | number | null
  maxDailyTrades?: number | null
  status?: string | null
  riskLevelLowPct?: number | null
  riskLevelMediumPct?: number | null
  riskLevelHighPct?: number | null
  autoCloseLevelPct?: number | null
}

export default function RiskTab({ user }: { user: UserDetail }) {
  const q = useClientRiskLimit(user.id)
  const limit = (q.data as { riskLimit?: RiskLimit } | undefined)?.riskLimit

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-warning">Risk</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              per-client RiskLimit overrides + Winner Mitigation knobs
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">
            Risk profile
          </h2>
        </div>
        <Link
          href={`/admin-v2/clients/${user.id}?tab=winners`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1 text-[11px] font-medium text-[#9DB6FF] hover:brightness-110"
        >
          <ShieldAlert className="h-3 w-3" /> Winner Controls
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      </header>

      {q.isLoading ? (
        <div className="v2-card flex h-32 items-center justify-center text-sm text-[var(--v2-text-mute)]">
          Loading risk limit…
        </div>
      ) : !limit ? (
        <EmptyState
          title="No per-client risk override"
          description="The client uses the global RiskConfig defaults. Set per-client RiskLimit overrides in v1, or use the Winner Controls tab for B-book mitigation knobs."
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Max daily loss"
              value={formatInr(limit.maxDailyLoss as number | null)}
              tone="warning"
            />
            <KpiTile
              label="Max position size"
              value={formatInr(limit.maxPositionSize as number | null)}
              tone="info"
            />
            <KpiTile
              label="Max leverage"
              value={limit.maxLeverage != null ? `${limit.maxLeverage}×` : "—"}
              tone="neutral"
            />
            <KpiTile
              label="Max daily trades"
              value={limit.maxDailyTrades ?? "—"}
              tone="neutral"
            />
          </section>

          <section className="v2-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              Threshold overrides
            </h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <ThresholdRow label="Risk level — low" value={pctOrInherit(limit.riskLevelLowPct)} />
              <ThresholdRow label="Risk level — medium" value={pctOrInherit(limit.riskLevelMediumPct)} />
              <ThresholdRow label="Risk level — high" value={pctOrInherit(limit.riskLevelHighPct)} />
              <ThresholdRow label="Auto-close level" value={pctOrInherit(limit.autoCloseLevelPct)} />
              <ThresholdRow label="Status" value={limit.status ?? "ACTIVE"} mono />
            </dl>
          </section>
        </>
      )}
    </div>
  )
}

function ThresholdRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-2">
      <dt className="text-[var(--v2-text-mute)]">{label}</dt>
      <dd
        className={mono ? "v2-num text-[var(--v2-text)]" : "font-semibold text-[var(--v2-text)]"}
      >
        {value}
      </dd>
    </div>
  )
}

function pctOrInherit(v: number | null | undefined): string {
  return v != null ? `${v}%` : "inherits"
}
