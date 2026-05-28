/**
 * @file components/admin-v2/bonuses/bonuses-workbench.tsx
 * @module admin-v2/bonuses
 * @description /admin-v2/bonuses — composes Rules / Grants / Bulk-issue / Promo into a tabbed
 *              workbench with KPI hero. Premium broker aesthetic — glass cards, gradient hero.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Activity, Gift, Ticket, Users } from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { useBonusGrants, useBonusRules, usePromoCodes } from "./hooks"
import { RulesList } from "./rules-list"
import { GrantsFeed } from "./grants-feed"
import { BulkIssueForm } from "./bulk-issue-form"
import { PromoList } from "./promo-list"
import { cn } from "@/lib/utils"

type Tab = "grants" | "rules" | "bulk" | "promo"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "grants", label: "Grants", icon: <Gift className="h-3.5 w-3.5" /> },
  { id: "rules", label: "Rules", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "bulk", label: "Bulk issue", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "promo", label: "Promo codes", icon: <Ticket className="h-3.5 w-3.5" /> },
]

export function BonusesWorkbench() {
  const [tab, setTab] = React.useState<Tab>("grants")
  const grants = useBonusGrants({ limit: 1 })
  const rules = useBonusRules({ activeOnly: true })
  const promos = usePromoCodes()

  const totalActive = grants.data?.byStatus?.ACTIVE ?? 0
  const totalUnlocked = grants.data?.byStatus?.UNLOCKED ?? 0
  const totalRules = rules.data?.rows?.length ?? 0
  const livePromos = promos.data?.rows?.filter((p) => p.isActive).length ?? 0

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Bonuses · Credit · Promo</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              acquisition + retention engine
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Bonus engine
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Deposit-match, no-deposit, lossback, and referral grants. Credit balance is
            non-withdrawable until turnover unlocks. Bulk-issue for campaigns; promo codes
            for self-serve redemption.
          </p>
        </div>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Active grants"
          value={totalActive}
          tone="info"
          icon={<Gift className="h-4 w-4" />}
          hint="Accruing turnover toward unlock"
        />
        <KpiTile
          label="Unlocked"
          value={totalUnlocked}
          tone="success"
          hint="Credit became withdrawable"
        />
        <KpiTile
          label="Active rules"
          value={totalRules}
          tone="neutral"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Live promo codes"
          value={livePromos}
          tone="neutral"
          icon={<Ticket className="h-4 w-4" />}
        />
      </section>

      <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-white/[0.08] text-[var(--v2-text)]"
                : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "grants" ? <GrantsFeed /> : null}
      {tab === "rules" ? <RulesList /> : null}
      {tab === "bulk" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BulkIssueForm
            onIssued={() => {
              void globalMutate("/api/admin/bonuses/grants")
            }}
          />
          <div className="v2-card p-5">
            <h3 className="text-sm font-semibold text-[var(--v2-text)]">How bulk issue works</h3>
            <ul className="mt-3 space-y-2 text-xs text-[var(--v2-text-mute)]">
              <li>
                Pick an active rule + amount. Each user id receives one ACTIVE grant of that amount.
              </li>
              <li>Cap is 500 ids per request; admin.bonus.bulk permission required.</li>
              <li>
                Failures are reported per-row (e.g., user not found, account upsert failed); successful
                grants persist independently.
              </li>
              <li>
                Each grant credits TradingAccount.creditBalance by the grant amount and starts the
                turnover meter at 0 — burndown advances on every settled trade via the
                OrderExecutionWorker post-fill hook.
              </li>
              <li>
                Use the <span className="font-mono">source</span> tag to track campaign attribution
                (e.g., diwali2026, reactivation_q2).
              </li>
            </ul>
          </div>
        </div>
      ) : null}
      {tab === "promo" ? <PromoList /> : null}
    </div>
  )
}
