/**
 * @file kyc-queue-root.tsx
 * @module admin-console/kyc-queue
 * @description KYC queue orchestration: fetches, URL sync, CRM drawer + compliance dialog.
 * @author StockTrade
 * @created 2026-04-07
 * @updated 2026-04-07
 */

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, FileSearch } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader, RefreshButton } from "@/components/admin-console/shared"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"
import {
  normalizeAdminKycLifecycleParam,
  normalizeAdminKycRelatedContactOverlapParam,
} from "@/lib/server/admin-kyc-query-utils"
import { KycApplicantCrmDrawer } from "./kyc-applicant-crm-drawer"
import { KycDetailDialog } from "./kyc-detail-dialog"
import { KycQueueMetrics } from "./kyc-queue-metrics"
import { KycQueueTable } from "./kyc-queue-table"
import { KycQueueToolbar } from "./kyc-queue-toolbar"
import type { KycApplication, KycAssignee, KycQueueMeta } from "./kyc-types"

export function KycQueueRoot() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const kycIdFromUrl = searchParams.get("kycId")

  const [items, setItems] = useState<KycApplication[]>([])
  const [meta, setMeta] = useState<KycQueueMeta | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [search, setSearch] = useState("")
  const [amlFlagFilter, setAmlFlagFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [assignedFilter, setAssignedFilter] = useState("ALL")
  const [slaFilter, setSlaFilter] = useState("ALL")
  const [amlStatusFilter, setAmlStatusFilter] = useState("ALL")
  const [suspiciousFilter, setSuspiciousFilter] = useState("ALL")
  const [relatedOverlapOnly, setRelatedOverlapOnly] = useState(() =>
    normalizeAdminKycRelatedContactOverlapParam(searchParams.get("relatedContactOverlap")),
  )
  const [lifecycleFilter, setLifecycleFilter] = useState(() =>
    normalizeAdminKycLifecycleParam(searchParams.get("lifecycle")),
  )

  const [assignees, setAssignees] = useState<KycAssignee[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [crmOpen, setCrmOpen] = useState(false)
  const [crmItem, setCrmItem] = useState<KycApplication | null>(null)

  const setKycIdInUrl = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (id) next.set("kycId", id)
      else next.delete("kycId")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const stripKycIdFromUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    if (!next.has("kycId")) return
    next.delete("kycId")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, router, searchParams])

  useEffect(() => {
    const raw = kycIdFromUrl?.trim()
    if (!raw) return
    setSelectedId(raw)
    setDetailOpen(true)
  }, [kycIdFromUrl])

  useEffect(() => {
    setRelatedOverlapOnly(normalizeAdminKycRelatedContactOverlapParam(searchParams.get("relatedContactOverlap")))
  }, [searchParams])

  const syncRelatedOverlapUrl = useCallback(
    (on: boolean) => {
      const next = new URLSearchParams(searchParams.toString())
      if (on) next.set("relatedContactOverlap", "1")
      else next.delete("relatedContactOverlap")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const syncLifecycleUrl = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      if (!value || value === "ALL") next.delete("lifecycle")
      else next.set("lifecycle", value)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const fetchAssignees = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/rms")
      if (!response.ok) return
      const data = await response.json()
      const filtered = (data?.rms || []).filter(
        (rm: KycAssignee) => rm.role === "ADMIN" || rm.role === "MODERATOR",
      )
      setAssignees(filtered)
    } catch {
      /* ignore */
    }
  }, [])

  const fetchQueue = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true
      if (!silent) setLoading(true)
      else setIsRefreshing(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
        })
        if (search) params.set("search", search)
        if (statusFilter !== "ALL") params.set("status", statusFilter)
        if (amlFlagFilter.trim()) params.set("flag", amlFlagFilter.trim())
        if (assignedFilter !== "ALL") params.set("assignedTo", assignedFilter)
        if (slaFilter !== "ALL") params.set("sla", slaFilter)
        if (amlStatusFilter !== "ALL") params.set("amlStatus", amlStatusFilter)
        if (suspiciousFilter !== "ALL") params.set("suspiciousStatus", suspiciousFilter)
        if (relatedOverlapOnly) params.set("relatedContactOverlap", "1")
        if (lifecycleFilter !== "ALL") params.set("lifecycle", lifecycleFilter)

        const response = await fetch(`/api/admin/kyc?${params.toString()}`)
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || "Failed to load KYC queue")
        }

        const data = await response.json()
        setItems(data.kycApplications || [])
        setStatusCounts(data.statusCounts || {})
        setMeta(data.meta || null)
        setTotalPages(data.pagination?.totalPages || 1)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load KYC queue"
        setError(msg)
      } finally {
        if (!silent) setLoading(false)
        setIsRefreshing(false)
      }
    },
    [
      page,
      search,
      statusFilter,
      amlFlagFilter,
      assignedFilter,
      slaFilter,
      amlStatusFilter,
      suspiciousFilter,
      relatedOverlapOnly,
      lifecycleFilter,
    ],
  )

  useEffect(() => {
    void fetchAssignees()
  }, [fetchAssignees])

  useEffect(() => {
    void fetchQueue()
  }, [fetchQueue])

  const fetchQueueRef = useRef(fetchQueue)
  fetchQueueRef.current = fetchQueue

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchQueueRef.current({ silent: true })
    }, 25_000)
    return () => window.clearInterval(id)
  }, [])

  const assignedOptions = useMemo(() => {
    return [
      { label: "All", value: "ALL" },
      { label: "Unassigned", value: "UNASSIGNED" },
      ...assignees.map((assignee) => ({
        label: assignee.name || assignee.email || assignee.id,
        value: assignee.id,
      })),
    ]
  }, [assignees])

  const selectedItem = items.find((item) => item.id === selectedId) || null

  const applicantUserIds = useMemo(() => items.map((i) => i.user.id), [items])
  const livePresence = useAdminTradingPresenceStream(applicantUserIds, !loading && items.length > 0)

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (statusFilter !== "ALL") n++
    if (assignedFilter !== "ALL") n++
    if (slaFilter !== "ALL") n++
    if (amlStatusFilter !== "ALL") n++
    if (suspiciousFilter !== "ALL") n++
    if (amlFlagFilter.trim()) n++
    if (relatedOverlapOnly) n++
    if (lifecycleFilter !== "ALL") n++
    return n
  }, [
    statusFilter,
    assignedFilter,
    slaFilter,
    amlStatusFilter,
    suspiciousFilter,
    amlFlagFilter,
    relatedOverlapOnly,
    lifecycleFilter,
  ])

  const openCrm = useCallback((item: KycApplication) => {
    setCrmItem(item)
    setCrmOpen(true)
  }, [])

  const openReview = useCallback(
    (item: KycApplication) => {
      setSelectedId(item.id)
      setDetailOpen(true)
      setKycIdInUrl(item.id)
    },
    [setKycIdInUrl],
  )

  const closeDetail = useCallback(
    (openState: boolean) => {
      setDetailOpen(openState)
      if (!openState) {
        setSelectedId(null)
        stripKycIdFromUrl()
      }
    },
    [stripKycIdFromUrl],
  )

  return (
    <div className="space-y-3 sm:space-y-4 max-w-[1600px] mx-auto px-2 sm:px-0">
      <PageHeader
        title="KYC & CRM"
        description="Compliance queue with broker client context. Row or CRM opens relationship view; Review opens full case."
        icon={<FileSearch className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 shrink-0" />}
        actions={<RefreshButton onClick={() => void fetchQueue()} loading={loading || isRefreshing} />}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <AlertTitle className="text-red-500 text-sm">Unable to load queue</AlertTitle>
          <AlertDescription className="text-red-400 text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <KycQueueMetrics statusCounts={statusCounts} meta={meta} />

      <Card className="bg-card border-border shadow-sm py-3 px-3 sm:px-4">
        <CardContent className="p-0 space-y-3">
          <KycQueueToolbar
            search={search}
            onSearchChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            lifecycleFilter={lifecycleFilter}
            onLifecycleFilterChange={(v) => {
              setLifecycleFilter(normalizeAdminKycLifecycleParam(v))
              setPage(1)
              syncLifecycleUrl(v)
            }}
            amlFlagFilter={amlFlagFilter}
            onAmlFlagChange={(v) => {
              setAmlFlagFilter(v)
              setPage(1)
            }}
            statusFilter={statusFilter}
            onStatusFilterChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            assignedFilter={assignedFilter}
            onAssignedFilterChange={(v) => {
              setAssignedFilter(v)
              setPage(1)
            }}
            slaFilter={slaFilter}
            onSlaFilterChange={(v) => {
              setSlaFilter(v)
              setPage(1)
            }}
            amlStatusFilter={amlStatusFilter}
            onAmlStatusFilterChange={(v) => {
              setAmlStatusFilter(v)
              setPage(1)
            }}
            suspiciousFilter={suspiciousFilter}
            onSuspiciousFilterChange={(v) => {
              setSuspiciousFilter(v)
              setPage(1)
            }}
            relatedOverlapOnly={relatedOverlapOnly}
            onRelatedOverlapChange={(checked) => {
              setRelatedOverlapOnly(checked)
              setPage(1)
              syncRelatedOverlapUrl(checked)
            }}
            assignedOptions={assignedOptions}
            activeFilterCount={activeFilterCount}
          />
        </CardContent>
      </Card>

      <KycQueueTable
        items={items}
        loading={loading}
        livePresence={livePresence}
        crmHighlightId={crmOpen && crmItem ? crmItem.id : null}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onOpenCrm={openCrm}
        onOpenReview={openReview}
      />

      <KycApplicantCrmDrawer
        open={crmOpen}
        onOpenChange={(o) => {
          setCrmOpen(o)
          if (!o) setCrmItem(null)
        }}
        item={crmItem}
        onCrmDataChanged={() => void fetchQueueRef.current({ silent: true })}
        onOpenFullReview={() => {
          if (!crmItem) return
          setCrmOpen(false)
          openReview(crmItem)
        }}
      />

      {selectedItem ? (
        <KycDetailDialog
          open={detailOpen}
          onOpenChange={closeDetail}
          kycId={selectedItem.id}
          assignees={assignees}
          onUpdated={() => void fetchQueue()}
        />
      ) : null}
    </div>
  )
}
