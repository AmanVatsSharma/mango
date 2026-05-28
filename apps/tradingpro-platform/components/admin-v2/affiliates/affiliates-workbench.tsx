/**
 * @file components/admin-v2/affiliates/affiliates-workbench.tsx
 * @module admin-v2/affiliates
 * @description /admin-v2/affiliates — composes Roster / Commissions / Payouts / Attributions
 *              into a tabbed workbench with a KPI hero. Premium broker aesthetic.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Activity, BadgeCheck, Banknote, Crown, Link2, Users } from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { formatInr } from "@/lib/admin-v2/api-client"
import { useAffiliates, useAffiliateCommissions, useAffiliatePayouts } from "./hooks"
import { AffiliatesList } from "./affiliates-list"
import { CommissionsFeed } from "./commissions-feed"
import { PayoutsQueue } from "./payouts-queue"
import { AttributionsFeed } from "./attributions-feed"
import { cn } from "@/lib/utils"

type Tab = "roster" | "commissions" | "payouts" | "attributions"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "roster", label: "Roster", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "commissions", label: "Commissions", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "payouts", label: "Payouts", icon: <Banknote className="h-3.5 w-3.5" /> },
  { id: "attributions", label: "Attribution", icon: <Link2 className="h-3.5 w-3.5" /> },
]

export function AffiliatesWorkbench() {
  const [tab, setTab] = React.useState<Tab>("roster")
  const aff = useAffiliates({ limit: 1 })
  const comm = useAffiliateCommissions({ status: "ACCRUED", limit: 1 })
  const pay = useAffiliatePayouts({ status: "PENDING", limit: 1 })

  const totalAffiliates = aff.data?.total ?? 0
  const pendingPayoutCount = pay.data?.total ?? 0
  const accruedSum = comm.data?.sumGrossRupees ?? 0
  const accruedCount = comm.data?.total ?? 0

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Affiliate · IB Program</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              tiered commissions · sub-affiliate cascade · TDS-deducted payouts
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Affiliate engine
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            External IBs refer clients in exchange for SPREAD / LOSS / LOT / FIXED commissions.
            Multi-level cascade. First-touch attribution with a 90-day window. Payouts queue
            with admin-set TDS rate per batch — finance/legal sign-off required before
            production mark-paid.
          </p>
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Affiliates"
          value={totalAffiliates}
          tone="info"
          icon={<BadgeCheck className="h-4 w-4" />}
          hint="Roster size (all statuses)"
        />
        <KpiTile
          label="Accrued (open)"
          value={formatInr(accruedSum)}
          tone="success"
          icon={<Activity className="h-4 w-4" />}
          hint={`${accruedCount} commission rows awaiting payout`}
        />
        <KpiTile
          label="Pending payouts"
          value={pendingPayoutCount}
          tone="warning"
          icon={<Banknote className="h-4 w-4" />}
          hint="Queued for approval"
        />
        <KpiTile
          label="Top tier"
          value="GOLD"
          tone="neutral"
          icon={<Crown className="h-4 w-4" />}
          hint="Auto-promoted on lifetime + funded clients"
        />
      </section>

      {/* Tab strip */}
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

      {tab === "roster" ? <AffiliatesList /> : null}
      {tab === "commissions" ? <CommissionsFeed /> : null}
      {tab === "payouts" ? <PayoutsQueue /> : null}
      {tab === "attributions" ? <AttributionsFeed /> : null}
    </div>
  )
}
