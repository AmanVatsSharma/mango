"use client"

/**
 * @file active-users-panel.tsx
 * @module admin-console/trades-blotter
 * @description Top-left cell of the Trades command center. Searchable, bounded-scroll list of active
 *              users with per-row mini-stats (open count, today P&L, margin %). Click opens a user tab.
 * @author StockTrade
 * @created 2026-04-15
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, Users } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ActiveUserRow, ActiveUsersResponse } from "@/app/api/admin/trades/types"
import {
  formatTradesBlotterCompactRupees,
  tradesBlotterPnlClass,
} from "@/components/admin-console/trades-blotter-number-utils"

type SortBy = "todayPnL" | "openCount" | "unrealizedPnL" | "lastActivity"

export function ActiveUsersPanel({
  onUserClick,
  pausedAutoRefresh,
}: {
  onUserClick: (userId: string, clientId: string | null, name: string | null) => void
  pausedAutoRefresh?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<ActiveUserRow[]>([])
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("todayPnL")

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (search) p.set("search", search)
    p.set("sortBy", sortBy)
    p.set("limit", "100")
    return p
  }, [search, sortBy])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/trades/active-users?${query.toString()}`)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data: ActiveUsersResponse = await res.json()
      setUsers(data.users || [])
    } catch {
      // silent — panel is secondary
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (pausedAutoRefresh) return
    const id = window.setInterval(() => {
      void fetchData()
    }, 15_000)
    return () => window.clearInterval(id)
  }, [pausedAutoRefresh, fetchData])

  return (
    <div className="h-full flex flex-col rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">Active users</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{users.length}</span>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-2 py-1.5 flex items-center gap-1 border-b border-border/60">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client…"
            className="h-6 text-[11px] pl-6 pr-1"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="h-6 text-[10px] w-[88px] px-1.5 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todayPnL">Today P&L</SelectItem>
            <SelectItem value="openCount">Open pos</SelectItem>
            <SelectItem value="unrealizedPnL">Unrealized</SelectItem>
            <SelectItem value="lastActivity">Last active</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {users.length === 0 && !loading && (
          <div className="p-3 text-center text-[11px] text-muted-foreground">No active users</div>
        )}
        {users.map((u) => {
          const marginPct = u.marginUsedPct ?? 0
          const marginColor =
            marginPct > 90 ? "bg-rose-500" : marginPct > 70 ? "bg-amber-500" : "bg-emerald-500"
          return (
            <button
              key={u.userId}
              type="button"
              onClick={() => onUserClick(u.userId, u.clientId, u.name)}
              className="w-full text-left px-2.5 py-1.5 border-b border-border/20 hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {u.name || "—"}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono truncate leading-tight">
                    {u.clientId || u.userId.slice(0, 8)} · {u.openPositionsCount} open
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[11px] font-bold tabular-nums leading-tight ${tradesBlotterPnlClass(u.todayNetPnL)}`}>
                    {formatTradesBlotterCompactRupees(u.todayNetPnL)}
                  </div>
                  {u.marginUsedPct != null && (
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <div className="w-10 h-0.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${marginColor}`}
                          style={{ width: `${Math.min(100, Math.max(0, marginPct))}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground tabular-nums">
                        {marginPct.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
