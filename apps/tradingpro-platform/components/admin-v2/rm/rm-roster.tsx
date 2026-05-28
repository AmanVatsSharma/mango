/**
 * @file components/admin-v2/rm/rm-roster.tsx
 * @module admin-v2/rm
 * @description Flat sortable RM roster — name, role, clients, public contact override,
 *              isActive. Click a row to expand the team list inline. Phase 5 ships read-only;
 *              edit (toggle isActive, edit public contact) lands in a follow-up polish pass.
 *
 *              Exports:
 *                - default RmRoster
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import {
  EmptyState,
  StatusPill,
  V2DataTable,
  useV2TableColumnHelper,
} from "@/components/admin-v2/primitives"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useRmList, useRmTeam } from "./hooks"
import type { RmRow } from "./types"

const colHelper = useV2TableColumnHelper<RmRow>()

const COLUMNS = [
  colHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight className="h-3.5 w-3.5 text-[var(--v2-text-faint)] transition-transform group-aria-expanded:rotate-90" />
        <span className="font-medium text-[var(--v2-text)]">{row.original.name ?? "—"}</span>
        <StatusPill
          tone={row.original.role === "ADMIN" ? "info" : "neutral"}
          label={row.original.role}
          size="sm"
        />
        {!row.original.isActive ? <StatusPill kind="INACTIVE" size="sm" /> : null}
      </div>
    ),
  }),
  colHelper.accessor("email", {
    header: "Email",
    cell: (info) => (
      <span className="truncate text-xs text-[var(--v2-text-mute)]">
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  colHelper.accessor("phone", {
    header: "Phone",
    cell: (info) => (
      <span className="font-mono text-xs text-[var(--v2-text-mute)]">
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  colHelper.display({
    id: "clients",
    header: "Clients",
    cell: ({ row }) => (
      <span className="v2-num text-sm font-semibold text-[var(--v2-text)]">
        {row.original.assignedUsersCount}
      </span>
    ),
  }),
  colHelper.display({
    id: "managedBy",
    header: "Reports to",
    cell: ({ row }) => (
      <span className="text-xs text-[var(--v2-text-mute)]">
        {row.original.managedBy?.name ?? "—"}
      </span>
    ),
  }),
  colHelper.display({
    id: "publicContact",
    header: "Public contact",
    cell: ({ row }) => {
      const pc = row.original.rmPublicContact
      if (!pc?.displayName && !pc?.email && !pc?.phone)
        return <span className="text-xs text-[var(--v2-text-faint)]">— default —</span>
      return (
        <span className="text-xs text-[var(--v2-text-mute)]">
          {pc.displayName ?? pc.email ?? pc.phone}
        </span>
      )
    },
  }),
  colHelper.accessor("createdAt", {
    header: "Joined",
    cell: (info) => (
      <span className="text-xs text-[var(--v2-text-faint)]">
        {formatDateTimeIst(info.getValue())}
      </span>
    ),
  }),
] as Parameters<typeof V2DataTable<RmRow>>[0]["columns"]

export default function RmRoster() {
  const list = useRmList()
  const rms = list.data?.rms ?? []
  const [expandedRmId, setExpandedRmId] = React.useState<string | null>(null)

  return (
    <div className="space-y-3">
      <V2DataTable<RmRow>
        data={rms}
        columns={COLUMNS}
        loading={list.isLoading}
        error={list.error ? String(list.error) : undefined}
        onRetry={() => list.mutate()}
        onRowClick={(row) =>
          setExpandedRmId((cur) => (cur === row.id ? null : row.id))
        }
        emptyState={
          <EmptyState
            title="No RMs yet"
            description="Create RM-capable users in v1 (or via Phase 5+ in v2 polish)."
          />
        }
      />
      {expandedRmId ? <RmTeamPanel rmId={expandedRmId} /> : null}
    </div>
  )
}

function RmTeamPanel({ rmId }: { rmId: string }) {
  const team = useRmTeam(rmId)
  const members = team.data?.members ?? []
  return (
    <div className="v2-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--v2-text)]">Team</h3>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          <span className="v2-num text-[var(--v2-text-mute)]">{members.length}</span> shown
        </span>
      </div>
      {team.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--v2-text-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
        </div>
      ) : members.length === 0 ? (
        <p className="text-xs text-[var(--v2-text-faint)]">No clients assigned to this RM.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="truncate font-medium text-[var(--v2-text)]">
                  {m.name ?? "—"}
                </span>
                <span className="block font-mono text-[11px] text-[var(--v2-text-faint)]">
                  {m.clientId ?? m.email ?? m.phone ?? m.id.slice(0, 8)}
                </span>
              </span>
              {!m.isActive ? <StatusPill kind="INACTIVE" size="sm" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
