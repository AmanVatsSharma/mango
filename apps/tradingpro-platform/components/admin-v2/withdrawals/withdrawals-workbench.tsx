/**
 * File:        components/admin-v2/withdrawals/withdrawals-workbench.tsx
 * Module:      admin-v2/withdrawals
 * Purpose:     Top-level workbench for /admin-v2/funds/withdrawals — KPI hero + tab strip
 *              (Queue · Risk rules). Composes panels from this directory.
 *
 * Exports:
 *   - WithdrawalsWorkbench
 *
 * Side-effects: SWR network reads inside child panels.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { ShieldAlert, ShieldCheck, Hourglass, CheckCircle2, ListChecks, SlidersHorizontal } from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { useQueue } from "./hooks"
import { QueuePanel } from "./queue-panel"
import { RiskRulesPanel } from "./risk-rules-panel"
import type { QueueFilter } from "./types"
import { cn } from "@/lib/utils"

type Tab = "queue" | "rules"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "queue", label: "Queue", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: "rules", label: "Risk rules", icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
]

export function WithdrawalsWorkbench() {
  const [tab, setTab] = React.useState<Tab>("queue")
  const [filter, setFilter] = React.useState<QueueFilter>("PENDING_HIGH_RISK")
  // Hero KPIs come from the queue endpoint (the kpis aggregate is computed server-side regardless of filter).
  const heroQ = useQueue("ALL", "")
  const kpis = heroQ.data?.kpis ?? {
    pendingHighRisk: 0,
    pendingLowRisk: 0,
    held: 0,
    completedToday: 0,
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-warning">Funds · Withdrawal review</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Risk-aware queue · multi-step approval · auto-hold rules
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Withdrawal review
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--v2-text-mute)]">
            Pure B-book withdrawal gate. Five active rules score every request 0–100; rows ≥ 50
            auto-hold and demand a multi-step approval chain. Bulk-approve is restricted to
            low-risk rows — held rows MUST traverse the chain.
          </p>
        </div>
        <Link
          href="/admin-v2/funds"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
        >
          ← Funds workbench
        </Link>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Held"
          value={kpis.held}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="Awaiting approval chain"
        />
        <KpiTile
          label="Pending · high risk"
          value={kpis.pendingHighRisk}
          tone="danger"
          icon={<Hourglass className="h-4 w-4" />}
          hint="riskScore ≥ 50"
        />
        <KpiTile
          label="Pending · low risk"
          value={kpis.pendingLowRisk}
          tone="info"
          icon={<ShieldCheck className="h-4 w-4" />}
          hint="Eligible for bulk approve"
        />
        <KpiTile
          label="Completed today"
          value={kpis.completedToday}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </section>

      {/* Tab strip */}
      <nav
        role="tablist"
        aria-label="Withdrawal review tabs"
        className="mb-4 flex items-center gap-1 border-b border-white/[0.06]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-[var(--v2-cobalt)] text-[var(--v2-text)]"
                : "border-b-2 border-transparent text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "queue" ? (
        <QueuePanel filter={filter} onFilterChange={setFilter} />
      ) : (
        <RiskRulesPanel />
      )}
    </div>
  )
}
