/**
 * @file app/(admin-v2)/admin-v2/funds/page.tsx
 * @module admin-v2
 * @description Funds workbench (v2 placeholder) — KPI strip + recent deposits/withdrawals
 *              + link to v1 for the full action workflow until Phase 13 lands the risk-aware
 *              withdrawal review + multi-step approval chain.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { Building2, Wallet } from "lucide-react"
import {
  EmptyState,
  KpiTile,
  StatusPill,
} from "@/components/admin-v2/primitives"
import { jsonFetcher, formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"

interface DepositRow {
  id: string
  amount: number | string
  status: string
  createdAt: string
  user?: { id: string; name?: string | null; clientId?: string | null }
}

interface DepositsResp {
  success: boolean
  deposits: DepositRow[]
}

export default function AdminV2FundsRoute() {
  const q = useSWR<DepositsResp>("/api/admin/deposits", jsonFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  })
  const deposits = q.data?.deposits ?? []
  const pendingTotal = deposits.reduce((s, d) => s + Number(d.amount), 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone="info" label="Funds" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Read-only preview · refreshes every 30s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Funds
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Pending deposits flow through here; the risk-aware Withdrawal Review now lives at
            its own workbench (Phase 13a — auto-hold rules + multi-step approval chain).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin-v2/funds/withdrawals"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-4 py-2 text-sm font-semibold text-[var(--v2-text)] hover:opacity-90"
          >
            Withdrawal review →
          </Link>
          <Link
            href="/admin-console/funds"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--v2-text)] hover:border-[var(--v2-border-accent)]"
          >
            v1 Funds workbench →
          </Link>
        </div>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Pending deposits"
          value={deposits.length}
          tone="info"
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiTile
          label="Pending value"
          value={formatInr(pendingTotal)}
          tone="neutral"
        />
        <KpiTile
          label="Withdrawal review"
          value="Live"
          tone="success"
          icon={<Building2 className="h-4 w-4" />}
          hint="Risk-based holds + multi-step approval"
        />
      </section>

      <div className="v2-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Pending deposits</h3>
          <span className="text-[11px] text-[var(--v2-text-faint)]">
            <span className="v2-num text-[var(--v2-text-mute)]">{deposits.length}</span> shown
          </span>
        </header>
        {q.isLoading ? (
          <p className="px-4 py-6 text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : deposits.length === 0 ? (
          <EmptyState
            title="No pending deposits"
            description="Approved + completed deposits flow through automatically."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {deposits.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--v2-cobalt-soft)]"
              >
                <div className="min-w-0">
                  <span className="truncate text-sm font-medium text-[var(--v2-text)]">
                    {d.user?.name ?? "—"}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-[var(--v2-text-faint)]">
                    {d.user?.clientId ?? d.user?.id?.slice(0, 8) ?? "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="v2-num text-sm font-semibold text-[var(--v2-text)]">
                    {formatInr(Number(d.amount))}
                  </span>
                  <StatusPill tone="info" label={d.status} size="sm" />
                  <span className="text-[11px] text-[var(--v2-text-faint)]">
                    {formatRelativeIst(d.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
