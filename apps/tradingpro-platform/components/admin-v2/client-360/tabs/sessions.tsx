/**
 * @file components/admin-v2/client-360/tabs/sessions.tsx
 * @module admin-v2/client-360
 * @description Sessions tab — list active session records for one client + revoke per JTI
 *              (or revoke-all). Reuses /api/admin/session-security/sessions (read = admin.session-security.read,
 *              revoke = admin.session-security.manage). Each revoke writes an authLogger
 *              SESSION_INVALIDATED event server-side, so the audit trail mirrors v1.
 *
 *              Premium aesthetic: v2 brand tokens, kind chips colour-mapped (web vs mobile vs
 *              registration sighting), IBM Plex Mono numerics on timestamps, JTIs, and IPs.
 *
 *              Phase 14 layers session-recording playback + sensitive-action MFA on top.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 polish: replaces "lands in Phase 14" placeholder with
 *                      the real read+revoke surface (existing API supports it today).
 */

"use client"

import * as React from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { Loader2, LogOut, ShieldOff, Smartphone, Globe, FileQuestion } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { jsonFetcher, formatDateTimeIst, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type { UserDetail } from "../types"

interface SessionsTabProps {
  user: UserDetail
}

type UserSessionKind = "WEB_JWT" | "MOBILE_SESSION_AUTH" | "REGISTRATION_SIGHTING"

interface SessionRow {
  id: string
  jti: string
  userId: string
  kind: UserSessionKind
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
  lastSeenAt: string
  revokedAt?: string | null
  metadata?: Record<string, unknown>
}

interface SessionsResp {
  success: boolean
  data?: { sessions?: SessionRow[]; total?: number; page?: number; limit?: number }
  sessions?: SessionRow[]
}

const KIND_META: Record<UserSessionKind, { label: string; chip: string; icon: React.ReactNode }> = {
  WEB_JWT: {
    label: "Web",
    chip: "border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
    icon: <Globe className="h-3 w-3" />,
  },
  MOBILE_SESSION_AUTH: {
    label: "Mobile",
    chip: "border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 text-[#7CF6C5]",
    icon: <Smartphone className="h-3 w-3" />,
  },
  REGISTRATION_SIGHTING: {
    label: "Sighting",
    chip: "border-white/[0.06] bg-white/[0.03] text-[var(--v2-text-mute)]",
    icon: <FileQuestion className="h-3 w-3" />,
  },
}

function browserOf(ua?: string | null): string {
  if (!ua) return "—"
  if (/Edg\//.test(ua)) return "Edge"
  if (/Chrome\//.test(ua)) return "Chrome"
  if (/Firefox\//.test(ua)) return "Firefox"
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari"
  if (/Mobile/.test(ua)) return "Mobile UA"
  return ua.slice(0, 28) + (ua.length > 28 ? "…" : "")
}

export default function SessionsTab({ user }: SessionsTabProps) {
  const url = `/api/admin/session-security/sessions?userId=${encodeURIComponent(user.id)}&limit=50`
  const q = useSWR<SessionsResp>(url, jsonFetcher, { refreshInterval: 0 })

  const [busyJti, setBusyJti] = React.useState<string | null>(null)
  const [busyAll, setBusyAll] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sessions: SessionRow[] = q.data?.data?.sessions ?? q.data?.sessions ?? []
  const liveSessions = sessions.filter((s) => !s.revokedAt)

  async function revokeOne(jti: string) {
    if (!window.confirm(`Revoke session ${jti.slice(0, 8)}…?`)) return
    setError(null)
    setBusyJti(jti)
    try {
      const res = await fetch("/api/admin/session-security/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ jti, reason: "Revoked from Client 360 Sessions tab" }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message ?? `Failed (${res.status})`)
      }
      void globalMutate(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusyJti(null)
    }
  }

  async function revokeAll() {
    if (
      !window.confirm(
        `Revoke ALL ${liveSessions.length} live session(s) for this client? They will need to log in again.`,
      )
    )
      return
    setError(null)
    setBusyAll(true)
    try {
      const res = await fetch("/api/admin/session-security/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          userId: user.id,
          revokeAllForUser: true,
          reason: "Bulk revoke from Client 360 Sessions tab",
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message ?? `Failed (${res.status})`)
      }
      void globalMutate(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusyAll(false)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-neutral">Sessions</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              registry-backed · revoke writes SESSION_INVALIDATED audit
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">Active sessions</h2>
        </div>
        <button
          type="button"
          onClick={revokeAll}
          disabled={busyAll || liveSessions.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 px-2.5 py-1 text-[11px] font-semibold text-[#FFB1BC] transition-colors hover:bg-[var(--v2-loss)]/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldOff className="h-3 w-3" />
          {busyAll ? "Revoking…" : `Revoke all (${liveSessions.length})`}
        </button>
      </header>

      {q.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
        </div>
      ) : q.error ? (
        <div className="v2-card p-4 text-sm">
          <p className="font-medium text-[var(--v2-loss)]">Failed to load sessions.</p>
          <p className="mt-1 text-xs text-[var(--v2-text-faint)]">
            Requires <span className="font-mono">admin.session-security.read</span>. If you don't
            have it, ask a super-admin to grant the permission.
          </p>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No session records"
          description="The client has never logged in (or session records have been pruned by retention policy)."
        />
      ) : (
        <div className="v2-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">Kind</th>
                  <th className="px-3 py-2.5">JTI</th>
                  <th className="px-3 py-2.5">IP</th>
                  <th className="px-3 py-2.5">UA</th>
                  <th className="px-3 py-2.5">First seen</th>
                  <th className="px-3 py-2.5">Last seen</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const meta = KIND_META[s.kind] ?? KIND_META.REGISTRATION_SIGHTING
                  const revoked = Boolean(s.revokedAt)
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-white/[0.04] hover:bg-white/[0.02]",
                        revoked && "opacity-60",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${meta.chip}`}
                        >
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
                        {s.jti.slice(0, 12)}…
                      </td>
                      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
                        {s.ipAddress ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--v2-text-mute)]">
                        {browserOf(s.userAgent)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
                        {formatDateTimeIst(s.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text)]">
                        {formatRelativeIst(s.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        {revoked ? (
                          <span className="text-[var(--v2-loss)]">
                            revoked{" "}
                            <span className="text-[var(--v2-text-faint)]">
                              {formatRelativeIst(s.revokedAt)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--v2-gain)]">live</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {revoked ? null : (
                          <button
                            type="button"
                            onClick={() => revokeOne(s.jti)}
                            disabled={busyJti === s.jti}
                            className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-loss)]/40 hover:text-[#FFB1BC] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <LogOut className="h-3 w-3" />
                            {busyJti === s.jti ? "…" : "Revoke"}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-[var(--v2-loss)]">{error}</p>
      )}

      <p className="text-[11px] text-[var(--v2-text-faint)]">
        Phase 14 layers session-recording playback + sensitive-action MFA on top of this view
        (replay an admin's actions for compliance review).
      </p>
    </div>
  )
}
