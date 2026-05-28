/**
 * @file components/admin-v2/bonuses/grants-feed.tsx
 * @module admin-v2/bonuses
 * @description Grants table with status filter chips. Each row shows the unlock-progress bar
 *              (visual: turnoverProgress / required), kind chip, and clawback action.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Filter, RefreshCw, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { ApiError, formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useBonusGrants } from "./hooks"
import {
  BONUS_KIND_META,
  GRANT_STATUS_META,
  GRANT_STATUSES,
  type BonusGrantStatus,
} from "./types"

const STATUS_FILTERS: ({ id: BonusGrantStatus | "ALL"; label: string })[] = [
  { id: "ALL", label: "All" },
  ...GRANT_STATUSES.map((s) => ({ id: s, label: GRANT_STATUS_META[s].label })),
]

export function GrantsFeed() {
  const [statusFilter, setStatusFilter] = React.useState<BonusGrantStatus | "ALL">("ALL")
  const q = useBonusGrants({ status: statusFilter === "ALL" ? undefined : statusFilter })
  const rows = q.data?.rows ?? []
  const byStatus = q.data?.byStatus

  async function handleClawback(grantId: string) {
    const reason = window.prompt("Clawback reason for audit log?")
    if (!reason || !reason.trim()) return
    try {
      const res = await fetch(`/api/admin/bonuses/grants/${grantId}/clawback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Clawback failed (${res.status})`, res.status)
      }
      await q.mutate()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Clawback failed")
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
        <Filter className="ml-1 h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                statusFilter === f.id
                  ? "bg-white/[0.08] text-[var(--v2-text)]"
                  : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]",
              )}
            >
              {f.label}
              {f.id !== "ALL" && byStatus ? (
                <span className="ml-1 font-mono text-[10px] text-[var(--v2-text-faint)]">
                  {byStatus[f.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void q.mutate()}
          className="ml-auto border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="v2-card overflow-hidden">
        {q.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No grants yet"
            description="Issue your first grant from a rule, or run a bulk campaign."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {rows.map((row) => {
              const meta = BONUS_KIND_META[row.ruleKind]
              const statusMeta = GRANT_STATUS_META[row.status]
              const pct = (row.unlockProgress * 100).toFixed(0)
              return (
                <li key={row.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-xs">
                  <span className="col-span-3 min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--v2-text)]">
                      {row.userName ?? "—"}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--v2-text-faint)]">
                      {row.clientId ?? row.userId.slice(0, 8)}
                    </div>
                  </span>
                  <span className="col-span-2">
                    <span
                      className={cn(
                        "v2-pill",
                        meta.tone === "info"
                          ? "v2-pill-info"
                          : meta.tone === "success"
                            ? "v2-pill-success"
                            : meta.tone === "warning"
                              ? "v2-pill-warning"
                              : "v2-pill-neutral",
                      )}
                    >
                      {meta.label}
                    </span>
                    <div className="mt-0.5 truncate text-[10px] text-[var(--v2-text-mute)]">
                      {row.ruleName}
                    </div>
                  </span>
                  <span className="col-span-2 text-right">
                    <div className="v2-num text-sm font-semibold text-[var(--v2-text)]">
                      {formatInr(row.amount)}
                    </div>
                    <div className="text-[10px] text-[var(--v2-text-faint)]">
                      {formatRelativeIst(row.grantedAt)}
                    </div>
                  </span>
                  <span className="col-span-3">
                    <div className="flex items-baseline justify-between gap-2 text-[10px] text-[var(--v2-text-mute)]">
                      <span>
                        {formatInr(row.turnoverProgress)} / {formatInr(row.turnoverRequired)}
                      </span>
                      <span className="font-mono text-[var(--v2-text-faint)]">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                          row.status === "UNLOCKED"
                            ? "from-[var(--v2-gain)] to-[#5BC1FF]"
                            : "from-[var(--v2-cobalt)] to-[var(--v2-violet)]",
                        )}
                        style={{ width: `${Math.min(100, Number(pct))}%` }}
                      />
                    </div>
                  </span>
                  <span className="col-span-1 text-center">
                    <span
                      className={cn(
                        "v2-pill",
                        statusMeta.tone === "success"
                          ? "v2-pill-success"
                          : statusMeta.tone === "warning"
                            ? "v2-pill-warning"
                            : statusMeta.tone === "danger"
                              ? "v2-pill-danger"
                              : "v2-pill-info",
                      )}
                    >
                      {statusMeta.label}
                    </span>
                  </span>
                  <span className="col-span-1 text-right">
                    {row.status === "ACTIVE" || row.status === "UNLOCKED" ? (
                      <button
                        type="button"
                        onClick={() => handleClawback(row.id)}
                        title="Clawback"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(255,77,107,0.25)] bg-[var(--v2-loss-soft)] text-[var(--v2-loss)] transition-colors hover:bg-[rgba(255,77,107,0.18)]"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
