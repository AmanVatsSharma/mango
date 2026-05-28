/**
 * @file components/admin-v2/client-360/tabs/audit.tsx
 * @module admin-v2/client-360
 * @description Audit tab — activity timeline (logins, KYC reviews, orders, fund movements,
 *              admin overrides) for one client. Reuses /api/admin/users/[userId]/activity.
 *
 *              Reuses:
 *                - useClientActivity   — admin-v2 hook (SWR 60s).
 *                - EmptyState          — v2 primitive.
 *                - formatDateTimeIst   — admin-v2 helper.
 *
 *              Premium aesthetic: v2 brand tokens, type-coloured timeline dots, IBM Plex Mono
 *              for timestamps. Type chips colour-mapped (login = info, KYC = warning, order = success,
 *              admin override = danger).
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 polish: v2 brand re-skin, type-aware coloring.
 */

"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useClientActivity } from "../hooks"
import type { UserDetail } from "../types"

interface AuditTabProps {
  user: UserDetail
}

interface ActivityRow {
  id: string
  type: string
  message?: string | null
  createdAt: string
  metadata?: Record<string, unknown>
}

/** Map an activity `type` string to a v2 brand colour. Defaults to neutral. */
function typeAccent(type: string): { dot: string; chip: string } {
  const t = type.toUpperCase()
  if (t.includes("LOGIN") || t.includes("SESSION")) {
    return {
      dot: "bg-[var(--v2-cobalt)]",
      chip: "border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
    }
  }
  if (t.includes("KYC") || t.includes("AML") || t.includes("SUSPICIOUS")) {
    return {
      dot: "bg-[var(--v2-warning)]",
      chip: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
    }
  }
  if (t.includes("ORDER") || t.includes("FILL") || t.includes("POSITION")) {
    return {
      dot: "bg-[var(--v2-gain)]",
      chip: "border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 text-[#7CF6C5]",
    }
  }
  if (
    t.includes("REJECT") ||
    t.includes("BLOCK") ||
    t.includes("FREEZE") ||
    t.includes("LIQUIDATE") ||
    t.includes("OVERRIDE") ||
    t.includes("WINNER")
  ) {
    return {
      dot: "bg-[var(--v2-loss)]",
      chip: "border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 text-[#FFB1BC]",
    }
  }
  if (t.includes("BONUS") || t.includes("CREDIT") || t.includes("PROMO")) {
    return {
      dot: "bg-[var(--v2-cobalt)]",
      chip: "border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]",
    }
  }
  return {
    dot: "bg-[var(--v2-text-faint)]",
    chip: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-mute)]",
  }
}

export default function AuditTab({ user }: AuditTabProps) {
  const q = useClientActivity(user.id)
  const rows =
    (q.data as { activities?: ActivityRow[] } | undefined)?.activities ??
    (q.data as { items?: ActivityRow[] } | undefined)?.items ??
    []

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-neutral">Audit</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              client-scoped event timeline · 60s refresh
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">Activity</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          {rows.length} events
        </span>
      </header>

      {q.isLoading ? (
        <div className="v2-card flex items-center gap-2 p-4 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Logins, KYC reviews, order activity, and admin overrides will appear here as they're logged."
        />
      ) : (
        <ol className="relative space-y-2.5 border-l border-white/[0.06] pl-4">
          {rows.map((r) => {
            const accent = typeAccent(r.type)
            return (
              <li key={r.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-[21px] top-2 h-2 w-2 rounded-full ring-2 ring-[var(--v2-bg)] ${accent.dot}`}
                />
                <div className="v2-card p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${accent.chip}`}
                    >
                      {r.type}
                    </span>
                    <span className="v2-num text-[var(--v2-text-faint)]">
                      {formatDateTimeIst(r.createdAt)}
                    </span>
                  </div>
                  {r.message ? (
                    <p className="mt-1.5 text-sm text-[var(--v2-text)]">{r.message}</p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <p className="text-[11px] text-[var(--v2-text-faint)]">
        Phase 15 layers cross-cutting admin audit (who-did-what-when across all clients) on top
        of this per-client view.
      </p>
    </div>
  )
}
