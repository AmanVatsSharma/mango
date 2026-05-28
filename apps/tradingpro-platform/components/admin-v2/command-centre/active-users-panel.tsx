/**
 * @file components/admin-v2/command-centre/active-users-panel.tsx
 * @module admin-v2/command-centre
 * @description Live active-users sidebar — names + open positions + today's P&L + margin used %.
 *              Click any user to filter the trades table to their positions; click their name
 *              to open Client 360 in a drawer.
 *
 *              Exports: default ActiveUsersPanel — props { onPickUser, activeUserId }.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Activity, ChevronRight } from "lucide-react"
import { formatInr } from "@/lib/admin-v2/api-client"
import { useActiveUsers } from "./hooks"
import type { ActiveUserRow } from "./types"

interface ActiveUsersPanelProps {
  onPickUser: (user: ActiveUserRow) => void
  activeUserId: string | null
}

export default function ActiveUsersPanel({
  onPickUser,
  activeUserId,
}: ActiveUsersPanelProps) {
  const q = useActiveUsers()
  const users = q.data?.users ?? []

  return (
    <aside className="v2-card flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[var(--v2-gain)]" />
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Live</h3>
        </div>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          <span className="v2-num text-[var(--v2-text-mute)]">{users.length}</span> traders
        </span>
      </header>
      <div className="flex-1 overflow-y-auto">
        {q.isLoading ? (
          <p className="px-4 py-3 text-xs text-[var(--v2-text-mute)]">Loading…</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[var(--v2-text-faint)]">No live traders.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {users.map((u) => (
              <li
                key={u.userId}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                  activeUserId === u.userId
                    ? "bg-[var(--v2-cobalt-soft)]"
                    : "hover:bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPickUser(u)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden className="v2-dot-live" />
                    <span className="truncate text-[var(--v2-text)]">{u.name ?? "—"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--v2-text-faint)]">
                    <span className="font-mono">
                      {u.clientId ?? u.userId.slice(0, 8)}
                    </span>
                    <span>
                      <span className="v2-num">{u.openPositionsCount}</span> open
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px]">
                    <span
                      className={
                        u.todayNetPnL >= 0 ? "text-[#5DF7BC]" : "text-[#FF8AA0]"
                      }
                    >
                      {formatInr(u.todayNetPnL)} today
                    </span>
                    {u.marginUsedPct != null ? (
                      <span className="text-[var(--v2-text-faint)]">
                        <span className="v2-num">{u.marginUsedPct.toFixed(0)}</span>% margin
                      </span>
                    ) : null}
                  </div>
                </button>
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--v2-text-faint)]" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
