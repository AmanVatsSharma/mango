/**
 * File:        components/admin-v2/surveillance/queue-panel.tsx
 * Module:      admin-v2/surveillance
 * Purpose:     Surveillance alert queue — filter chips (status + severity + rule), text
 *              search, paginated rows, click → row drawer. KPI hero rendered by the parent
 *              workbench.
 *
 * Exports:
 *   - QueuePanel — props: { onOpenDrawer }
 *
 * Depends on:
 *   - ./hooks      — useAlerts + useSurveillanceRules
 *   - ./severity-pill — SeverityPill, ConfidenceMeter
 *
 * Side-effects: SWR reads only — actions live in row-drawer.
 *
 * Key invariants:
 *   - Default filter is status=OPEN — the queue is a *to-do list*, not a history viewer.
 *   - Pagination is 25/page; keepPreviousData on the SWR hook keeps the table stable on
 *     filter swaps.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import { Search, ShieldAlert } from "lucide-react"
import { useAlerts, useSurveillanceRules } from "./hooks"
import { SeverityPill, ConfidenceMeter } from "./severity-pill"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import type {
  SurveillanceFilter,
  SurveillanceSeverity,
  SurveillanceAlertStatus,
  SurveillanceQueueRow,
} from "./types"

const STATUS_OPTIONS: { id: SurveillanceFilter["status"]; label: string }[] = [
  { id: "OPEN", label: "Open" },
  { id: "ASSIGNED", label: "Assigned" },
  { id: "INVESTIGATING", label: "Investigating" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "DISMISSED", label: "Dismissed" },
  { id: "ANY", label: "Any" },
]

const SEVERITY_OPTIONS: { id: SurveillanceFilter["severity"]; label: string }[] = [
  { id: "ANY", label: "Any severity" },
  { id: "CRITICAL", label: "Critical" },
  { id: "HIGH", label: "High" },
  { id: "MEDIUM", label: "Medium" },
  { id: "LOW", label: "Low" },
]

const STATUS_TONE: Record<SurveillanceAlertStatus, string> = {
  OPEN: "v2-pill v2-pill-warning",
  ASSIGNED: "v2-pill v2-pill-info",
  INVESTIGATING: "v2-pill v2-pill-info",
  ESCALATED: "v2-pill v2-pill-danger",
  RESOLVED: "v2-pill v2-pill-success",
  DISMISSED: "v2-pill v2-pill-neutral",
}

export interface QueuePanelProps {
  onOpenDrawer: (row: SurveillanceQueueRow) => void
}

export function QueuePanel({ onOpenDrawer }: QueuePanelProps) {
  const [filter, setFilter] = React.useState<SurveillanceFilter>({
    status: "OPEN",
    severity: "ANY",
    ruleKey: "ANY",
    q: "",
  })
  const [page, setPage] = React.useState(1)
  const [debouncedQ, setDebouncedQ] = React.useState("")

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filter.q), 300)
    return () => clearTimeout(t)
  }, [filter.q])

  const { data, error, isLoading } = useAlerts({ ...filter, q: debouncedQ }, page, 25)
  const { data: rulesData } = useSurveillanceRules()
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / 25))

  return (
    <section className="v2-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setFilter((f) => ({ ...f, status: opt.id }))
                setPage(1)
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                filter.status === opt.id
                  ? "border-[var(--v2-border-accent)] bg-white/[0.06] text-[var(--v2-text)]"
                  : "border-white/[0.08] bg-transparent text-[var(--v2-text-mute)] hover:bg-white/[0.04]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Severity"
          value={filter.severity}
          onChange={(e) =>
            setFilter((f) => ({ ...f, severity: e.target.value as SurveillanceFilter["severity"] }))
          }
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-[var(--v2-text)] outline-none focus:border-[var(--v2-border-accent)]"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s.id} value={s.id} className="bg-[var(--v2-bg-deep)]">
              {s.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Rule"
          value={filter.ruleKey}
          onChange={(e) =>
            setFilter((f) => ({ ...f, ruleKey: e.target.value as SurveillanceFilter["ruleKey"] }))
          }
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-[var(--v2-text)] outline-none focus:border-[var(--v2-border-accent)]"
        >
          <option value="ANY" className="bg-[var(--v2-bg-deep)]">
            Any rule
          </option>
          {rulesData?.rules.map((r) => (
            <option key={r.ruleKey} value={r.ruleKey} className="bg-[var(--v2-bg-deep)]">
              {r.name}
            </option>
          ))}
        </select>

        <div className="relative ml-auto flex-1 min-w-[260px] max-w-[440px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--v2-text-mute)]" />
          <input
            type="search"
            placeholder="Search message, name, email, phone…"
            value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-[var(--v2-text)] outline-none placeholder:text-[var(--v2-text-mute)] focus:border-[var(--v2-border-accent)]"
          />
        </div>
      </div>

      {error ? (
        <div className="v2-card border-[var(--v2-loss)] bg-[var(--v2-loss-soft)] p-4 text-sm text-[var(--v2-loss)]">
          Failed to load alerts: {String((error as Error).message ?? error)}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
              <th className="px-2 py-2 font-medium">Severity</th>
              <th className="px-2 py-2 font-medium">Confidence</th>
              <th className="px-2 py-2 font-medium">Rule</th>
              <th className="px-2 py-2 font-medium">User</th>
              <th className="px-2 py-2 font-medium">Message</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-[var(--v2-text-mute)]">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[var(--v2-text-mute)]">
                  <ShieldAlert className="mx-auto mb-2 h-5 w-5 opacity-60" />
                  No alerts match this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onOpenDrawer(r)}
                  className="cursor-pointer border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-2 py-2">
                    <SeverityPill severity={r.severity} />
                  </td>
                  <td className="px-2 py-2">
                    <ConfidenceMeter score={r.confidenceScore} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-xs font-medium text-[var(--v2-text)]">
                      {r.ruleName}
                    </div>
                    <div className="text-[10px] text-[var(--v2-text-mute)] font-mono">
                      {r.ruleKey}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-xs text-[var(--v2-text)]">
                      {r.user.name ?? "—"}
                    </div>
                    <div className="text-[10px] text-[var(--v2-text-mute)]">
                      {r.user.email ?? r.user.phone ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-2 max-w-[420px]">
                    <div className="truncate text-xs text-[var(--v2-text)]">{r.message}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span className={STATUS_TONE[r.status]}>{r.status}</span>
                  </td>
                  <td className="px-2 py-2 text-[10px] text-[var(--v2-text-mute)]">
                    {formatRelativeIst(new Date(r.createdAt))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--v2-text-mute)]">
        <span>
          {total} {total === 1 ? "alert" : "alerts"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[var(--v2-text-mute)] disabled:opacity-30"
          >
            Prev
          </button>
          <span>
            {page} / {lastPage}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[var(--v2-text-mute)] disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
