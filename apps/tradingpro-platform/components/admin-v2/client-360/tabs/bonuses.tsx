/**
 * @file components/admin-v2/client-360/tabs/bonuses.tsx
 * @module admin-v2/client-360
 * @description Bonus tab — credit balance hero + grants ledger + manual issue form.
 *              Permission-gated to admin.bonus.read.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Gift, Wallet } from "lucide-react"
import { useUserBonusGrants } from "@/components/admin-v2/bonuses/hooks"
import { BONUS_KIND_META, GRANT_STATUS_META } from "@/components/admin-v2/bonuses/types"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type { UserDetail } from "../types"

export default function BonusesTab({ user }: { user: UserDetail }) {
  const q = useUserBonusGrants(user.id)
  const grants = q.data?.grants ?? []
  const credit = q.data?.creditBalance ?? 0
  const balance = q.data?.balance ?? 0

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--v2-text)]">Bonus &amp; credit</h2>
          <p className="text-xs text-[var(--v2-text-mute)]">
            Active grants, credit balance ledger, and turnover unlock progress.
          </p>
        </div>
        <Link
          href="/admin-v2/bonuses"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
        >
          <ExternalLink className="h-3 w-3" /> Bonus engine
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          label="Credit balance"
          value={formatInr(credit)}
          tone="info"
          icon={<Gift className="h-4 w-4" />}
          hint="Non-withdrawable until turnover unlocks"
        />
        <KpiTile
          label="Cash balance"
          value={formatInr(balance)}
          tone="neutral"
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiTile
          label="Active grants"
          value={grants.filter((g) => g.status === "ACTIVE").length}
          tone="neutral"
        />
      </section>

      <div className="v2-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Grant history</h3>
          <span className="text-[11px] text-[var(--v2-text-faint)]">{grants.length} total</span>
        </header>
        {q.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : grants.length === 0 ? (
          <EmptyState
            title="No grants for this client"
            description="Issue a manual grant from /admin-v2/bonuses or via promo redemption."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {grants.map((g) => {
              const meta = BONUS_KIND_META[g.ruleKind]
              const statusMeta = GRANT_STATUS_META[g.status]
              const pct = (g.unlockProgress * 100).toFixed(0)
              return (
                <li key={g.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-xs">
                  <span className="col-span-3">
                    <span
                      className={cn(
                        "v2-pill",
                        meta.tone === "info"
                          ? "v2-pill-info"
                          : meta.tone === "success"
                            ? "v2-pill-success"
                            : meta.tone === "warning"
                              ? "v2-pill-warning"
                              : "v2-pill-neutral",
                      )}
                    >
                      {meta.label}
                    </span>
                    <div className="mt-0.5 truncate text-[10px] text-[var(--v2-text-mute)]">
                      {g.ruleName}
                    </div>
                  </span>
                  <span className="col-span-2 text-right">
                    <div className="v2-num text-sm font-semibold text-[var(--v2-text)]">
                      {formatInr(g.amount)}
                    </div>
                    <div className="text-[10px] text-[var(--v2-text-faint)]">
                      {formatRelativeIst(g.grantedAt)}
                    </div>
                  </span>
                  <span className="col-span-4">
                    <div className="flex items-baseline justify-between gap-2 text-[10px] text-[var(--v2-text-mute)]">
                      <span>
                        {formatInr(g.turnoverProgress)} / {formatInr(g.turnoverRequired)}
                      </span>
                      <span className="font-mono text-[var(--v2-text-faint)]">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                          g.status === "UNLOCKED"
                            ? "from-[var(--v2-gain)] to-[#5BC1FF]"
                            : "from-[var(--v2-cobalt)] to-[var(--v2-violet)]",
                        )}
                        style={{ width: `${Math.min(100, Number(pct))}%` }}
                      />
                    </div>
                  </span>
                  <span className="col-span-2 text-center">
                    <span
                      className={cn(
                        "v2-pill",
                        statusMeta.tone === "success"
                          ? "v2-pill-success"
                          : statusMeta.tone === "warning"
                            ? "v2-pill-warning"
                            : statusMeta.tone === "danger"
                              ? "v2-pill-danger"
                              : "v2-pill-info",
                      )}
                    >
                      {statusMeta.label}
                    </span>
                  </span>
                  <span className="col-span-1 text-right text-[10px] text-[var(--v2-text-faint)]">
                    {g.expiresAt ? `exp ${formatRelativeIst(g.expiresAt)}` : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
