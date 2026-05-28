/**
 * @file components/admin-v2/command-centre/command-centre-v2.tsx
 * @module admin-v2/command-centre
 * @description Trade Command Centre v2 — live blotter for the broker's entire client book.
 *              Hero KPI strip (today's net P&L · open P&L · open positions · today's win rate)
 *              + risk flags strip (clickable filters) + filter bar + V2DataTable + saved scopes
 *              + active-users sidebar + Cmd+K shortcuts (focus search, save scope, refresh).
 *
 *              Exports: default CommandCentreV2.
 *
 *              Read order:
 *                1. CommandCentreV2 — top-level page; URL-driven filters.
 *                2. KPI strip from useTradesList stats.
 *                3. Risk flags click → applies filter to the table.
 *                4. Saved scopes — load + save filter sets.
 *                5. Sidebar active-users panel — click filters table to that user.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  Activity,
  Bookmark,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import {
  KpiTile,
  StatusPill,
  V2DataTable,
} from "@/components/admin-v2/primitives"
import { Client360Drawer } from "@/components/admin-v2/client-360/client-360"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { useV2Shortcuts } from "@/components/admin-v2/power/shortcuts-registry"
import { formatInr } from "@/lib/admin-v2/api-client"
import { useTradesList } from "./hooks"
import { TRADE_COLUMNS } from "./trades-table"
import RiskFlagsStrip from "./risk-flags-strip"
import ActiveUsersPanel from "./active-users-panel"
import { addScope, loadScopes, removeScope } from "./saved-scopes"
import type { ActiveUserRow, RiskFlag, SavedScope, TradeRow, TradesFilters } from "./types"

export default function CommandCentreV2() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const session = useAdminSession()

  const filters: TradesFilters = React.useMemo(
    () => ({
      page: Number(searchParams.get("page") ?? 1),
      limit: 50,
      status: (searchParams.get("status") as TradesFilters["status"]) ?? "OPEN",
      side: (searchParams.get("side") as TradesFilters["side"]) ?? "all",
      user: searchParams.get("q") ?? "",
      userId: searchParams.get("userId") ?? "",
      symbol: searchParams.get("symbol") ?? "",
      segment: searchParams.get("segment") ?? "",
      productType: searchParams.get("productType") ?? "",
    }),
    [searchParams],
  )

  const [searchInput, setSearchInput] = React.useState(filters.user ?? "")
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((searchInput ?? "") === (filters.user ?? "")) return
      pushFilter("q", searchInput || undefined)
      pushFilter("page", undefined)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function pushFilter(key: string, value: string | undefined) {
    const sp = new URLSearchParams(searchParams.toString())
    if (value === undefined || value === "") sp.delete(key)
    else sp.set(key, value)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function applyFilters(next: Partial<TradesFilters>) {
    const sp = new URLSearchParams(searchParams.toString())
    const apply = (k: string, v: unknown) => {
      if (v === undefined || v === null || v === "") sp.delete(k)
      else sp.set(k, String(v))
    }
    if ("status" in next) apply("status", next.status)
    if ("side" in next) apply("side", next.side)
    if ("user" in next) apply("q", next.user)
    if ("userId" in next) apply("userId", next.userId)
    if ("symbol" in next) apply("symbol", next.symbol)
    if ("segment" in next) apply("segment", next.segment)
    if ("productType" in next) apply("productType", next.productType)
    sp.delete("page")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const { data, error, isLoading, mutate } = useTradesList(filters)
  const trades = data?.trades ?? []
  const stats = data?.stats

  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null)
  const [scopes, setScopes] = React.useState<SavedScope[]>([])
  React.useEffect(() => {
    if (session.user?.id) setScopes(loadScopes(session.user.id))
  }, [session.user?.id])

  function saveCurrentScope() {
    if (!session.user?.id) return
    const label = window.prompt("Name this scope (e.g., 'F&O > 5L exposure')")
    if (!label) return
    addScope(session.user.id, label, filters)
    setScopes(loadScopes(session.user.id))
    toast({ title: "Scope saved", description: label })
  }

  function activateScope(scope: SavedScope) {
    applyFilters(scope.filters)
  }

  function deleteScope(id: string) {
    if (!session.user?.id) return
    removeScope(session.user.id, id)
    setScopes(loadScopes(session.user.id))
  }

  // Apply risk-flag click → filter (user / symbol / route)
  function onRiskFlagClick(flag: RiskFlag) {
    if (!flag.target) return
    if (flag.target.type === "user") {
      applyFilters({ userId: flag.target.userId })
    } else if (flag.target.type === "symbol") {
      applyFilters({
        symbol: flag.target.symbol,
        segment: flag.target.segment ?? undefined,
      })
    } else if (flag.target.type === "route") {
      router.push(flag.target.href)
    }
  }

  function onPickActiveUser(u: ActiveUserRow) {
    applyFilters({ userId: u.userId, status: "OPEN" })
  }

  // Cmd+K shortcuts scoped to this workbench
  useV2Shortcuts(
    React.useMemo(
      () => [
        {
          id: "cc.focus-search",
          binding: "/",
          label: "Focus search",
          group: "Command Centre",
          handler: (e) => {
            e.preventDefault()
            searchInputRef.current?.focus()
          },
        },
        {
          id: "cc.save-scope",
          binding: "$mod+s",
          label: "Save current filters as scope",
          group: "Command Centre",
          handler: (e) => {
            e.preventDefault()
            saveCurrentScope()
          },
        },
        {
          id: "cc.refresh",
          binding: "r",
          label: "Refresh blotter",
          group: "Command Centre",
          handler: () => {
            void mutate()
          },
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [session.user?.id, filters],
    ),
  )

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone="danger" label="Live ops" size="sm" dot />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Trade Command Centre · 5–10s refresh
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Command Centre
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-text-mute)]">
            Live blotter for the entire client book. Click any row to open Client 360 (Trading
            tab). Press <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">/</kbd> to focus search, <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">⌘ S</kbd> to save scope, <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">R</kbd> to refresh.
          </p>
        </div>
      </div>

      {/* Hero KPI strip */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Today P&L"
          value={formatInr(stats?.todayNetPnL ?? 0)}
          tone={(stats?.todayNetPnL ?? 0) >= 0 ? "success" : "danger"}
          icon={(stats?.todayNetPnL ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        />
        <KpiTile
          label="Open unrealized"
          value={formatInr(stats?.openUnrealizedPnL ?? 0)}
          tone={(stats?.openUnrealizedPnL ?? 0) >= 0 ? "success" : "danger"}
        />
        <KpiTile
          label="Open positions"
          value={stats?.openPositionsCount ?? 0}
          tone="info"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Win rate today"
          value={
            stats?.winRatePct != null ? `${stats.winRatePct.toFixed(0)}%` : "—"
          }
          tone={(stats?.winRatePct ?? 0) >= 50 ? "success" : "warning"}
          hint={`${stats?.winsToday ?? 0}W / ${stats?.lossesToday ?? 0}L`}
        />
        <KpiTile
          label="Volume notional"
          value={formatInr(stats?.totalVolumeNotional ?? 0)}
          tone="neutral"
        />
      </section>

      <RiskFlagsStrip onFlagClick={onRiskFlagClick} />

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--v2-text-faint)]" aria-hidden />
          <Input
            ref={searchInputRef}
            placeholder="Client name, email, phone, symbol…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border-white/[0.06] bg-white/[0.03] pl-8 text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          />
        </div>
        <Select
          value={filters.status ?? "OPEN"}
          onValueChange={(v) => pushFilter("status", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-32 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.side ?? "all"}
          onValueChange={(v) => pushFilter("side", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-32 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any side</SelectItem>
            <SelectItem value="LONG">Long</SelectItem>
            <SelectItem value="SHORT">Short</SelectItem>
          </SelectContent>
        </Select>
        {filters.userId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyFilters({ userId: undefined })}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <X className="mr-1 h-3 w-3" /> Client filter
          </Button>
        ) : null}
        {filters.symbol ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyFilters({ symbol: undefined, segment: undefined })}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <X className="mr-1 h-3 w-3" /> {filters.symbol}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={saveCurrentScope}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <Bookmark className="mr-1 h-3 w-3" /> Save scope
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            Refresh
          </Button>
        </div>
      </div>

      {scopes.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Scopes
          </span>
          {scopes.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => activateScope(s)}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--v2-text)] hover:border-[var(--v2-border-accent)]"
              >
                <Star className="h-3 w-3 text-[var(--v2-warn)]" />
                {s.label}
              </button>
              <button
                type="button"
                onClick={() => deleteScope(s.id)}
                className="text-[var(--v2-text-faint)] hover:text-[#FF8AA0]"
                aria-label={`Delete scope ${s.label}`}
                title="Delete scope"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          <V2DataTable<TradeRow>
            data={trades}
            columns={TRADE_COLUMNS}
            loading={isLoading}
            error={error ? String(error) : undefined}
            onRetry={() => mutate()}
            onRowClick={(row) =>
              row.userId ? setDrawerUserId(row.userId) : undefined
            }
            enableVirtual={trades.length > 80}
            rowHeight={56}
          />
          {data && data.pages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--v2-text-mute)]">
              <span>
                Page <span className="v2-num text-[var(--v2-text)]">{data.page}</span> of{" "}
                <span className="v2-num text-[var(--v2-text)]">{data.pages}</span>
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page <= 1}
                  onClick={() => pushFilter("page", String(data.page - 1))}
                  className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page >= data.pages}
                  onClick={() => pushFilter("page", String(data.page + 1))}
                  className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="hidden lg:block">
          <ActiveUsersPanel onPickUser={onPickActiveUser} activeUserId={filters.userId ?? null} />
        </div>
      </div>

      <Client360Drawer
        userId={drawerUserId}
        open={drawerUserId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerUserId(null)
        }}
        initialTab="trading"
      />
    </div>
  )
}
