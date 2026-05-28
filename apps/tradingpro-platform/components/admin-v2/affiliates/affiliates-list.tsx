/**
 * @file components/admin-v2/affiliates/affiliates-list.tsx
 * @module admin-v2/affiliates
 * @description Affiliate roster — searchable, tier/status filtered, sortable. Each row opens
 *              the detail drawer with rules + child sub-affiliates + commission totals.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Loader2, Plus, Search } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useAffiliates } from "./hooks"
import { AffiliateDetailDrawer } from "./affiliate-detail-drawer"
import { AffiliateCreateForm } from "./affiliate-create-form"
import type { AffiliateRow, Status, Tier } from "./types"

const TIER_CHIP: Record<Tier, string> = {
  BRONZE: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-mute)]",
  SILVER: "border-[#C0C0C0]/30 bg-[#C0C0C0]/10 text-[#D4D4D4]",
  GOLD: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
}

const STATUS_CHIP: Record<Status, string> = {
  PENDING: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
  ACTIVE: "border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 text-[#7CF6C5]",
  SUSPENDED: "border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 text-[#FFB1BC]",
  REJECTED: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-faint)]",
}

export function AffiliatesList() {
  const [q, setQ] = React.useState("")
  const [tier, setTier] = React.useState<Tier | "">("")
  const [status, setStatus] = React.useState<Status | "">("")
  const [page, setPage] = React.useState(0)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const list = useAffiliates({
    q: q.trim() || undefined,
    tier: tier || undefined,
    status: status || undefined,
    page,
    limit: 25,
  })

  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 25))

  return (
    <>
      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--v2-text-faint)]" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="Search code / name / email"
            className="w-72 rounded-md border border-white/[0.06] bg-white/[0.02] pl-7 pr-2 py-1.5 text-xs text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => {
            setTier(e.target.value as Tier | "")
            setPage(0)
          }}
          className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]"
        >
          <option value="">Any tier</option>
          <option value="BRONZE">Bronze</option>
          <option value="SILVER">Silver</option>
          <option value="GOLD">Gold</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Status | "")
            setPage(0)
          }}
          className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]"
        >
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {total} affiliate{total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1.5 text-xs font-medium text-[#9DB6FF] hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> New affiliate
        </button>
      </div>

      {list.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading affiliates…
        </div>
      ) : list.error ? (
        <div className="v2-card p-4 text-sm font-medium text-[var(--v2-loss)]">
          Failed to load affiliates.
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No affiliates yet"
          description="Onboard the first IB to start tracking referrals + commissions."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-3 py-1.5 text-xs font-medium text-[#9DB6FF] hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Add affiliate
            </button>
          }
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Tier</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Clients</th>
                  <th className="px-3 py-2.5 text-right">Sub-IBs</th>
                  <th className="px-3 py-2.5 text-right">Lifetime</th>
                  <th className="px-3 py-2.5 text-right">Pending</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: AffiliateRow) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text)]">
                      {r.affiliateCode}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--v2-text)]">
                      {r.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--v2-text-mute)]">
                      {r.email}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", TIER_CHIP[r.tier])}>
                        {r.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", STATUS_CHIP[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text)]">{r.attributedCount}</td>
                    <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text-mute)]">{r.childCount}</td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-text)]">
                      {formatInr(r.lifetimeAccruedRupees)}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-warning)]">
                      {formatInr(r.pendingPayableRupees)}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-gain)]">
                      {formatInr(r.paidRupees)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--v2-text-faint)]">
                      {formatRelativeIst(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pager */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-2 text-[10px] text-[var(--v2-text-faint)]">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AffiliateDetailDrawer
        affiliateId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        onMutate={() => list.mutate()}
      />

      <AffiliateCreateForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          list.mutate()
          setPage(0)
        }}
      />
    </>
  )
}
