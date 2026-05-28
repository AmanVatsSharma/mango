/**
 * File:        components/admin-v2/withdrawals/row-drawer.tsx
 * Module:      admin-v2/withdrawals
 * Purpose:     Slide-in drawer with the full withdrawal context — risk breakdown, approval
 *              chain, action panel (release / hold / re-evaluate / link to Client 360).
 *
 * Exports:
 *   - RowDrawer — props: { row, onClose, onMutated }
 *
 * Side-effects: POST mutators on action.
 *
 * Key invariants:
 *   - The "Release" button is disabled when the chain has zero REQUIRED steps — chain-complete
 *     means the row has already moved through the financial approve.
 *   - "Manual hold" is disabled when the row is already held; "Re-evaluate" is always live so
 *     ops can re-run the engine after rule edits.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { X, ShieldAlert, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react"
import { postReleaseChain, postHold } from "./hooks"
import type { QueueRow } from "./types"
import { formatInr, formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"

export interface RowDrawerProps {
  row: QueueRow
  onClose: () => void
  onMutated: () => void
}

export function RowDrawer({ row, onClose, onMutated }: RowDrawerProps) {
  const [busy, setBusy] = React.useState<null | "release" | "hold" | "reevaluate">(null)
  const [error, setError] = React.useState<string | null>(null)

  const isHeld = row.heldAt !== null && row.releasedAt === null
  const requiredStep = row.approvalChain.find((s) => s.action === "REQUIRED")
  const chainComplete =
    row.approvalChain.length > 0 && row.approvalChain.every((s) => s.action === "APPROVED")

  async function doRelease() {
    setError(null)
    const note = window.prompt("Optional note for the audit log") ?? undefined
    const isFinal = row.approvalChain.length > 0 && row.approvalChain.filter((s) => s.action === "REQUIRED").length === 1
    const transactionId = isFinal
      ? (window.prompt("Bank rail transactionId (required for final approval)") ?? "").trim()
      : undefined
    if (isFinal && !transactionId) {
      setError("transactionId is required to finalise the approval.")
      return
    }
    setBusy("release")
    try {
      const result = await postReleaseChain({
        withdrawalId: row.id,
        transactionId,
        note,
      })
      onMutated()
      if (result.chainComplete) {
        window.alert("Approval chain complete — financial approval submitted.")
        onClose()
      } else {
        window.alert("Step approved. Next approver required.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed")
    } finally {
      setBusy(null)
    }
  }

  async function doHold() {
    setError(null)
    const reason = window.prompt("Reason for manual hold (optional)") ?? undefined
    setBusy("hold")
    try {
      await postHold({ withdrawalId: row.id, mode: "HOLD", reason })
      onMutated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hold failed")
    } finally {
      setBusy(null)
    }
  }

  async function doReevaluate() {
    setError(null)
    setBusy("reevaluate")
    try {
      await postHold({ withdrawalId: row.id, mode: "REEVALUATE" })
      onMutated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-evaluate failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-full w-full max-w-[640px] flex-col border-l border-white/[0.08] bg-[var(--v2-bg-elev-1)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="v2-pill v2-pill-info">Withdrawal</span>
              {isHeld ? (
                <span className="v2-pill v2-pill-warning">
                  <ShieldAlert className="h-3 w-3" />
                  HELD
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">
              {row.userName ?? "—"}
            </h2>
            <p className="font-mono text-xs text-[var(--v2-text-faint)]">
              {row.clientId ?? row.userId.slice(0, 8)} · {row.id.slice(0, 12)}…
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-[var(--v2-text-mute)] hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section className="grid grid-cols-2 gap-3">
            <Stat label="Amount" value={`₹${formatInr(Number(row.amount))}`} />
            <Stat label="Charges" value={`₹${formatInr(Number(row.charges))}`} />
            <Stat label="Risk score" value={`${row.riskScore} / 100`} tone={row.riskScore >= 50 ? "warn" : "ok"} />
            <Stat label="Status" value={row.status} />
            <Stat label="Bank" value={row.bankMasked ?? "—"} />
            <Stat label="Created" value={formatDateTimeIst(row.createdAt)} />
            {row.heldAt ? <Stat label="Held at" value={formatDateTimeIst(row.heldAt)} /> : null}
            {row.releasedAt ? <Stat label="Released at" value={formatDateTimeIst(row.releasedAt)} /> : null}
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Hold reason
            </h3>
            <p className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-[var(--v2-text)]">
              {row.holdReason ?? "—"}
            </p>
            {row.holdRuleKeys.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {row.holdRuleKeys.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-[var(--v2-text-mute)]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Approval chain
            </h3>
            {row.approvalChain.length === 0 ? (
              <p className="text-xs text-[var(--v2-text-mute)]">
                No chain — low-risk row. Use the standard funds approve flow.
              </p>
            ) : (
              <ol className="space-y-2">
                {row.approvalChain.map((s) => {
                  const tone =
                    s.action === "APPROVED"
                      ? "success"
                      : s.action === "REJECTED"
                        ? "danger"
                        : s.action === "ESCALATED"
                          ? "warning"
                          : "info"
                  return (
                    <li
                      key={s.stepIndex}
                      className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3"
                    >
                      <span className={cn("v2-pill", `v2-pill-${tone}`)}>
                        Step {s.stepIndex + 1} · {s.role}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--v2-text)]">{s.action}</p>
                        {s.approverName ? (
                          <p className="mt-0.5 text-[11px] text-[var(--v2-text-mute)]">
                            by {s.approverName} · {s.at ? formatDateTimeIst(s.at) : "—"}
                          </p>
                        ) : null}
                        {s.note ? (
                          <p className="mt-1 text-[11px] italic text-[var(--v2-text-mute)]">
                            "{s.note}"
                          </p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {error ? (
            <div className="rounded-md border border-[var(--v2-loss)]/40 bg-[var(--v2-loss-soft)] p-3 text-xs text-[var(--v2-loss)]">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.02] px-5 py-3">
          <Link
            href={`/admin-v2/clients/${row.userId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]"
          >
            Open Client 360
            <ExternalLink className="h-3 w-3" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doReevaluate}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--v2-text-mute)] hover:text-[var(--v2-text)] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", busy === "reevaluate" && "animate-spin")} />
              Re-evaluate
            </button>
            <button
              type="button"
              onClick={doHold}
              disabled={busy !== null || isHeld}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-warn)]/40 bg-[var(--v2-warn-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-warn)] hover:opacity-90 disabled:opacity-50"
            >
              <ShieldAlert className="h-3 w-3" />
              Manual hold
            </button>
            <button
              type="button"
              onClick={doRelease}
              disabled={busy !== null || !requiredStep || chainComplete}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--v2-gain)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-bg-deep)] hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" />
              {requiredStep ? `Approve ${requiredStep.role}` : "Chain complete"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "ok" | "warn"
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 v2-num text-sm font-semibold",
          tone === "warn" ? "text-[var(--v2-warn)]" : "text-[var(--v2-text)]",
        )}
      >
        {value}
      </p>
    </div>
  )
}
