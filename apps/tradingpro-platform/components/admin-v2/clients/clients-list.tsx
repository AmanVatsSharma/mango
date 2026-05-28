/**
 * @file components/admin-v2/clients/clients-list.tsx
 * @module admin-v2/clients
 * @description Clients list page — Phase 2 centerpiece. V2DataTable-backed table with search,
 *              status / KYC / role filters, drawer-open Client 360 on row click. URL state for
 *              page + filters so admin sessions are bookmark-able.
 *
 *              Exports:
 *                - default ClientsListPage — drop-in client component for /admin-v2/clients.
 *
 *              Side-effects: SWR fetch of /api/admin/users (debounced filter changes); pushes URL.
 *
 *              Key invariants:
 *                - Filters live in the URL — opening a filtered URL renders the same view.
 *                - Drawer opens via row click (preferred); "Open page" link in drawer header
 *                  takes the operator to the canonical /admin-v2/clients/[userId] route.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  EmptyState,
  StatusPill,
  V2DataTable,
  useV2TableColumnHelper,
} from "@/components/admin-v2/primitives"
import { useV2Shortcuts } from "@/components/admin-v2/power/shortcuts-registry"
import { Client360Drawer } from "@/components/admin-v2/client-360/client-360"
import { useClientsList } from "@/components/admin-v2/client-360/hooks"
import { formatDateTimeIst, formatInr } from "@/lib/admin-v2/api-client"
import type { ClientFilters, UserSummary } from "@/components/admin-v2/client-360/types"

const colHelper = useV2TableColumnHelper<UserSummary>()

const COLUMNS = [
  colHelper.accessor("name", {
    header: "Name",
    cell: (info) => {
      const row = info.row.original
      return (
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-zinc-100">{row.name ?? "—"}</span>
          {row.isTradingDashboardOnline ? (
            <StatusPill tone="success" label="Live" dot size="sm" />
          ) : null}
          {row.hasRelatedContactOverlap ? (
            <StatusPill tone="warning" label="Dup contact" size="sm" />
          ) : null}
        </div>
      )
    },
  }),
  colHelper.accessor("clientId", {
    header: "Client ID",
    cell: (info) => (
      <span className="font-mono text-xs text-zinc-300">{info.getValue() ?? "—"}</span>
    ),
  }),
  colHelper.accessor("email", {
    header: "Email",
    cell: (info) => <span className="truncate text-zinc-300">{info.getValue() ?? "—"}</span>,
  }),
  colHelper.accessor("phone", {
    header: "Phone",
    cell: (info) => (
      <span className="font-mono text-xs text-zinc-300">{info.getValue() ?? "—"}</span>
    ),
  }),
  colHelper.display({
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const u = row.original
      if (u.suspendedAt) return <StatusPill kind="SUSPENDED" size="sm" />
      if (u.isActive) return <StatusPill kind="ACTIVE" size="sm" />
      return <StatusPill kind="INACTIVE" size="sm" />
    },
  }),
  colHelper.display({
    id: "kyc",
    header: "KYC",
    cell: ({ row }) => {
      const k = row.original.kyc?.status
      if (!k) return <span className="text-xs text-zinc-500">—</span>
      return <StatusPill kind={k} size="sm" />
    },
  }),
  colHelper.display({
    id: "rm",
    header: "RM",
    cell: ({ row }) => (
      <span className="text-xs text-zinc-300">{row.original.managedBy?.name ?? "—"}</span>
    ),
  }),
  colHelper.display({
    id: "balance",
    header: "Balance",
    cell: ({ row }) => (
      <span className="tabular-nums text-zinc-200">
        {formatInr(row.original.tradingAccount?.balance)}
      </span>
    ),
  }),
  colHelper.accessor("createdAt", {
    header: "Joined",
    cell: (info) => (
      <span className="text-xs text-zinc-400">{formatDateTimeIst(info.getValue())}</span>
    ),
  }),
] as ColumnsDef

// TypeScript helper — typed as a ColumnDef array consumed by V2DataTable.
type ColumnsDef = Parameters<typeof V2DataTable<UserSummary>>[0]["columns"]

export default function ClientsListPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters: ClientFilters = React.useMemo(
    () => ({
      page: Number(searchParams.get("page") ?? 1),
      limit: 25,
      search: searchParams.get("q") ?? "",
      status: (searchParams.get("status") as ClientFilters["status"]) ?? "all",
      kycStatus: (searchParams.get("kyc") as ClientFilters["kycStatus"]) ?? "all",
      role: (searchParams.get("role") as ClientFilters["role"]) ?? "all",
      contactDuplicate: searchParams.get("dup") === "1",
    }),
    [searchParams],
  )

  const [searchInput, setSearchInput] = React.useState(filters.search ?? "")
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // Debounced search → URL
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((searchInput ?? "") === (filters.search ?? "")) return
      pushFilter("q", searchInput || undefined)
      pushFilter("page", undefined) // reset to page 1 on search change
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

  const { data, error, isLoading, mutate } = useClientsList(filters)
  const rows = data?.users ?? []
  const total = data?.total ?? 0

  // Drawer state
  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null)

  // Keyboard shortcuts: "/" focuses search, "n" opens the page action menu (deferred).
  useV2Shortcuts(
    React.useMemo(
      () => [
        {
          id: "clients.focus-search",
          binding: "/",
          label: "Focus search",
          group: "Clients",
          handler: (e) => {
            e.preventDefault()
            searchInputRef.current?.focus()
          },
        },
      ],
      [],
    ),
  )

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone="info" label="Workbench" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Live data · refreshes every 30s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Clients
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-text-mute)]">
            <span className="v2-num text-[var(--v2-text)]">{total.toLocaleString("en-IN")}</span>{" "}
            total · click a row to open Client 360 in a drawer · press{" "}
            <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">/</kbd> to search
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)] hover:border-white/[0.16] hover:bg-white/[0.06]"
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--v2-text-faint)]" aria-hidden />
          <Input
            ref={searchInputRef}
            placeholder="Name, email, phone, client ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border-white/[0.06] bg-white/[0.03] pl-8 text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          />
        </div>
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) => pushFilter("status", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-36 border-zinc-800 bg-zinc-900/40 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.kycStatus ?? "all"}
          onValueChange={(v) => pushFilter("kyc", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-32 border-zinc-800 bg-zinc-900/40 text-sm">
            <SelectValue placeholder="KYC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All KYC</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.role ?? "all"}
          onValueChange={(v) => pushFilter("role", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-36 border-zinc-800 bg-zinc-900/40 text-sm">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="USER">USER</SelectItem>
            <SelectItem value="MODERATOR">MODERATOR</SelectItem>
            <SelectItem value="ADMIN">ADMIN</SelectItem>
            <SelectItem value="SUPER_ADMIN">SUPER ADMIN</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={filters.contactDuplicate ? "default" : "outline"}
          size="sm"
          onClick={() => pushFilter("dup", filters.contactDuplicate ? undefined : "1")}
        >
          Duplicate contacts
        </Button>
      </div>

      <V2DataTable<UserSummary>
        data={rows}
        columns={COLUMNS}
        loading={isLoading}
        error={error ? String(error) : undefined}
        onRetry={() => mutate()}
        onRowClick={(row) => setDrawerUserId(row.id)}
        emptyState={
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="No clients match"
            description="Try clearing filters or broadening your search."
          />
        }
      />

      {data && data.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
          <span>
            Page <span className="tabular-nums text-zinc-200">{filters.page}</span> of{" "}
            <span className="tabular-nums text-zinc-200">{data.pages}</span>
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => pushFilter("page", String((filters.page ?? 1) - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(filters.page ?? 1) >= data.pages}
              onClick={() => pushFilter("page", String((filters.page ?? 1) + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Client360Drawer
        userId={drawerUserId}
        open={drawerUserId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerUserId(null)
        }}
      />

      {/* Footer link to canonical full-page route for the active client (when drawer open). */}
      {drawerUserId ? (
        <div className="fixed bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-300 shadow-lg backdrop-blur">
          Drawer open ·{" "}
          <Link
            href={`/admin-v2/clients/${drawerUserId}`}
            className="font-medium text-sky-300 hover:underline"
          >
            Open full page
          </Link>
        </div>
      ) : null}
    </div>
  )
}
