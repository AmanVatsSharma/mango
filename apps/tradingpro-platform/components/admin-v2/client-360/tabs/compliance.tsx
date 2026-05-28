/**
 * @file components/admin-v2/client-360/tabs/compliance.tsx
 * @module admin-v2/client-360
 * @description Compliance tab — KYC anti-fraud snapshot for one client. Shows masked PAN/Aadhaar,
 *              document link, AML/Suspicious flags, SLA chips. Inline approve/reject wired to
 *              POST /api/admin/kyc/bulk (single-id mode → identical audit trail to bulk queue).
 *
 *              Reuses:
 *                - jsonFetcher / formatDateTimeIst / formatRelativeIst — admin-v2 helpers.
 *                - StatusPill / EmptyState                            — v2 primitives.
 *                - SuspiciousFlagPicker                                — phase 3 flag library
 *                  (greyed in this surface — managers raise/clear flags from the queue).
 *
 *              Premium aesthetic: v2 brand tokens (cobalt accents, gain/loss for outcomes,
 *              glass cards, IBM Plex Mono numerics). No generic zinc tokens.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 polish: v2 brand re-skin + inline approve/reject.
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { StatusPill, EmptyState } from "@/components/admin-v2/primitives"
import { formatDateTimeIst, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type { UserDetail } from "../types"

interface ComplianceTabProps {
  user: UserDetail
}

function maskPan(pan: string | null | undefined): string {
  if (!pan) return "—"
  if (pan.length < 6) return "•".repeat(pan.length)
  return `${pan.slice(0, 3)}•••${pan.slice(-2)}`
}

function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return "—"
  return `XXXX-XXXX-${aadhaar.slice(-4)}`
}

function slaTone(slaDueAt: string | null | undefined, slaBreachedAt: string | null | undefined): "ok" | "warning" | "danger" {
  if (slaBreachedAt) return "danger"
  if (!slaDueAt) return "ok"
  const due = new Date(slaDueAt).getTime()
  if (Number.isNaN(due)) return "ok"
  const ms = due - Date.now()
  if (ms < 0) return "danger"
  if (ms < 60 * 60 * 1000) return "warning" // <1h to breach
  return "ok"
}

export default function ComplianceTab({ user }: ComplianceTabProps) {
  const kyc = user.kyc
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState<string>("")

  const canActOnKyc = Boolean(kyc?.id) && kyc?.status === "PENDING"

  async function runBulk(status: "APPROVED" | "REJECTED") {
    if (!kyc?.id) return
    setError(null)
    setBusy(status === "APPROVED" ? "approve" : "reject")
    try {
      const res = await fetch("/api/admin/kyc/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kycIds: [kyc.id],
          status,
          reason: reason.trim() || undefined,
        }),
      })
      const body = (await res.json().catch(() => null)) as
        | { succeeded?: number; failed?: number; results?: Array<{ success: boolean; error?: string }> }
        | null
      if (!res.ok) {
        throw new Error(body?.results?.[0]?.error ?? `Failed (${res.status})`)
      }
      if (!body?.succeeded || body.succeeded < 1) {
        throw new Error(body?.results?.[0]?.error ?? "Action did not apply")
      }
      // Refresh user detail (drives every tab) and any open KYC list.
      void globalMutate(`/api/admin/users/${user.id}`)
      void globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/admin/kyc"),
        undefined,
        { revalidate: true },
      )
      setReason("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusy(null)
    }
  }

  if (!kyc) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="No KYC submitted"
          description="The client has not started KYC. Tier remains restricted until submission."
        />
      </div>
    )
  }

  const tone = slaTone(kyc.slaDueAt, kyc.slaBreachedAt)

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Compliance</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              anti-fraud KYC · independent of regulatory AML
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">KYC profile</h2>
        </div>
        {kyc.status && (
          <div className="flex items-center gap-2">
            <StatusPill kind={kyc.status} size="lg" />
          </div>
        )}
      </header>

      {/* Tri-card status panel */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* KYC status + SLA */}
        <div className="v2-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              KYC status
            </h3>
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-[var(--v2-text-mute)]">Submitted</dt>
            <dd className="v2-num text-[var(--v2-text)]">{formatDateTimeIst(kyc.submittedAt)}</dd>
            <dt className="text-[var(--v2-text-mute)]">Approved</dt>
            <dd className="v2-num text-[var(--v2-text)]">{formatDateTimeIst(kyc.approvedAt)}</dd>
            <dt className="text-[var(--v2-text-mute)]">SLA due</dt>
            <dd
              className={cn(
                "v2-num font-semibold",
                tone === "danger" && "text-[var(--v2-loss)]",
                tone === "warning" && "text-[var(--v2-warning)]",
                tone === "ok" && "text-[var(--v2-text)]",
              )}
            >
              {kyc.slaDueAt ? formatRelativeIst(kyc.slaDueAt) : "—"}
            </dd>
            <dt className="text-[var(--v2-text-mute)]">SLA breach</dt>
            <dd
              className={cn(
                "v2-num font-semibold",
                kyc.slaBreachedAt ? "text-[var(--v2-loss)]" : "text-[var(--v2-text)]",
              )}
            >
              {kyc.slaBreachedAt ? formatRelativeIst(kyc.slaBreachedAt) : "—"}
            </dd>
          </dl>
        </div>

        {/* AML */}
        <div className="v2-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              AML
            </h3>
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
          </div>
          <StatusPill
            kind={kyc.amlStatus ?? "PENDING"}
            label={`AML ${kyc.amlStatus ?? "PENDING"}`}
            size="lg"
          />
          {kyc.amlFlags && kyc.amlFlags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {kyc.amlFlags.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-[var(--v2-loss)]/30 bg-[var(--v2-loss)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#FF8A99]"
                >
                  {f}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--v2-text-faint)]">No AML flags raised.</p>
          )}
        </div>

        {/* Suspicious / B-book fraud */}
        <div className="v2-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              Suspicious
            </h3>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              B-book signal
            </span>
          </div>
          <StatusPill kind={kyc.suspiciousStatus ?? "REVIEW"} size="lg" />
          <p className="mt-3 text-xs text-[var(--v2-text-faint)]">
            Phase 13 surveillance auto-promotes this on multi-account / latency-arb / bonus-abuse signals.
          </p>
        </div>
      </section>

      {/* Identity + documents */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="v2-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            Identity (masked)
          </h3>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--v2-text-mute)]">PAN</dt>
            <dd className="v2-num text-[var(--v2-text)]">{maskPan(kyc.panNumber)}</dd>
            <dt className="text-[var(--v2-text-mute)]">Aadhaar</dt>
            <dd className="v2-num text-[var(--v2-text)]">{maskAadhaar(kyc.aadhaarNumber)}</dd>
          </dl>
          <p className="mt-4 text-[11px] text-[var(--v2-text-faint)]">
            Full numbers visible only with{" "}
            <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--v2-text-mute)]">
              admin.users.kyc.sensitive
            </span>
            .
          </p>
        </div>

        <div className="v2-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            <FileText className="h-3.5 w-3.5" /> Documents
          </h3>
          {kyc.bankProofUrl ? (
            <a
              href={kyc.bankProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-3 py-1.5 text-xs font-medium text-[#9DB6FF] hover:brightness-110"
            >
              Bank proof <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          ) : (
            <p className="text-xs text-[var(--v2-text-faint)]">No documents uploaded.</p>
          )}
          <p className="mt-4 text-[11px] text-[var(--v2-text-faint)]">
            The full zoom / rotate / side-by-side viewer lives in the Compliance Workbench at{" "}
            <a
              href="/admin-v2/kyc"
              className="text-[#9DB6FF] underline-offset-4 hover:underline"
            >
              /admin-v2/kyc
            </a>
            .
          </p>
        </div>
      </section>

      {/* Inline approve / reject */}
      <section
        className={cn(
          "v2-card p-4",
          canActOnKyc && "ring-1 ring-[var(--v2-border-accent)]",
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            Decision
          </h3>
          {!canActOnKyc && (
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              {kyc.status === "APPROVED"
                ? "already approved"
                : kyc.status === "REJECTED"
                  ? "already rejected"
                  : "no action available"}
            </span>
          )}
        </div>

        {canActOnKyc ? (
          <div className="space-y-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason / note (optional — recorded on KycReviewLog + TradingLog)"
              rows={2}
              className="w-full resize-none rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"
              disabled={busy !== null}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-[var(--v2-text-faint)]">
                Writes one{" "}
                <span className="font-mono text-[var(--v2-text-mute)]">KycReviewLog</span> +{" "}
                <span className="font-mono text-[var(--v2-text-mute)]">TradingLog</span> + queues a notification.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runBulk("REJECTED")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 px-3 py-1.5 text-xs font-semibold text-[#FFB1BC] transition-colors hover:bg-[var(--v2-loss)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => runBulk("APPROVED")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 px-3 py-1.5 text-xs font-semibold text-[#7CF6C5] transition-colors hover:bg-[var(--v2-gain)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--v2-text-faint)]">
            Re-open or reset KYC from{" "}
            <a
              href="/admin-v2/kyc"
              className="text-[#9DB6FF] underline-offset-4 hover:underline"
            >
              the Compliance Workbench
            </a>{" "}
            — the inline action only handles PENDING submissions.
          </p>
        )}

        {error && (
          <p className="mt-3 text-xs font-medium text-[var(--v2-loss)]">{error}</p>
        )}
      </section>
    </div>
  )
}
