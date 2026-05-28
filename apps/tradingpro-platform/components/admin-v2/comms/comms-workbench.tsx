/**
 * @file components/admin-v2/comms/comms-workbench.tsx
 * @module admin-v2/comms
 * @description /admin-v2/comms — composes Templates / Campaigns / Messages / Consent into
 *              a tabbed workbench with a KPI hero. Premium broker aesthetic with the v2
 *              brand language (cobalt accents, IBM Plex Mono numerics, status-tinted cards).
 *
 *              The four hard gates from Phase 12 are surfaced in the hero copy so the
 *              operator sees the compliance posture front-and-center.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Activity, Inbox, Megaphone, ShieldCheck, FileText } from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { useTemplates, useCampaigns, useMessages } from "./hooks"
import { TemplatesPanel } from "./templates-panel"
import { CampaignsPanel } from "./campaigns-panel"
import { MessagesPanel } from "./messages-panel"
import { ConsentLookupPanel } from "./consent-lookup-panel"
import { cn } from "@/lib/utils"

type Tab = "templates" | "campaigns" | "messages" | "consent"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "templates", label: "Templates", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "campaigns", label: "Campaigns", icon: <Megaphone className="h-3.5 w-3.5" /> },
  { id: "messages", label: "Messages", icon: <Inbox className="h-3.5 w-3.5" /> },
  { id: "consent", label: "Consent lookup", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
]

export function CommsWorkbench() {
  const [tab, setTab] = React.useState<Tab>("templates")
  const tpl = useTemplates({ status: "ACTIVE" })
  const camp = useCampaigns({ status: "RUNNING" })
  const failed = useMessages({ status: "FAILED" }, { limit: 1 })
  const optedOut = useMessages({ status: "OPTED_OUT" }, { limit: 1 })

  const activeTemplates = tpl.data?.rows.length ?? 0
  const runningCampaigns = camp.data?.rows.length ?? 0
  const failedToday = failed.data?.total ?? 0
  const optedOutToday = optedOut.data?.total ?? 0

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Comms · Multi-channel</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              WhatsApp · SMS (DLT) · Email · Voice · Push
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Communications engine
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--v2-text-mute)]">
            Three hard gates run on every send before the wire: <strong>SMS without
            DLT id is rejected</strong>, <strong>missing channel consent is recorded as
            OPTED_OUT (no dispatch)</strong>, and <strong>unresolved template variables
            are rejected at send-time</strong>. Vendor adapters land in Phase 12.5; today's
            channels run on the LogProvider stub for safe end-to-end exercise.
          </p>
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Active templates"
          value={activeTemplates}
          tone="info"
          icon={<FileText className="h-4 w-4" />}
          hint="Templates eligible for send"
        />
        <KpiTile
          label="Running campaigns"
          value={runningCampaigns}
          tone="success"
          icon={<Megaphone className="h-4 w-4" />}
          hint="Currently dispatching"
        />
        <KpiTile
          label="Failed sends"
          value={failedToday}
          tone={failedToday > 0 ? "danger" : "neutral"}
          icon={<Activity className="h-4 w-4" />}
          hint="Provider returned error"
        />
        <KpiTile
          label="Opted-out blocks"
          value={optedOutToday}
          tone={optedOutToday > 0 ? "warning" : "neutral"}
          icon={<ShieldCheck className="h-4 w-4" />}
          hint="Gate #2 (consent) caught these"
        />
      </section>

      {/* Tab strip */}
      <nav
        role="tablist"
        aria-label="Comms tabs"
        className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-[var(--v2-surface-1)] p-1"
      >
        {TABS.map((t) => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                isActive
                  ? "bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]"
                  : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Panel */}
      <section className="space-y-4">
        {tab === "templates" && <TemplatesPanel />}
        {tab === "campaigns" && <CampaignsPanel />}
        {tab === "messages" && <MessagesPanel />}
        {tab === "consent" && <ConsentLookupPanel />}
      </section>
    </div>
  )
}
