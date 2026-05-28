/**
 * @file components/admin-v2/affiliates/attributions-feed.tsx
 * @module admin-v2/affiliates
 * @description Attribution feed — shows who is referred by which affiliate. Live filter
 *              defaults to "live only" (excludes expired + replaced). Manual re-attribution
 *              modal launches from the row action.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { ArrowLeftRight, Loader2 } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { formatDateTimeIst, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { useAffiliateAttributions } from "./hooks"

export function AttributionsFeed() {
  const [liveOnly, setLiveOnly] = React.useState(true)
  const [source, setSource] = React.useState<string>("")
  const [page, setPage] = React.useState(0)
  const list = useAffiliateAttributions({ liveOnly, source: source || undefined, page, limit: 50 })
  const [reAttrFor, setReAttrFor] = React.useState<{ userId: string; name: string } | null>(null)

  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--v2-text-mute)]">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => { setLiveOnly(e.target.checked); setPage(0) }}
            className="accent-[var(--v2-cobalt)]"
          />
          Live only
        </label>
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(0) }} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-xs text-[var(--v2-text)]">
          <option value="">Any source</option>
          <option value="URL">URL</option>
          <option value="PROMO_CODE">Promo code</option>
          <option value="MANUAL_ADMIN">Manual admin</option>
          <option value="API">API</option>
        </select>
        <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {total} attribution{total === 1 ? "" : "s"}
        </span>
      </div>

      {list.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading attributions…
        </div>
      ) : list.error ? (
        <div className="v2-card p-4 text-sm font-medium text-[var(--v2-loss)]">Failed to load.</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No attributions"
          description="Clients lacking an affiliate attribution either signed up directly or via a User-to-User referral (separate system)."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">First touch</th>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Affiliate</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">UTM</th>
                  <th className="px-3 py-2.5">Expires</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
                      {formatRelativeIst(r.firstTouchAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/admin-v2/clients/${r.userId}`}
                        className="text-[var(--v2-text)] hover:underline"
                      >
                        {r.user?.name ?? r.user?.email ?? r.userId.slice(0, 8)}
                      </a>
                      <div className="text-[10px] v2-num text-[var(--v2-text-faint)]">{r.user?.clientId ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="v2-num text-[var(--v2-text)]">{r.affiliate?.affiliateCode ?? "—"}</div>
                      <div className="text-[10px] text-[var(--v2-text-faint)]">{r.affiliate?.name ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-[var(--v2-text-mute)]">
                      {r.source}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-[var(--v2-text-faint)]">
                      {r.utm ? Object.values(r.utm).filter(Boolean).slice(0, 2).join(" · ") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
                      {r.expiresAt ? formatDateTimeIst(r.expiresAt) : "no expiry"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setReAttrFor({ userId: r.userId, name: r.user?.name ?? r.user?.email ?? r.userId.slice(0, 8) })}
                        className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-warning)]/40 hover:text-[#FFD995]"
                      >
                        <ArrowLeftRight className="h-3 w-3" /> Re-attribute
                      </button>
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

      {reAttrFor && (
        <ReAttributeModal
          userId={reAttrFor.userId}
          userLabel={reAttrFor.name}
          onClose={() => setReAttrFor(null)}
          onSaved={() => {
            setReAttrFor(null)
            void list.mutate()
          }}
        />
      )}
    </>
  )
}

function ReAttributeModal({ userId, userLabel, onClose, onSaved }: {
  userId: string
  userLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [code, setCode] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch("/api/admin/affiliates/attributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "REATTRIBUTE",
          userId,
          affiliateCode: code.trim(),
          reason: reason.trim(),
        }),
      })
      const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `Failed (${res.status})`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="v2-card w-full max-w-md p-5">
        <h3 className="mb-1 text-base font-semibold text-[var(--v2-text)]">Re-attribute {userLabel}</h3>
        <p className="mb-3 text-xs text-[var(--v2-text-faint)]">
          Writes a new attribution row + emits a TradingLog audit entry. Old row is removed but
          its existence is preserved in the audit chain.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">New affiliate code *</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AFF-XXXXXXXX"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-mono text-xs text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">Reason *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., dispute resolution, attribution-window override, IB-A absorbed by IB-B"
              rows={3}
              className="w-full resize-none rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"
              required
            />
          </label>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-[var(--v2-loss)]">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]">
            Cancel
          </button>
          <button type="submit" disabled={busy || !code.trim() || !reason.trim()} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 px-3 py-1.5 text-xs font-semibold text-[#FFD995] hover:bg-[var(--v2-warning)]/15 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Re-attribute
          </button>
        </div>
      </form>
    </div>
  )
}
