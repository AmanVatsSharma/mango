/**
 * @file components/admin-v2/rm/rm-leaderboard.tsx
 * @module admin-v2/rm
 * @description RM productivity leaderboard. Date-range picker + sortable table:
 *              managed clients · active clients · approved KYCs · tasks completed ·
 *              tasks overdue (open) · notes added.
 *
 *              Exports:
 *                - default RmLeaderboard
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import {
  EmptyState,
  V2DataTable,
  useV2TableColumnHelper,
} from "@/components/admin-v2/primitives"
import { Button } from "@/components/ui/button"
import { useRmLeaderboard } from "./hooks"
import type { LeaderboardRow } from "./types"

const RANGES: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
]

const colHelper = useV2TableColumnHelper<LeaderboardRow>()

const COLUMNS = [
  colHelper.display({
    id: "rm",
    header: "RM",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-[var(--v2-text)]">
          {row.original.rm.name ?? "—"}
        </span>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          {row.original.rm.role}
        </span>
      </div>
    ),
  }),
  colHelper.accessor("managedClients", {
    header: "Managed",
    cell: (info) => <Cell value={info.getValue()} />,
  }),
  colHelper.accessor("activeClients", {
    header: "Active",
    cell: (info) => <Cell value={info.getValue()} tone="success" />,
  }),
  colHelper.accessor("approvedKycs", {
    header: "KYC ✓",
    cell: (info) => <Cell value={info.getValue()} tone="success" />,
  }),
  colHelper.accessor("tasksCompleted", {
    header: "Tasks done",
    cell: (info) => <Cell value={info.getValue()} />,
  }),
  colHelper.accessor("tasksOverdueOpen", {
    header: "Overdue",
    cell: (info) => <Cell value={info.getValue()} tone={info.getValue() > 0 ? "danger" : "neutral"} />,
  }),
  colHelper.accessor("notesAdded", {
    header: "Notes",
    cell: (info) => <Cell value={info.getValue()} />,
  }),
] as Parameters<typeof V2DataTable<LeaderboardRow>>[0]["columns"]

function Cell({
  value,
  tone = "neutral",
}: {
  value: number
  tone?: "success" | "danger" | "neutral"
}) {
  const cls =
    tone === "success"
      ? "text-[#5DF7BC]"
      : tone === "danger"
        ? "text-[#FF8AA0]"
        : "text-[var(--v2-text)]"
  return <span className={`v2-num text-sm font-semibold ${cls}`}>{value}</span>
}

export default function RmLeaderboard() {
  const [days, setDays] = React.useState(30)

  const range = React.useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [days])

  const q = useRmLeaderboard(range.from, range.to)
  const rows = q.data?.rows ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant="outline"
              onClick={() => setDays(r.days)}
              className={
                days === r.days
                  ? "v2-btn-cta"
                  : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
              }
            >
              {r.label}
            </Button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          Productivity over the last <span className="v2-num">{days}</span> days · refreshes every 5
          min
        </span>
      </div>

      <V2DataTable<LeaderboardRow>
        data={rows}
        columns={COLUMNS}
        loading={q.isLoading}
        error={q.error ? String(q.error) : undefined}
        onRetry={() => q.mutate()}
        emptyState={<EmptyState title="No RM activity in this window" />}
      />
    </div>
  )
}
