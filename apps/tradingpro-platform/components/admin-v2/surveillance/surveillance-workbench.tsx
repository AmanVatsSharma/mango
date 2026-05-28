/**
 * File:        components/admin-v2/surveillance/surveillance-workbench.tsx
 * Module:      admin-v2/surveillance
 * Purpose:     Top-level workbench for /admin-v2/surveillance — KPI hero + tab strip
 *              (Queue · Rules), composes the alert queue and rule registry.
 *
 * Exports:
 *   - SurveillanceWorkbench — props: { canEditRules } (server-resolved RBAC).
 *
 * Side-effects: SWR network reads inside child panels.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import {
  ListChecks,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { useAlerts } from "./hooks"
import { QueuePanel } from "./queue-panel"
import { RulesPanel } from "./rules-panel"
import { RowDrawer } from "./row-drawer"
import type { SurveillanceQueueRow } from "./types"
import { cn } from "@/lib/utils"

type Tab = "queue" | "rules"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "queue", label: "Queue", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: "rules", label: "Rules", icon: <Settings2 className="h-3.5 w-3.5" /> },
]

export function SurveillanceWorkbench({ canEditRules }: { canEditRules: boolean }) {
  const [tab, setTab] = React.useState<Tab>("queue")
  const [openRow, setOpenRow] = React.useState<SurveillanceQueueRow | null>(null)

  // Hero KPIs come from the queue endpoint — kpis aggregate is computed server-side.
  const heroQ = useAlerts(
    { status: "ANY", severity: "ANY", ruleKey: "ANY", q: "" },
    1,
    1,
  )
  const kpis = heroQ.data?.kpis ?? {
    open: 0,
    highSeverity: 0,
    unassigned: 0,
    resolvedToday: 0,
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-danger">House · Surveillance</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Internal-fraud queue · alert-only · single-writer rule
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Surveillance
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--v2-text-mute)]">
            Five rules score behaviour for HEAVY_HITTER, SUSPICIOUS_WINNER, COORDINATED_TRADING,
            MULTI_ACCOUNT, and BONUS_ABUSE. Surveillance creates alerts only — acting on a
            finding is done from the matching workbench (Winner control, Bonus engine, etc.).
          </p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Open"
          value={kpis.open}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="Awaiting triage"
        />
        <KpiTile
          label="High / Critical"
          value={kpis.highSeverity}
          tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="Open or assigned"
        />
        <KpiTile
          label="Unassigned"
          value={kpis.unassigned}
          tone="info"
          icon={<Users className="h-4 w-4" />}
          hint="Click to claim"
        />
        <KpiTile
          label="Resolved today"
          value={kpis.resolvedToday}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </section>

      <nav
        role="tablist"
        aria-label="Surveillance tabs"
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
        <QueuePanel onOpenDrawer={setOpenRow} />
      ) : (
        <RulesPanel canEdit={canEditRules} />
      )}

      <RowDrawer
        alertId={openRow?.id ?? null}
        onClose={() => setOpenRow(null)}
        onMutated={() => {
          // SWR refresh handled inside hook; nothing more to do here.
        }}
      />
    </div>
  )
}
