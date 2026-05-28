/**
 * File:        components/admin-v2/audit/audit-workbench.tsx
 * Module:      admin-v2/audit
 * Purpose:     Phase 15 full Audit Workbench — filterable by source/action/resource/severity/
 *              clientId/date range, paginated table, JSON drill-down dialog, CSV export.
 *              Replaces the Phase 1 placeholder in audit/page.tsx.
 *
 * Exports:
 *   - AuditWorkbench  — no props (self-fetching via useAuditLogs)
 *
 * Depends on:
 *   - @/components/admin-v2/primitives  — KpiTile, StatusPill, EmptyState
 *   - @/lib/admin-v2/api-client         — formatInr, formatDateTimeIst
 *   - ./hooks                           — useAuditLogs
 *   - ./types                           — AuditSource, AuditSeverity, AuditFilters, AuditRow
 *
 * Side-effects:
 *   - SWR polling every 60s on /api/admin/audit
 *   - Creates + revokes a Blob URL on CSV export click
 *
 * Key invariants:
 *   - Filter state is "draft" until the user clicks Search (prevents per-keystroke fetches)
 *   - Pagination resets to page 1 when any filter changes
 *   - JSON drill-down renders raw metadata in a scrollable pre block
 *   - CSV export covers the current page only (matching the visible rows)
 *
 * Read order:
 *   1. AuditWorkbench — top-level state management (draft filters vs committed filters)
 *   2. Filter bar render — source tabs, severity, text inputs, date range
 *   3. Table render — rows, severity pills, drill-down trigger
 *   4. JsonDialog — modal for metadata inspection
 *   5. exportCsv — the blob export helper
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { StatusPill } from "@/components/admin-v2/primitives/status-pill"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useAuditLogs } from "./hooks"
import type { AuditFilters, AuditRow, AuditSeverity, AuditSource } from "./types"

const SEV_TONE: Record<string, "info" | "warning" | "danger" | "neutral"> = {
  INFO: "info",
  WARN: "warning",
  WARNING: "warning",
  ERROR: "danger",
  CRITICAL: "danger",
}

const SEVERITY_OPTIONS: Array<{ value: AuditSeverity | ""; label: string }> = [
  { value: "", label: "All severities" },
  { value: "INFO", label: "Info" },
  { value: "WARN", label: "Warn" },
  { value: "ERROR", label: "Error" },
  { value: "CRITICAL", label: "Critical" },
]

const PAGE_LIMIT = 50

function exportCsv(rows: AuditRow[]) {
  const header = "Timestamp,Source,Severity,Action,Resource,User / Client,Message"
  const body = rows
    .map((r) => {
      const sev = (r.severity ?? r.category ?? "INFO").toUpperCase()
      const who = r.userName ?? r.clientId ?? "system"
      const msg = (r.message ?? r.resource ?? "").replace(/"/g, '""')
      return [
        `"${formatDateTimeIst(r.timestamp)}"`,
        r.source,
        sev,
        `"${r.action.replace(/"/g, '""')}"`,
        `"${(r.resource ?? "").replace(/"/g, '""')}"`,
        `"${who}"`,
        `"${msg}"`,
      ].join(",")
    })
    .join("\n")
  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── JSON Drill-Down Dialog ──────────────────────────────────────────────────

interface JsonDialogProps {
  row: AuditRow | null
  onClose: () => void
}

function JsonDialog({ row, onClose }: JsonDialogProps) {
  if (!row) return null

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const payload = {
    id: row.id,
    timestamp: row.timestamp,
    source: row.source,
    severity: row.severity ?? row.category,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    status: row.status,
    userName: row.userName,
    clientId: row.clientId,
    message: row.message,
    metadata: row.metadata,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="v2-card relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <span className="font-mono text-xs text-[var(--v2-text-mute)]">{row.id}</span>
            <div className="mt-0.5 text-sm font-semibold text-white">{row.action}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--v2-text-mute)] hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <pre className="text-[11px] leading-relaxed text-[var(--v2-text)]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ── Main Workbench ──────────────────────────────────────────────────────────

export function AuditWorkbench() {
  // Draft state: updated on input change
  const [draftSource, setDraftSource] = React.useState<AuditSource>("trading")
  const [draftSeverity, setDraftSeverity] = React.useState<AuditSeverity | "">("")
  const [draftAction, setDraftAction] = React.useState("")
  const [draftClient, setDraftClient] = React.useState("")
  const [draftResource, setDraftResource] = React.useState("")
  const [draftDateFrom, setDraftDateFrom] = React.useState("")
  const [draftDateTo, setDraftDateTo] = React.useState("")

  // Committed state: drives the SWR key
  const [filters, setFilters] = React.useState<AuditFilters>({
    source: "trading",
    page: 1,
    limit: PAGE_LIMIT,
  })

  const [drillRow, setDrillRow] = React.useState<AuditRow | null>(null)

  const { data, isLoading, mutate } = useAuditLogs(filters)
  const logs = data?.logs ?? []
  const totalPages = data?.pages ?? 1

  function commitSearch() {
    setFilters({
      source: draftSource,
      severity: draftSeverity || undefined,
      action: draftAction || undefined,
      clientId: draftClient || undefined,
      resource: draftResource || undefined,
      dateFrom: draftDateFrom || undefined,
      dateTo: draftDateTo || undefined,
      page: 1,
      limit: PAGE_LIMIT,
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitSearch()
  }

  function changePage(delta: number) {
    setFilters((prev) => ({
      ...prev,
      page: Math.max(1, Math.min(totalPages, prev.page + delta)),
    }))
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Audit</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              cross-cutting admin actions · read-only stream
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Audit log
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Every admin action across trading and auth surfaces. Filter by severity, action,
            resource, or client — then drill into raw metadata per row.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            aria-label="Refresh audit log"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--v2-text-mute)] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => exportCsv(logs)}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--v2-text-mute)] transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export page CSV
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Total matching"
          value={(data?.total ?? 0).toLocaleString("en-IN")}
          tone="info"
          loading={isLoading}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiTile
          label="Page"
          value={`${filters.page} / ${totalPages}`}
          tone="neutral"
          loading={isLoading}
        />
        <KpiTile
          label="Per page"
          value={PAGE_LIMIT}
          tone="neutral"
        />
      </section>

      {/* Filter bar */}
      <div className="mb-4 v2-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Source toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Source
            </label>
            <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
              {(["trading", "auth"] as AuditSource[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setDraftSource(s)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize",
                    draftSource === s
                      ? "bg-white/[0.08] text-white"
                      : "text-[var(--v2-text-mute)] hover:text-white",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Severity
            </label>
            <select
              value={draftSeverity}
              onChange={(e) => setDraftSeverity(e.target.value as AuditSeverity | "")}
              className="h-8 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Action
            </label>
            <input
              type="text"
              value={draftAction}
              onChange={(e) => setDraftAction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. ORDER_PLACED"
              className="h-8 w-44 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white placeholder:text-[var(--v2-text-faint)] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {/* Resource */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Resource
            </label>
            <input
              type="text"
              value={draftResource}
              onChange={(e) => setDraftResource(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Order"
              className="h-8 w-36 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white placeholder:text-[var(--v2-text-faint)] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {/* Client ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Client ID
            </label>
            <input
              type="text"
              value={draftClient}
              onChange={(e) => setDraftClient(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="UUID or username"
              className="h-8 w-44 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white placeholder:text-[var(--v2-text-faint)] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              From
            </label>
            <input
              type="date"
              value={draftDateFrom}
              onChange={(e) => setDraftDateFrom(e.target.value)}
              className="h-8 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              To
            </label>
            <input
              type="date"
              value={draftDateTo}
              onChange={(e) => setDraftDateTo(e.target.value)}
              className="h-8 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2.5 text-xs text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {/* Search button */}
          <button
            onClick={commitSearch}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--v2-cobalt)] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>

          {/* Clear filters */}
          <button
            onClick={() => {
              setDraftSeverity("")
              setDraftAction("")
              setDraftClient("")
              setDraftResource("")
              setDraftDateFrom("")
              setDraftDateTo("")
              setFilters({ source: draftSource, page: 1, limit: PAGE_LIMIT })
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-[var(--v2-text-mute)] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="v2-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  When
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Severity
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Action
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Resource
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  User / Client
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  Message
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-2.5">
                          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
                        </td>
                      ))}
                    </tr>
                  ))
                : logs.length === 0
                  ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState title="No audit events match these filters" className="!py-10" />
                      </td>
                    </tr>
                  )
                  : logs.map((row) => {
                    const sev = (row.severity ?? row.category ?? "INFO").toUpperCase()
                    const tone = SEV_TONE[sev] ?? "neutral"
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 v2-num text-[var(--v2-text-mute)]">
                          {formatDateTimeIst(row.timestamp)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill tone={tone} label={sev} size="sm" />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--v2-text)]">
                          {row.action}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--v2-text-mute)]">
                          {row.resource ?? "—"}
                          {row.resourceId ? (
                            <span className="ml-1 text-[10px] text-[var(--v2-text-faint)]">
                              #{row.resourceId.slice(0, 8)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--v2-text-mute)]">
                          {row.userName ?? row.clientId ?? "system"}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-2.5 text-[var(--v2-text-mute)]">
                          {row.message ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setDrillRow(row)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--v2-cobalt)] hover:bg-[var(--v2-cobalt-soft)]"
                          >
                            JSON
                          </button>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
            <span className="text-[11px] text-[var(--v2-text-mute)]">
              Page {filters.page} of {totalPages} · {data?.total ?? 0} total events
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => changePage(-1)}
                disabled={filters.page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--v2-text-mute)] hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => changePage(1)}
                disabled={filters.page >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--v2-text-mute)] hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <JsonDialog row={drillRow} onClose={() => setDrillRow(null)} />
    </div>
  )
}
