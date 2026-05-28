/**
 * @file components/admin-v2/compliance/compliance-workbench.tsx
 * @module admin-v2/compliance
 * @description Compliance Workbench — KYC anti-fraud queue for v2. Hero KPI strip + filter bar
 *              + V2DataTable with multi-select + bulk approve/reject + Client 360 drawer on
 *              row click. Bulk approve/reject hits POST /api/admin/kyc/bulk (cap 50/req,
 *              best-effort; partial-success summary surfaced via toast).
 *
 *              Exports:
 *                - default ComplianceWorkbench — drop-in client component for /admin-v2/kyc.
 *
 *              Side-effects: SWR fetch of /api/admin/kyc (60s refresh). POST to /api/admin/kyc/bulk
 *              on bulk action.
 *
 *              Key invariants:
 *                - URL state for filters + page (bookmark-able).
 *                - Bulk actions only render when at least one row is selected.
 *                - Permission gate handled by the v2 layout — this component assumes
 *                  the operator has admin.users.kyc and renders the surface unconditionally.
 *
 *              Read order:
 *                1. ComplianceWorkbench — top-level component; KPI strip + filters + table.
 *                2. Column definitions — what each row shows.
 *                3. Bulk action handler — calls POST /api/admin/kyc/bulk and toasts the result.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { CheckCircle2, FileWarning, Search, ShieldAlert, Timer, XCircle } from "lucide-react"
import { mutate as globalMutate } from "swr"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import {
  EmptyState,
  KpiTile,
  StatusPill,
  V2DataTable,
  useV2TableColumnHelper,
} from "@/components/admin-v2/primitives"
import { Client360Drawer } from "@/components/admin-v2/client-360/client-360"
import { ApiError, formatRelativeIst } from "@/lib/admin-v2/api-client"
import {
  getSuspiciousFlagMeta,
  severityToTone,
} from "@/lib/admin-v2/suspicious-flags"
import { useKycQueue } from "./hooks"
import type { BulkResp, KycFilters, KycRow } from "./types"

const colHelper = useV2TableColumnHelper<KycRow>()

const COLUMNS = [
  colHelper.display({
    id: "applicant",
    header: "Applicant",
    cell: ({ row }) => {
      const u = row.original.user
      return (
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[var(--v2-text)]">
            {u.name ?? "—"}
          </span>
          {u.isTradingDashboardOnline ? (
            <StatusPill tone="success" label="Live" dot size="sm" />
          ) : null}
          {u.hasRelatedContactOverlap ? (
            <StatusPill tone="warning" label="Dup contact" size="sm" />
          ) : null}
        </div>
      )
    },
  }),
  colHelper.display({
    id: "contact",
    header: "Contact",
    cell: ({ row }) => (
      <div className="flex flex-col text-xs">
        <span className="truncate text-[var(--v2-text-mute)]">
          {row.original.user.email ?? "—"}
        </span>
        <span className="font-mono text-[var(--v2-text-faint)]">
          {row.original.user.clientId ?? row.original.user.phone ?? "—"}
        </span>
      </div>
    ),
  }),
  colHelper.accessor("status", {
    header: "KYC",
    cell: (info) => <StatusPill kind={info.getValue()} size="sm" />,
  }),
  colHelper.accessor("amlStatus", {
    header: "AML",
    cell: (info) => <StatusPill kind={info.getValue()} size="sm" />,
  }),
  colHelper.accessor("suspiciousStatus", {
    header: "Risk",
    cell: (info) => {
      const v = info.getValue()
      if (v === "NONE") return <span className="text-xs text-[var(--v2-text-faint)]">—</span>
      return <StatusPill kind={v} size="sm" />
    },
  }),
  colHelper.display({
    id: "flags",
    header: "Flags",
    cell: ({ row }) => {
      const flags = row.original.amlFlags ?? []
      if (flags.length === 0) return <span className="text-xs text-[var(--v2-text-faint)]">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {flags.slice(0, 3).map((f) => {
            const meta = getSuspiciousFlagMeta(f)
            return (
              <StatusPill
                key={f}
                tone={severityToTone(meta.severity)}
                label={meta.label}
                size="sm"
                title={meta.description}
              />
            )
          })}
          {flags.length > 3 ? (
            <span className="text-xs text-[var(--v2-text-faint)]">+{flags.length - 3}</span>
          ) : null}
        </div>
      )
    },
  }),
  colHelper.display({
    id: "assignee",
    header: "Reviewer",
    cell: ({ row }) =>
      row.original.assignedTo?.name ? (
        <span className="text-xs text-[var(--v2-text)]">{row.original.assignedTo.name}</span>
      ) : (
        <span className="text-xs text-[var(--v2-text-faint)]">Unassigned</span>
      ),
  }),
  colHelper.display({
    id: "sla",
    header: "SLA",
    cell: ({ row }) => {
      const due = row.original.slaDueAt
      const breach = row.original.slaBreachedAt
      if (breach) return <StatusPill kind="OVERDUE" size="sm" />
      if (!due) return <span className="text-xs text-[var(--v2-text-faint)]">—</span>
      const ms = new Date(due).getTime() - Date.now()
      const tone =
        ms < 0 ? "danger" : ms < 24 * 3_600_000 ? "warning" : "success"
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs ${
            tone === "danger"
              ? "text-[#FF8AA0]"
              : tone === "warning"
                ? "text-[#FFCB66]"
                : "text-[#5DF7BC]"
          }`}
        >
          <Timer className="h-3 w-3" />
          {formatRelativeIst(due)}
        </span>
      )
    },
  }),
  colHelper.accessor("submittedAt", {
    header: "Submitted",
    cell: (info) => (
      <span className="text-xs text-[var(--v2-text-mute)]">
        {formatRelativeIst(info.getValue())}
      </span>
    ),
  }),
] as Parameters<typeof V2DataTable<KycRow>>[0]["columns"]

export default function ComplianceWorkbench() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters: KycFilters = React.useMemo(
    () => ({
      page: Number(searchParams.get("page") ?? 1),
      limit: 25,
      search: searchParams.get("q") ?? "",
      status: (searchParams.get("status") as KycFilters["status"]) ?? "PENDING",
      amlStatus: (searchParams.get("aml") as KycFilters["amlStatus"]) ?? "ALL",
      suspiciousStatus:
        (searchParams.get("susp") as KycFilters["suspiciousStatus"]) ?? "ALL",
      sla: (searchParams.get("sla") as KycFilters["sla"]) ?? "ALL",
      lifecycle: (searchParams.get("lc") as KycFilters["lifecycle"]) ?? "ALL",
      relatedContactOverlap: searchParams.get("dup") === "1",
    }),
    [searchParams],
  )

  const [searchInput, setSearchInput] = React.useState(filters.search ?? "")
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((searchInput ?? "") === (filters.search ?? "")) return
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

  const { data, error, isLoading, mutate } = useKycQueue(filters)
  const rows = data?.kycApplications ?? []
  const meta = data?.meta
  const counts = data?.statusCounts ?? {}
  const total = data?.pagination.total ?? 0

  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null)
  const [selectedRows, setSelectedRows] = React.useState<KycRow[]>([])
  const [bulkBusy, setBulkBusy] = React.useState(false)

  async function bulkUpdate(status: "APPROVED" | "REJECTED") {
    if (selectedRows.length === 0) return
    setBulkBusy(true)
    try {
      const res = await fetch("/api/admin/kyc/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycIds: selectedRows.map((r) => r.id),
          status,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new ApiError(data.message ?? `Failed (${res.status})`, res.status)
      }
      const out = (await res.json()) as BulkResp
      toast({
        title: `Bulk ${status.toLowerCase()} complete`,
        description: `${out.succeeded} succeeded · ${out.failed} failed (of ${out.attempted}).`,
      })
      setSelectedRows([])
      await mutate()
      await globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/admin/users/"),
      )
    } catch (e) {
      toast({
        title: `Bulk ${status.toLowerCase()} failed`,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone="warning" label="Compliance" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              KYC anti-fraud queue · refreshes every 60s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Compliance Workbench
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-text-mute)]">
            <span className="v2-num text-[var(--v2-text)]">{total.toLocaleString("en-IN")}</span>{" "}
            applications · click any row to open Client 360 (Compliance tab) · select multiple to
            bulk-approve or reject
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          disabled={isLoading}
          className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)] hover:border-white/[0.16]"
        >
          Refresh
        </Button>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Pending"
          value={counts.PENDING ?? 0}
          tone="info"
          icon={<Search className="h-4 w-4" />}
        />
        <KpiTile
          label="Approved"
          value={counts.APPROVED ?? 0}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiTile
          label="Rejected"
          value={counts.REJECTED ?? 0}
          tone="danger"
          icon={<XCircle className="h-4 w-4" />}
        />
        <KpiTile
          label="SLA breach"
          value={meta?.overdueCount ?? 0}
          tone="danger"
          icon={<Timer className="h-4 w-4" />}
          hint="Past due · resolve first"
        />
        <KpiTile
          label="Flagged"
          value={meta?.flaggedCount ?? 0}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="AML / suspicious / overlap signals"
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--v2-text-faint)]" aria-hidden />
          <Input
            placeholder="Name, email, phone, client ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border-white/[0.06] bg-white/[0.03] pl-8 text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          />
        </div>
        <Select
          value={filters.status ?? "PENDING"}
          onValueChange={(v) => pushFilter("status", v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-32 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.amlStatus ?? "ALL"}
          onValueChange={(v) => pushFilter("aml", v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-32 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue placeholder="AML" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any AML</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CLEAR">Clear</SelectItem>
            <SelectItem value="REVIEW">Review</SelectItem>
            <SelectItem value="HIT">Hit</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.sla ?? "ALL"}
          onValueChange={(v) => pushFilter("sla", v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-36 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue placeholder="SLA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any SLA</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="DUE_SOON">Due in 24h</SelectItem>
            <SelectItem value="DUE_48H">Due in 48h</SelectItem>
            <SelectItem value="DUE_72H">Due in 72h</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.lifecycle ?? "ALL"}
          onValueChange={(v) => pushFilter("lc", v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-44 border-white/[0.06] bg-white/[0.03] text-sm text-[var(--v2-text)]">
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All lifecycle</SelectItem>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="APPROVED_NOT_TRADING">Approved · not trading</SelectItem>
            <SelectItem value="TRADING">Trading</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={filters.relatedContactOverlap ? "default" : "outline"}
          size="sm"
          onClick={() => pushFilter("dup", filters.relatedContactOverlap ? undefined : "1")}
          className={
            filters.relatedContactOverlap
              ? "v2-btn-cta"
              : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          }
        >
          <FileWarning className="mr-1.5 h-3.5 w-3.5" />
          Duplicate contacts
        </Button>
      </div>

      <V2DataTable<KycRow>
        data={rows}
        columns={COLUMNS}
        loading={isLoading}
        error={error ? String(error) : undefined}
        onRetry={() => mutate()}
        enableSelection
        onSelectionChange={setSelectedRows}
        onRowClick={(row) => setDrawerUserId(row.user.id)}
        emptyState={
          <EmptyState
            title="No applications match"
            description="Adjust filters or clear them to see the full queue."
          />
        }
        bulkActions={(selected) => (
          <>
            <span className="text-xs text-[var(--v2-text-mute)]">
              Up to 50 per request · best-effort
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkUpdate("REJECTED")}
              disabled={bulkBusy || selected.length === 0}
              className="border-rose-500/30 bg-rose-500/10 text-[#FF8AA0] hover:bg-rose-500/20"
            >
              Reject {selected.length}
            </Button>
            <Button
              size="sm"
              onClick={() => bulkUpdate("APPROVED")}
              disabled={bulkBusy || selected.length === 0}
              className="v2-btn-cta"
            >
              Approve {selected.length}
            </Button>
          </>
        )}
      />

      {data && data.pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--v2-text-mute)]">
          <span>
            Page <span className="v2-num text-[var(--v2-text)]">{filters.page}</span> of{" "}
            <span className="v2-num text-[var(--v2-text)]">{data.pagination.totalPages}</span>
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => pushFilter("page", String((filters.page ?? 1) - 1))}
              className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(filters.page ?? 1) >= data.pagination.totalPages}
              onClick={() => pushFilter("page", String((filters.page ?? 1) + 1))}
              className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
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
        initialTab="compliance"
      />
    </div>
  )
}
