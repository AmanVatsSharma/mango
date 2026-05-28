/**
 * @file components/admin-v2/winners/winners-workbench.tsx
 * @module admin-v2/winners
 * @description /admin-v2/house/winners — flagged-winners table + drawer-open winner control panel.
 *              Hero: rung distribution chips + total flagged.
 *              Filter bar: rung pickers + pinned toggle + search.
 *              Click a row → opens the WinnerControlPanel in a drawer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Filter, Pin, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { V2Drawer, V2DrawerBody, V2DrawerHeader } from "@/components/admin-v2/primitives/drawer"
import { formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useWinnerList } from "./hooks"
import { RungPill } from "./rung-pill"
import { WinnerControlPanel } from "./winner-control-panel"
import { WINNER_RUNGS, type WinnerRung } from "./types"

const RUNG_FILTERS: ({ id: WinnerRung | "ALL"; label: string })[] = [
  { id: "ALL", label: "All flagged" },
  { id: "WATCH", label: "Watch" },
  { id: "SPREAD_WIDEN", label: "Spread widen" },
  { id: "POSITION_CAP", label: "Position cap" },
  { id: "INSTRUMENT_BLOCK", label: "Instrument block" },
  { id: "ORDER_REJECT", label: "Order reject" },
  { id: "CLOSE_ONLY", label: "Close-only" },
  { id: "CLOSED_OUT", label: "Closed-out" },
]

export function WinnersWorkbench() {
  const [rungFilter, setRungFilter] = React.useState<WinnerRung | "ALL">("ALL")
  const [pinnedOnly, setPinnedOnly] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [openUserId, setOpenUserId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const q = useWinnerList({
    rung: rungFilter === "ALL" ? undefined : rungFilter,
    pinned: pinnedOnly ? true : undefined,
    search: debouncedSearch || undefined,
  })

  const rows = q.data?.rows ?? []
  const byRung = q.data?.byRung
  const total = q.data?.total ?? 0
  const flaggedTotal = byRung
    ? WINNER_RUNGS.filter((r) => r !== "NONE").reduce((s, r) => s + (byRung[r] ?? 0), 0)
    : 0

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-warning">Winner Mitigation</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              live · refresh every 30s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Flagged winners
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            B-book counterparty defence — clients on the mitigation ladder. Click a row to set
            rung, override knobs, or pin them off the auto-engine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin-v2/house/quotes"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
          >
            <Sparkles className="h-3.5 w-3.5" /> Spread & Quotes
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void q.mutate()}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Flagged total"
          value={flaggedTotal}
          tone={flaggedTotal > 0 ? "warning" : "info"}
          icon={<ShieldAlert className="h-4 w-4" />}
          hint={`${total} match current filters`}
        />
        <KpiTile
          label="On Watch"
          value={byRung?.WATCH ?? 0}
          tone="info"
        />
        <KpiTile
          label="Spread widen"
          value={byRung?.SPREAD_WIDEN ?? 0}
          tone="warning"
        />
        <KpiTile
          label="Close-only / Closed-out"
          value={(byRung?.CLOSE_ONLY ?? 0) + (byRung?.CLOSED_OUT ?? 0)}
          tone="danger"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
        <Filter className="ml-1 h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
        <div className="flex flex-wrap items-center gap-1">
          {RUNG_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setRungFilter(f.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                rungFilter === f.id
                  ? "bg-white/[0.08] text-[var(--v2-text)]"
                  : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPinnedOnly((p) => !p)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
              pinnedOnly
                ? "border-[var(--v2-warn)] bg-[var(--v2-warn-soft)] text-[var(--v2-warn)]"
                : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]",
            )}
          >
            <Pin className="h-3 w-3" /> Pinned only
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--v2-text-faint)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name · email · phone · client id"
              className="h-8 w-[260px] border-white/[0.08] bg-white/[0.03] pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="v2-card overflow-hidden">
        {q.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No flagged winners"
            description="The auto-engine hasn't promoted anyone matching these filters."
          />
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Client</th>
                <th className="px-3 py-2.5 text-left">Rung</th>
                <th className="px-3 py-2.5 text-right">Spread ×</th>
                <th className="px-3 py-2.5 text-right">Cap %</th>
                <th className="px-3 py-2.5 text-right">Max ord</th>
                <th className="px-3 py-2.5 text-left">Blocks</th>
                <th className="px-3 py-2.5 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  onClick={() => setOpenUserId(row.userId)}
                  className="cursor-pointer transition-colors hover:bg-[var(--v2-cobalt-soft)]"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--v2-text)]">{row.name ?? "—"}</div>
                    <div className="font-mono text-[10px] text-[var(--v2-text-faint)]">
                      {row.clientId ?? row.userId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <RungPill rung={row.rung} size="sm" showSeverity />
                      {row.pinned ? <Pin className="h-3 w-3 text-[var(--v2-warn)]" /> : null}
                    </div>
                  </td>
                  <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                    {row.spreadMultiplier ? `${row.spreadMultiplier}×` : "—"}
                  </td>
                  <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                    {row.positionCapPct ? `${row.positionCapPct}%` : "—"}
                  </td>
                  <td className="v2-num px-3 py-2 text-right text-[var(--v2-text-mute)]">
                    {row.maxOrderNotional ? formatInr(row.maxOrderNotional) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[var(--v2-text-mute)]">
                    {row.blockedInstruments.length || row.blockedSegments.length
                      ? `${row.blockedInstruments.length} instr · ${row.blockedSegments.length} seg`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] text-[var(--v2-text-faint)]">
                    {formatRelativeIst(row.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <V2Drawer open={openUserId !== null} onOpenChange={(o) => !o && setOpenUserId(null)}>
        <V2DrawerHeader
          title="Winner mitigation"
          subtitle={openUserId ? `client · ${openUserId.slice(0, 12)}…` : ""}
          onClose={() => setOpenUserId(null)}
        />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          {openUserId ? <WinnerControlPanel userId={openUserId} /> : null}
        </V2DrawerBody>
      </V2Drawer>
    </div>
  )
}
