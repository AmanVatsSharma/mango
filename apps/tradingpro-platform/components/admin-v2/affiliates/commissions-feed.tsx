/**
 * @file components/admin-v2/affiliates/commissions-feed.tsx
 * @module admin-v2/affiliates
 * @description Global commissions feed — paginated, filterable by status / kind / affiliate.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useAffiliateCommissions } from "./hooks"
import type { CommissionStatus, Kind } from "./types"

const STATUS_TONE: Record<CommissionStatus, string> = {
  ACCRUED: "border-[var(--v2-cobalt)]/40 bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
  PAYABLE: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
  PAID: "border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 text-[#7CF6C5]",
  CLAWED_BACK: "border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 text-[#FFB1BC]",
  VOID: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-faint)]",
}

const KIND_TONE: Record<Kind, string> = {
  SPREAD: "text-[var(--v2-cobalt)]",
  LOSS: "text-[var(--v2-loss)]",
  LOT: "text-[var(--v2-warning)]",
  FIXED: "text-[var(--v2-gain)]",
}

export function CommissionsFeed() {
  const [status, setStatus] = React.useState<CommissionStatus | "">("")
  const [kind, setKind] = React.useState<Kind | "">("")
  const [page, setPage] = React.useState(0)
  const list = useAffiliateCommissions({
    status: status || undefined,
    kind: kind || undefined,
    page,
    limit: 50,
  })

  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value as CommissionStatus | ""); setPage(0) }} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]">
          <option value="">Any status</option>
          <option value="ACCRUED">Accrued</option>
          <option value="PAYABLE">Payable</option>
          <option value="PAID">Paid</option>
          <option value="CLAWED_BACK">Clawed back</option>
          <option value="VOID">Void</option>
        </select>
        <select value={kind} onChange={(e) => { setKind(e.target.value as Kind | ""); setPage(0) }} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]">
          <option value="">Any kind</option>
          <option value="SPREAD">Spread</option>
          <option value="LOSS">Loss</option>
          <option value="LOT">Lot</option>
          <option value="FIXED">Fixed</option>
        </select>
        <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {total} rows · sum {formatInr(list.data?.sumGrossRupees ?? 0)} (TDS {formatInr(list.data?.sumTdsRupees ?? 0)})
        </span>
      </div>

      {list.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading commissions…
        </div>
      ) : list.error ? (
        <div className="v2-card p-4 text-sm font-medium text-[var(--v2-loss)]">Failed to load.</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No commissions" description="Commissions accrue post-fill via the order worker. None match the current filter." />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Affiliate</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Kind</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-right">TDS</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Source txn</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
                      {formatRelativeIst(r.accruedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="v2-num text-[var(--v2-text)]">{r.affiliate?.affiliateCode ?? "—"}</div>
                      <div className="text-[10px] text-[var(--v2-text-faint)]">{r.affiliate?.name ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[var(--v2-text)]">{r.sourceUser?.name ?? r.sourceUser?.email ?? r.sourceUserId.slice(0, 8)}</div>
                      <div className="text-[10px] v2-num text-[var(--v2-text-faint)]">{r.sourceUser?.clientId ?? ""}</div>
                    </td>
                    <td className={cn("px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em]", KIND_TONE[r.kind])}>
                      {r.kind}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-text)]">
                      {formatInr(r.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text-mute)]">
                      {formatInr(r.tdsAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", STATUS_TONE[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 v2-num text-[10px] text-[var(--v2-text-faint)]">
                      {r.sourceTransactionId.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pager page={page} totalPages={totalPages} onPage={setPage} />
          )}
        </div>
      )}
    </>
  )
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-2 text-[10px] text-[var(--v2-text-faint)]">
      <span>Page {page + 1} of {totalPages}</span>
      <div className="flex gap-1">
        <button type="button" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40">Prev</button>
        <button type="button" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}
