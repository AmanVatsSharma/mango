/**
 * File:        components/admin-v2/withdrawals/queue-panel.tsx
 * Module:      admin-v2/withdrawals
 * Purpose:     The risk-aware withdrawal queue. Filter chips top, bulk-select, per-row
 *              risk meter + hold reason + approval-chain progress. Click a row → opens the
 *              row drawer for release / hold / re-evaluate.
 *
 * Exports:
 *   - QueuePanel — props: { filter, onFilterChange }
 *
 * Depends on:
 *   - ./hooks      — useQueue
 *   - ./row-drawer — RowDrawer
 *
 * Side-effects: SWR + bulk POST + per-row mutators (delegated to RowDrawer).
 *
 * Key invariants:
 *   - Bulk-approve UI prompts for ONE transactionId per row (rail reference). Without it the
 *     server endpoint refuses — we mirror that locally to avoid wasted round-trips.
 *   - High-risk rows (riskScore ≥ 50) render with crimson tint + "HELD" pill so the operator
 *     sees the gate at a glance.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import * as React from "react"
import { ShieldAlert, ShieldCheck, Hourglass, CheckCircle2, X } from "lucide-react"
import { useQueue, postBulkApprove } from "./hooks"
import { RowDrawer } from "./row-drawer"
import type { QueueFilter, QueueRow } from "./types"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"

const FILTERS: { id: QueueFilter; label: string; tone: "danger" | "info" | "warning" | "neutral" | "success" }[] = [
  { id: "PENDING_HIGH_RISK", label: "High risk", tone: "danger" },
  { id: "PENDING_LOW_RISK", label: "Low risk", tone: "info" },
  { id: "HELD", label: "Held", tone: "warning" },
  { id: "PROCESSING", label: "Processing", tone: "neutral" },
  { id: "COMPLETED", label: "Completed", tone: "success" },
  { id: "ALL", label: "All", tone: "neutral" },
]

export interface QueuePanelProps {
  filter: QueueFilter
  onFilterChange: (next: QueueFilter) => void
}

export function QueuePanel({ filter, onFilterChange }: QueuePanelProps) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [activeRow, setActiveRow] = React.useState<QueueRow | null>(null)
  const [bulking, setBulking] = React.useState(false)
  const { data, error, isLoading, mutate } = useQueue(filter, search)
  const rows = data?.rows ?? []

  React.useEffect(() => {
    // Filter changed → drop stale selections.
    setSelected(new Set())
  }, [filter])

  const lowRiskSelected = React.useMemo(() => {
    return rows.filter(
      (r) =>
        selected.has(r.id) &&
        r.heldAt === null &&
        r.status === "PENDING" &&
        r.riskScore < 50,
    )
  }, [rows, selected])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkApproveSelected() {
    if (lowRiskSelected.length === 0) return
    const items = lowRiskSelected.map((r) => {
      const txn = window.prompt(
        `Bank rail txnId for ₹${formatInr(Number(r.amount))} → ${r.userName ?? r.userId.slice(0, 8)}`,
      )
      return { withdrawalId: r.id, transactionId: (txn ?? "").trim() }
    })
    const valid = items.filter((i) => i.transactionId.length > 0)
    if (valid.length === 0) return
    setBulking(true)
    try {
      const result = await postBulkApprove(valid)
      window.alert(
        `Bulk approve done.\nApproved: ${result.approved.length}\nSkipped (held): ${result.skippedHeld.length}\nFailed: ${result.failed.length}`,
      )
      setSelected(new Set())
      await mutate()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk approve failed")
    } finally {
      setBulking(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors",
                filter === f.id
                  ? `v2-pill v2-pill-${f.tone === "neutral" ? "info" : f.tone}`
                  : "border border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / clientId / reference"
            className="w-72 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none"
          />
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={bulkApproveSelected}
              disabled={bulking || lowRiskSelected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--v2-cobalt)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              title={
                lowRiskSelected.length === 0
                  ? "Bulk approve only allowed for low-risk PENDING rows"
                  : `Bulk approve ${lowRiskSelected.length} low-risk row(s)`
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bulk approve {lowRiskSelected.length}/{selected.size}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="v2-card rounded-lg p-4 text-sm text-[var(--v2-loss)]">
          {(error as Error).message}
        </div>
      ) : null}

      <div className="v2-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <tr>
                <th className="w-8 px-3 py-2 text-left"></th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Bank</th>
                <th className="px-3 py-2 text-left">Risk</th>
                <th className="px-3 py-2 text-left">Hold reason</th>
                <th className="px-3 py-2 text-left">Chain</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[var(--v2-text-mute)]">
                    Loading queue…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[var(--v2-text-mute)]">
                    No withdrawals match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const held = r.heldAt !== null && r.releasedAt === null
                  const isHigh = r.riskScore >= 50
                  return (
                    <tr
                      key={r.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName === "INPUT") return
                        setActiveRow(r)
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[var(--v2-cobalt-soft)]",
                        held && "bg-[var(--v2-loss-soft)]/60",
                      )}
                    >
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select row"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[var(--v2-text)]">
                          {r.userName ?? "—"}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--v2-text-faint)]">
                          {r.clientId ?? r.userId.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="v2-num font-semibold text-[var(--v2-text)]">
                          ₹{formatInr(Number(r.amount))}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--v2-text-mute)]">
                        {r.bankMasked ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <RiskMeter score={r.riskScore} />
                      </td>
                      <td className="px-3 py-2 max-w-[260px]">
                        {r.holdReason ? (
                          <span className="truncate text-xs text-[var(--v2-text-mute)]" title={r.holdReason}>
                            {r.holdReason}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--v2-text-faint)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <ChainBadge steps={r.approvalChain} />
                      </td>
                      <td className="px-3 py-2">
                        {held ? (
                          <span className="v2-pill v2-pill-warning">
                            <ShieldAlert className="h-3 w-3" />
                            HELD
                          </span>
                        ) : isHigh ? (
                          <span className="v2-pill v2-pill-danger">
                            <ShieldAlert className="h-3 w-3" />
                            REVIEW
                          </span>
                        ) : (
                          <span className="v2-pill v2-pill-info">{r.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--v2-text-mute)]">
                        {formatRelativeIst(r.createdAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeRow ? (
        <RowDrawer
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onMutated={() => mutate()}
        />
      ) : null}
    </div>
  )
}

function RiskMeter({ score }: { score: number }) {
  const tone = score >= 70 ? "danger" : score >= 50 ? "warning" : score >= 25 ? "info" : "success"
  const colorBg =
    tone === "danger"
      ? "bg-[var(--v2-loss)]"
      : tone === "warning"
        ? "bg-[var(--v2-warn)]"
        : tone === "info"
          ? "bg-[var(--v2-cobalt)]"
          : "bg-[var(--v2-gain)]"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("h-full transition-all", colorBg)} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="v2-num text-xs font-semibold text-[var(--v2-text)]">{score}</span>
    </div>
  )
}

function ChainBadge({ steps }: { steps: QueueRow["approvalChain"] }) {
  if (!steps || steps.length === 0) {
    return <span className="text-xs text-[var(--v2-text-faint)]">—</span>
  }
  const approved = steps.filter((s) => s.action === "APPROVED").length
  const rejected = steps.some((s) => s.action === "REJECTED")
  const required = steps.find((s) => s.action === "REQUIRED")
  if (rejected) {
    return (
      <span className="v2-pill v2-pill-danger">
        <X className="h-3 w-3" />
        Rejected
      </span>
    )
  }
  if (!required && approved === steps.length) {
    return (
      <span className="v2-pill v2-pill-success">
        <CheckCircle2 className="h-3 w-3" />
        {approved}/{steps.length}
      </span>
    )
  }
  return (
    <span className="v2-pill v2-pill-info">
      <Hourglass className="h-3 w-3" />
      {approved}/{steps.length} · {required?.role ?? "—"}
    </span>
  )
}

// Re-use ShieldCheck import to silence unused-warning if a future variant needs it.
void ShieldCheck
