/**
 * File:        components/admin-v2/surveillance/row-drawer.tsx
 * Module:      admin-v2/surveillance
 * Purpose:     Slide-in drawer with the full alert detail + action buttons.
 *              Single-writer rule applies — actions here mutate ONLY the alert row,
 *              never the underlying winner-control / bonus-grant / withdrawal source state.
 *              "Open Client 360" is the bridge to the source-state mitigation flows.
 *
 * Exports:
 *   - RowDrawer — props: { alertId | null, onClose, onMutated }
 *
 * Depends on:
 *   - ./hooks   — useAlertDetail + postAlertAction
 *   - ./severity-pill
 *
 * Side-effects: SWR fetch + POST mutators.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import {
  X,
  CheckCircle2,
  ShieldOff,
  UserCheck,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { useAlertDetail, postAlertAction } from "./hooks"
import { SeverityPill, ConfidenceMeter } from "./severity-pill"
import { formatRelativeIst, ApiError } from "@/lib/admin-v2/api-client"

interface RowDrawerProps {
  alertId: string | null
  onClose: () => void
  onMutated?: () => void
}

export function RowDrawer({ alertId, onClose, onMutated }: RowDrawerProps) {
  const { data, isLoading, mutate } = useAlertDetail(alertId)
  const [actioning, setActioning] = React.useState<null | "assign" | "dismiss" | "resolve">(null)
  const [dismissReason, setDismissReason] = React.useState("")
  const [resolveNote, setResolveNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setError(null)
    setDismissReason("")
    setResolveNote("")
  }, [alertId])

  if (!alertId) return null

  async function run(action: "assign" | "dismiss" | "resolve") {
    if (!alertId) return
    setActioning(action)
    setError(null)
    try {
      if (action === "assign") {
        await postAlertAction(alertId, { action: "assign" })
      } else if (action === "dismiss") {
        if (!dismissReason.trim()) {
          setError("Dismissal reason is required.")
          setActioning(null)
          return
        }
        await postAlertAction(alertId, { action: "dismiss", reason: dismissReason.trim() })
      } else {
        if (!resolveNote.trim()) {
          setError("Resolution note is required.")
          setActioning(null)
          return
        }
        await postAlertAction(alertId, { action: "resolve", note: resolveNote.trim() })
      }
      await mutate()
      onMutated?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setActioning(null)
    }
  }

  const alert = data?.alert
  const rule = data?.rule

  return (
    <aside
      role="dialog"
      aria-label="Alert detail"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-[640px] overflow-y-auto border-l border-white/[0.06] bg-[var(--v2-bg-deep)] shadow-2xl"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[var(--v2-bg-glass)] px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {alert ? <SeverityPill severity={alert.severity} /> : null}
          <span className="text-xs font-mono text-[var(--v2-text-mute)]">
            {alert?.ruleKey ?? "loading…"}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-[var(--v2-text-mute)] hover:bg-white/[0.06] hover:text-[var(--v2-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-col gap-5 p-5">
        {isLoading && !data ? (
          <div className="flex items-center gap-2 text-xs text-[var(--v2-text-mute)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : null}

        {alert ? (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                {rule?.name ?? alert.ruleKey}
              </div>
              <h2 className="mt-1 text-base font-semibold text-[var(--v2-text)]">
                {alert.message}
              </h2>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--v2-text-mute)]">
                <span>Confidence:</span>
                <ConfidenceMeter score={alert.confidenceScore} />
                <span className="ml-3">Status: {alert.status}</span>
                <span>· {formatRelativeIst(new Date(alert.createdAt))}</span>
              </div>
              {rule?.description ? (
                <p className="mt-3 text-xs text-[var(--v2-text-mute)]">{rule.description}</p>
              ) : null}
            </div>

            {alert.relatedUser ? (
              <section className="v2-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                  Subject user
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      {alert.relatedUser.name ?? "Unnamed user"}
                    </div>
                    <div className="text-[10px] text-[var(--v2-text-mute)]">
                      {alert.relatedUser.email ?? alert.relatedUser.phone ?? alert.relatedUser.id}
                    </div>
                  </div>
                  <a
                    href={`/admin-v2/clients/${alert.relatedUser.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] text-[var(--v2-text)] hover:border-[var(--v2-border-accent)] hover:bg-white/[0.04]"
                  >
                    Open Client 360 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </section>
            ) : null}

            <section className="v2-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                Evidence
              </div>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-black/30 p-3 text-[10px] leading-relaxed text-[var(--v2-text)]">
                {JSON.stringify(alert.evidence, null, 2)}
              </pre>
            </section>

            {alert.relatedWithdrawalId ||
            alert.relatedTransactionId ||
            alert.relatedBonusGrantId ||
            alert.relatedAffiliateId ? (
              <section className="v2-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                  Linked artefacts
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[var(--v2-text-mute)]">
                  {alert.relatedWithdrawalId ? (
                    <li>
                      Withdrawal{" "}
                      <span className="font-mono text-[var(--v2-text)]">
                        {alert.relatedWithdrawalId.slice(0, 8)}…
                      </span>
                    </li>
                  ) : null}
                  {alert.relatedTransactionId ? (
                    <li>
                      Transaction{" "}
                      <span className="font-mono text-[var(--v2-text)]">
                        {alert.relatedTransactionId.slice(0, 8)}…
                      </span>
                    </li>
                  ) : null}
                  {alert.relatedBonusGrantId ? (
                    <li>
                      Bonus grant{" "}
                      <span className="font-mono text-[var(--v2-text)]">
                        {alert.relatedBonusGrantId.slice(0, 8)}…
                      </span>
                    </li>
                  ) : null}
                  {alert.relatedAffiliateId ? (
                    <li>
                      Affiliate{" "}
                      <span className="font-mono text-[var(--v2-text)]">
                        {alert.relatedAffiliateId.slice(0, 8)}…
                      </span>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <section className="v2-card flex flex-col gap-3 p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                Actions
              </div>

              <button
                type="button"
                onClick={() => run("assign")}
                disabled={!!actioning || alert.status === "ASSIGNED"}
                className="flex items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--v2-text)] hover:border-[var(--v2-border-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actioning === "assign" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                Assign to me
              </button>

              <div className="flex flex-col gap-2 rounded-md border border-white/[0.06] p-3">
                <label className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                  Dismiss (false positive / not actionable)
                </label>
                <input
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  placeholder="Reason (e.g. legitimate IB device sharing)"
                  maxLength={255}
                  className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-xs outline-none focus:border-[var(--v2-border-accent)]"
                />
                <button
                  type="button"
                  onClick={() => run("dismiss")}
                  disabled={!!actioning || !dismissReason.trim()}
                  className="flex items-center justify-center gap-2 self-end rounded-md border border-white/[0.08] bg-[var(--v2-loss-soft)] px-3 py-1.5 text-xs font-medium text-[var(--v2-loss)] hover:bg-[var(--v2-loss-soft)]/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {actioning === "dismiss" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5" />
                  )}
                  Dismiss
                </button>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-white/[0.06] p-3">
                <label className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                  Resolve (action taken on source state via the appropriate module)
                </label>
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="What did you do? e.g. 'Manually demoted winner-control rung; admin warned via Comms.'"
                  maxLength={2000}
                  rows={3}
                  className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-xs outline-none focus:border-[var(--v2-border-accent)]"
                />
                <button
                  type="button"
                  onClick={() => run("resolve")}
                  disabled={!!actioning || !resolveNote.trim()}
                  className="flex items-center justify-center gap-2 self-end rounded-md border border-white/[0.08] bg-[var(--v2-gain-soft)] px-3 py-1.5 text-xs font-medium text-[var(--v2-gain)] hover:bg-[var(--v2-gain-soft)]/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {actioning === "resolve" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Mark resolved
                </button>
              </div>

              {error ? (
                <div className="rounded-md border border-[var(--v2-loss)] bg-[var(--v2-loss-soft)] px-3 py-2 text-xs text-[var(--v2-loss)]">
                  {error}
                </div>
              ) : null}

              {alert.status === "DISMISSED" && alert.dismissReason ? (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-[var(--v2-text-mute)]">
                  Dismissed by {alert.dismissedBy?.name ?? "—"}: {alert.dismissReason}
                </div>
              ) : null}
              {alert.status === "RESOLVED" && alert.resolutionNote ? (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-[var(--v2-text-mute)]">
                  Resolved {alert.resolvedAt ? formatRelativeIst(new Date(alert.resolvedAt)) : ""}:{" "}
                  {alert.resolutionNote}
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  )
}
