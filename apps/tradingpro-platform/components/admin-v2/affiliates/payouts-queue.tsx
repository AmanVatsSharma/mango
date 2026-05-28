/**
 * @file components/admin-v2/affiliates/payouts-queue.tsx
 * @module admin-v2/affiliates
 * @description Payouts queue — view + transition (APPROVE / MARK_PAID / CANCEL).
 *              MARK_PAID writes the UTR/UPI reference; CANCEL frees the bundled commissions
 *              back into the ACCRUED pool.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Banknote, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useAffiliatePayouts } from "./hooks"
import type { PayoutStatus } from "./types"

const STATUS_TONE: Record<PayoutStatus, string> = {
  PENDING: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
  APPROVED: "border-[var(--v2-cobalt)]/40 bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
  PAID: "border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 text-[#7CF6C5]",
  CANCELLED: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-faint)]",
}

export function PayoutsQueue() {
  const [status, setStatus] = React.useState<PayoutStatus | "">("")
  const [page, setPage] = React.useState(0)
  const list = useAffiliatePayouts({ status: status || undefined, page, limit: 50 })
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  async function transition(payoutId: string, action: "APPROVE" | "MARK_PAID" | "CANCEL") {
    setError(null)
    let body: Record<string, unknown> = { action }
    if (action === "MARK_PAID") {
      const ref = window.prompt("UTR / UPI txn id (optional)") ?? ""
      body = { action, reference: ref || null }
    } else if (action === "CANCEL") {
      const reason = window.prompt("Reason for cancel:")
      if (!reason || !reason.trim()) return
      body = { action, reason }
    } else if (action === "APPROVE") {
      if (!window.confirm("Approve this payout? Children move to PAYABLE.")) return
    }
    setBusy(payoutId)
    try {
      const res = await fetch(`/api/admin/affiliates/payouts/${payoutId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `Failed (${res.status})`)
      await list.mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value as PayoutStatus | ""); setPage(0) }} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]">
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {total} payout{total === 1 ? "" : "s"}
        </span>
      </div>

      {error && <p className="mb-2 text-xs font-medium text-[var(--v2-loss)]">{error}</p>}

      {list.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payouts…
        </div>
      ) : list.error ? (
        <div className="v2-card p-4 text-sm font-medium text-[var(--v2-loss)]">Failed to load.</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No payouts"
          description="Create a payout from any affiliate's detail drawer to start the queue."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Affiliate</th>
                  <th className="px-3 py-2.5 text-right">Items</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-3 py-2.5 text-right">TDS</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Reference</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
                      {formatRelativeIst(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="v2-num text-[var(--v2-text)]">{r.affiliate?.affiliateCode ?? "—"}</div>
                      <div className="text-[10px] text-[var(--v2-text-faint)]">{r.affiliate?.name ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text)]">
                      {r._count?.commissions ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-text)]">
                      {formatInr(r.grossAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-warning)]">
                      {formatInr(r.tdsAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-gain)]">
                      {formatInr(r.netAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", STATUS_TONE[r.status])}>
                        {r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
                      {r.reference ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {r.status === "PENDING" && (
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => transition(r.id, "APPROVE")}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--v2-cobalt)]/40 bg-[var(--v2-cobalt-soft)] px-2 py-1 text-[10px] font-semibold text-[#9DB6FF] hover:brightness-110 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                        )}
                        {r.status === "APPROVED" && (
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => transition(r.id, "MARK_PAID")}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 px-2 py-1 text-[10px] font-semibold text-[#7CF6C5] hover:bg-[var(--v2-gain)]/15 disabled:opacity-50"
                          >
                            <Banknote className="h-3 w-3" /> Mark paid
                          </button>
                        )}
                        {(r.status === "PENDING" || r.status === "APPROVED") && (
                          <button
                            type="button"
                            disabled={busy === r.id}
                            onClick={() => transition(r.id, "CANCEL")}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 px-2 py-1 text-[10px] font-semibold text-[#FFB1BC] hover:bg-[var(--v2-loss)]/15 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-2 text-[10px] text-[var(--v2-text-faint)]">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-1">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40">Prev</button>
                <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
