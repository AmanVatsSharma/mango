/**
 * @file session-security-management.tsx
 * @module admin-console
 * @description Enterprise command-center UI: session registry, incidents, policy, KPIs, exports.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 *
 * Notes:
 * - Incidents list uses userSummaries from API for readable peers + operator playbook in detail dialog.
 * - Policy tab: plain-language labels, tooltips, presets (stored API values unchanged).
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Activity,
  Cpu,
  Copy,
  Download,
  HelpCircle,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader } from "./shared"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import type { SessionSecurityPolicyV1 } from "@/lib/session-security/types"
import {
  formatIncidentSummary,
  getIncidentOperatorGuide,
} from "@/lib/session-security/incident-operator-guide"
import {
  applyPolicyPreset,
  buildPolicyFriendlySummary,
  CONCURRENT_POLICY_OPTIONS,
  INCIDENT_SEVERITY_OPTIONS,
  MULTI_ACCOUNT_ACTION_OPTIONS,
  NETWORK_MODE_OPTIONS,
  POLICY_FIELD_HELP,
  POLICY_PRESET_META,
  REVOKE_REASON_OPTIONS,
  type PolicyPresetId,
} from "@/lib/session-security/policy-admin-labels"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

type SessionRow = {
  id: string
  userId: string
  kind: string
  jti: string | null
  networkKey: string | null
  ipFingerprint?: string | null
  payload?: unknown
  revokedAt: string | null
  lastSeenAt: string
  createdAt: string
  user?: { id: string; email: string | null; clientId: string | null }
}

type IncidentUserSummary = {
  id: string
  email: string | null
  clientId: string | null
  name: string | null
}

type IncidentRow = {
  id: string
  type: string
  status: string
  severity: string
  message: string
  createdAt: string
  updatedAt?: string
  relatedUserIds: string[]
  networkKey?: string | null
  payload?: unknown
}

type Overview = {
  computedAt: string
  activeSessions: number
  openIncidents: number
  totalIncidents: number
  incidents24hByType: Record<string, number>
  incidents7dByType: Record<string, number>
  multiUserNetworkKeys: number
  sessionsCreated24h: number
  revocations24h: number
  policyEnabled: boolean
  redisCacheEnabled: boolean
}

function formatRelativeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function displayNameForIncidentUser(summary: IncidentUserSummary | undefined, userId: string): string {
  if (!summary) return `${userId.slice(0, 8)}…`
  if (summary.email) return summary.email
  if (summary.clientId) return summary.clientId
  if (summary.name) return summary.name
  return `${userId.slice(0, 8)}…`
}

function userInitial(summary: IncidentUserSummary | undefined): string {
  const raw = summary?.name?.trim() || summary?.email?.trim() || summary?.clientId?.trim() || "?"
  return raw.slice(0, 1).toUpperCase()
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (c: string) => `"${c.replace(/"/g, '""')}"`
  const body = rows.map((r) => r.map((x) => esc(String(x))).join(",")).join("\n")
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function PolicyHelpLabel({
  fieldKey,
  htmlFor,
}: {
  fieldKey: keyof typeof POLICY_FIELD_HELP
  htmlFor?: string
}) {
  const help = POLICY_FIELD_HELP[fieldKey]
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-foreground">
        {help.title}
      </Label>
      <Tooltip>
        <TooltipTrigger type="button" className="text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-4 w-4 shrink-0" aria-label="More info" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-sm leading-relaxed">
          {help.body}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-border/60 bg-muted/40"
        />
      ))}
    </div>
  )
}

export function SessionSecurityManagement() {
  const { permissions } = useAdminSession()
  const canManage =
    permissions.includes("admin.session-security.manage") || permissions.includes("admin.all")

  const usersBase = getAdminConsoleRoute("users")

  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsTotal, setSessionsTotal] = useState(0)
  const [sessionsPage, setSessionsPage] = useState(0)
  const [sessionsLimit] = useState(40)
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [incidentsTotal, setIncidentsTotal] = useState(0)
  const [incidentsPage, setIncidentsPage] = useState(0)
  const [timelineIncidents, setTimelineIncidents] = useState<IncidentRow[]>([])
  const [policy, setPolicy] = useState<SessionSecurityPolicyV1 | null>(null)

  const [filterUserId, setFilterUserId] = useState("")
  const [debouncedUserId, setDebouncedUserId] = useState("")
  const [filterKind, setFilterKind] = useState<string>("all")

  const [incFilterStatus, setIncFilterStatus] = useState<string>("all")
  const [incFilterType, setIncFilterType] = useState<string>("all")
  const [incFilterSeverity, setIncFilterSeverity] = useState<string>("all")
  const [incQuery, setIncQuery] = useState("")

  const [selectedIncidentIds, setSelectedIncidentIds] = useState<Set<string>>(new Set())
  const [incidentUserSummaries, setIncidentUserSummaries] = useState<Record<string, IncidentUserSummary>>({})
  const [detailIncident, setDetailIncident] = useState<IncidentRow | null>(null)

  const [detailSession, setDetailSession] = useState<SessionRow | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null)
  const [revokeReason, setRevokeReason] = useState<string>(REVOKE_REASON_OPTIONS[0].value)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const res = await fetch("/api/admin/session-security/overview", { credentials: "include" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Failed overview")
      setOverview(json.data?.overview ?? null)
    } catch (e) {
      toast({ title: "Overview", description: (e as Error).message, variant: "destructive" })
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(sessionsPage))
      params.set("limit", String(sessionsLimit))
      if (debouncedUserId.trim()) params.set("userId", debouncedUserId.trim())
      if (filterKind !== "all") params.set("kind", filterKind)
      const res = await fetch(`/api/admin/session-security/sessions?${params}`, { credentials: "include" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Failed to load sessions")
      setSessions(json.data?.sessions ?? [])
      setSessionsTotal(json.data?.total ?? 0)
    } catch (e) {
      toast({ title: "Sessions", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [debouncedUserId, filterKind, sessionsLimit, sessionsPage])

  // Debounce userId filter to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUserId(filterUserId)
    }, 300)
    return () => clearTimeout(timer)
  }, [filterUserId])

  const loadIncidents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(incidentsPage))
      params.set("limit", "60")
      if (incFilterStatus !== "all") params.set("status", incFilterStatus)
      if (incFilterType !== "all") params.set("type", incFilterType)
      if (incFilterSeverity !== "all") params.set("severity", incFilterSeverity)
      if (incQuery.trim()) params.set("q", incQuery.trim())
      const res = await fetch(`/api/admin/session-security/incidents?${params}`, { credentials: "include" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Failed to load incidents")
      setIncidents(json.data?.incidents ?? [])
      setIncidentUserSummaries(json.data?.userSummaries ?? {})
      setIncidentsTotal(json.data?.total ?? 0)
    } catch (e) {
      toast({ title: "Incidents", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [incFilterStatus, incFilterType, incFilterSeverity, incQuery, incidentsPage])

  const loadTimeline = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session-security/incidents?limit=14&page=0", {
        credentials: "include",
      })
      const json = await res.json()
      if (!res.ok) return
      setTimelineIncidents(json.data?.incidents ?? [])
    } catch {
      /* ignore timeline failures */
    }
  }, [])

  const loadPolicy = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/session-security/policy", { credentials: "include" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Failed to load policy")
      setPolicy(json.data?.policy ?? null)
    } catch (e) {
      toast({ title: "Policy", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
    void loadTimeline()
  }, [loadOverview, loadTimeline])

  useEffect(() => {
    if (tab === "sessions") void loadSessions()
    else if (tab === "incidents") void loadIncidents()
    else if (tab === "policy") void loadPolicy()
  }, [tab, loadSessions, loadIncidents, loadPolicy])

  const policyPreview = useMemo(
    () => (policy ? buildPolicyFriendlySummary(policy) : ""),
    [policy],
  )

  const applyPreset = (preset: PolicyPresetId) => {
    if (!policy || !canManage) return
    setPolicy(applyPolicyPreset(policy, preset))
    toast({
      title: "Preset applied",
      description: "Review values below, then click Save policy to persist.",
    })
  }

  const confirmRevoke = async () => {
    if (!canManage || !revokeTarget?.jti) return
    try {
      const res = await fetch(`/api/admin/session-security/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jti: revokeTarget.jti, reason: revokeReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Revoke failed")
      toast({ title: "Session revoked" })
      setRevokeTarget(null)
      void loadSessions()
      void loadOverview()
    } catch (e) {
      toast({ title: "Revoke", description: (e as Error).message, variant: "destructive" })
    }
  }

  const savePolicy = async () => {
    if (!canManage || !policy) return
    try {
      const res = await fetch(`/api/admin/session-security/policy`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Save failed")
      setPolicy(json.data?.policy ?? policy)
      toast({ title: "Policy saved" })
      void loadOverview()
    } catch (e) {
      toast({ title: "Policy", description: (e as Error).message, variant: "destructive" })
    }
  }

  const patchIncident = async (id: string, status: IncidentRow["status"]): Promise<boolean> => {
    if (!canManage) return false
    try {
      const res = await fetch(`/api/admin/session-security/incidents`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Update failed")
      toast({ title: "Incident updated" })
      void loadIncidents()
      void loadTimeline()
      void loadOverview()
      return true
    } catch (e) {
      toast({ title: "Incident", description: (e as Error).message, variant: "destructive" })
      return false
    }
  }

  const bulkAck = async () => {
    if (!canManage || selectedIncidentIds.size === 0) return
    try {
      const res = await fetch(`/api/admin/session-security/incidents`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIncidentIds), status: "ACKNOWLEDGED" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Bulk update failed")
      toast({ title: "Incidents acknowledged", description: `${selectedIncidentIds.size} updated` })
      setSelectedIncidentIds(new Set())
      void loadIncidents()
      void loadOverview()
    } catch (e) {
      toast({ title: "Bulk update", description: (e as Error).message, variant: "destructive" })
    }
  }

  const exportSessionsCsv = () => {
    const header = ["userId", "email", "clientId", "kind", "jti", "lastSeenAt", "revokedAt", "networkKey"]
    const rows = [header]
    for (const s of sessions) {
      rows.push([
        s.userId,
        s.user?.email ?? "",
        s.user?.clientId ?? "",
        s.kind,
        s.jti ?? "",
        s.lastSeenAt,
        s.revokedAt ?? "",
        s.networkKey ?? "",
      ])
    }
    downloadCsv(`session-registry-page-${sessionsPage}.csv`, rows)
  }

  const exportIncidentsCsv = () => {
    const header = [
      "id",
      "type",
      "status",
      "severity",
      "summary",
      "message",
      "createdAt",
      "networkKey",
      "relatedUserIds",
      "relatedEmails",
      "relatedClientIds",
    ]
    const rows = [header]
    for (const i of incidents) {
      const emails = i.relatedUserIds.map((id) => incidentUserSummaries[id]?.email ?? "").filter(Boolean)
      const clientIds = i.relatedUserIds.map((id) => incidentUserSummaries[id]?.clientId ?? "").filter(Boolean)
      rows.push([
        i.id,
        i.type,
        i.status,
        i.severity,
        formatIncidentSummary(i.type, i.payload),
        i.message,
        i.createdAt,
        i.networkKey ?? "",
        i.relatedUserIds.join(";"),
        emails.join(";"),
        clientIds.join(";"),
      ])
    }
    downloadCsv(`security-incidents-page-${incidentsPage}.csv`, rows)
  }

  const truncateNet = (k: string | null | undefined) => (k && k.length > 10 ? `${k.slice(0, 8)}…` : k ?? "—")

  const severityClass = (sev: string) => {
    if (sev === "CRITICAL" || sev === "HIGH") return "border-destructive/60 bg-destructive/10"
    if (sev === "MEDIUM") return "border-amber-500/40 bg-amber-500/10"
    return "border-border/60 bg-muted/30"
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Session & device security"
        description="Command center for sessions, incidents, and policy. IST-friendly timestamps; not trading risk."
        icon={<Shield className="h-8 w-8 text-primary" />}
      />

      {overviewLoading && !overview ? (
        <KpiSkeleton />
      ) : overview ? (
        <motion.div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.06 } },
          }}
        >
          {[
            { label: "Active sessions", value: overview.activeSessions, icon: Cpu },
            { label: "Open incidents", value: overview.openIncidents, icon: ShieldAlert },
            {
              label: "Shared networks (policy lookback)",
              value: overview.multiUserNetworkKeys,
              icon: Activity,
            },
            { label: "Sessions created (24h)", value: overview.sessionsCreated24h, icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <motion.div
              key={label}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            >
              <Card className="border-border/80 bg-card/80 shadow-sm backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                  <p className="text-xs text-muted-foreground">
                    Policy {overview.policyEnabled ? "on" : "off"} · Revocations 24h: {overview.revocations24h}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {overview ? (
        <Card className="border-dashed border-border/70 bg-muted/20">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Activity & health</CardTitle>
              <CardDescription>
                Overview fetched {new Date(overview.computedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                {" · "}
                {overview.redisCacheEnabled
                  ? "Redis cache may be used when REDIS_URL is set on the server."
                  : "Using in-process cache only (no Redis)."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={overview.redisCacheEnabled ? "default" : "secondary"}>
                Redis {overview.redisCacheEnabled ? "enabled" : "disabled"}
              </Badge>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadOverview()}>
                <RefreshCw className="mr-1 h-4 w-4" />
                Refresh overview
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Incident timeline (latest)
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {timelineIncidents.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setTab("incidents")}
                    className={`min-w-[220px] rounded-lg border p-3 text-left text-xs transition hover:opacity-90 ${severityClass(i.severity)}`}
                  >
                    <div className="font-medium">{i.type}</div>
                    <div className="line-clamp-2 text-muted-foreground">{i.message}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {formatRelativeAgo(i.createdAt)} · {i.status}
                    </div>
                  </button>
                ))}
                {timelineIncidents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No incidents yet.</div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-background/60 p-3">
                <div className="font-medium">24h by type</div>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(overview.incidents24hByType, null, 2)}
                </pre>
              </div>
              <div className="rounded-md border border-border/60 bg-background/60 p-3">
                <div className="font-medium">7d by type</div>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(overview.incidents7dByType, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Using this module</CardTitle>
              <CardDescription>
                Start from KPIs above; drill into Sessions for live registry rows or Incidents for cluster / limit
                events. Policy controls thresholds, STEP_UP, cooldowns, and retention.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu className="h-5 w-5" />
                Registry
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Filter userId"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                  className="w-44"
                />
                <Select value={filterKind} onValueChange={setFilterKind}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Kind" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All kinds</SelectItem>
                    <SelectItem value="WEB_JWT">WEB_JWT</SelectItem>
                    <SelectItem value="MOBILE_SESSION_AUTH">MOBILE_SESSION_AUTH</SelectItem>
                    <SelectItem value="REGISTRATION_SIGHTING">REGISTRATION_SIGHTING</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={exportSessionsCsv} disabled={!sessions.length}>
                  <Download className="mr-1 h-4 w-4" />
                  CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSessionsPage(0)
                    void loadSessions()
                  }}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading && !sessions.length ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Shield className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No active sessions found</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : sessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-1">
                            <span>{s.user?.email || "—"}</span>
                            <Link
                              className="text-primary underline-offset-2 hover:underline"
                              href={`${usersBase}?userId=${encodeURIComponent(s.userId)}`}
                            >
                              Open user
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>{s.kind}</TableCell>
                        <TableCell className="max-w-[100px] font-mono text-[11px]" title={s.networkKey ?? ""}>
                          {truncateNet(s.networkKey)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeAgo(s.lastSeenAt)}
                        </TableCell>
                        <TableCell>
                          {s.revokedAt ? (
                            <Badge variant="secondary">revoked</Badge>
                          ) : (
                            <Badge variant="default">active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" size="sm" variant="outline" onClick={() => setDetailSession(s)}>
                            Details
                          </Button>
                          {canManage && s.jti && !s.revokedAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="ml-2"
                              onClick={() => setRevokeTarget(s)}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Page {sessionsPage + 1} · {sessions.length} of {sessionsTotal} rows
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={sessionsPage <= 0 || loading}
                    onClick={() => setSessionsPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={(sessionsPage + 1) * sessionsLimit >= sessionsTotal || loading}
                    onClick={() => setSessionsPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Security incidents</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={incFilterStatus} onValueChange={(v) => setIncFilterStatus(v)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="OPEN">OPEN</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">ACKNOWLEDGED</SelectItem>
                    <SelectItem value="FALSE_POSITIVE">FALSE_POSITIVE</SelectItem>
                    <SelectItem value="CLOSED">CLOSED</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={incFilterType} onValueChange={(v) => setIncFilterType(v)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="MULTI_USER_SAME_NETWORK">MULTI_USER_SAME_NETWORK</SelectItem>
                    <SelectItem value="CONCURRENT_SESSIONS_EXCEEDED">CONCURRENT_SESSIONS_EXCEEDED</SelectItem>
                    <SelectItem value="SESSION_POLICY_BLOCK">SESSION_POLICY_BLOCK</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={incFilterSeverity} onValueChange={(v) => setIncFilterSeverity(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sev</SelectItem>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search message"
                  value={incQuery}
                  onChange={(e) => setIncQuery(e.target.value)}
                  className="w-48"
                />
                {canManage ? (
                  <Button type="button" variant="secondary" size="sm" onClick={bulkAck}>
                    Ack selected ({selectedIncidentIds.size})
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={exportIncidentsCsv} disabled={!incidents.length}>
                  <Download className="mr-1 h-4 w-4" />
                  CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadIncidents()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage ? (
                      <TableHead className="w-10">
                        <span className="sr-only">Select</span>
                      </TableHead>
                    ) : null}
                    <TableHead>Summary</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[200px]">Affected users</TableHead>
                    <TableHead>Network key</TableHead>
                    <TableHead>When (IST)</TableHead>
                    <TableHead className="w-[100px]">Details</TableHead>
                    {canManage ? <TableHead className="min-w-[150px]">Update status</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((i) => (
                    <TableRow key={i.id}>
                      {canManage ? (
                        <TableCell>
                          <Checkbox
                            checked={selectedIncidentIds.has(i.id)}
                            onCheckedChange={(c) => {
                              setSelectedIncidentIds((prev) => {
                                const next = new Set(prev)
                                if (c === true) next.add(i.id)
                                else next.delete(i.id)
                                return next
                              })
                            }}
                            aria-label={`Select incident ${i.id}`}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="max-w-[220px] text-xs leading-snug">
                        <span className="font-medium">{formatIncidentSummary(i.type, i.payload)}</span>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground" title={i.message}>
                          {i.message}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="font-normal" title={i.type}>
                          {i.type.split("_").join(" ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{i.severity}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{i.status}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex max-w-[280px] flex-col gap-1.5">
                          {i.relatedUserIds.slice(0, 4).map((uid) => {
                            const sum = incidentUserSummaries[uid]
                            return (
                              <Link
                                key={uid}
                                href={`${usersBase}?userId=${encodeURIComponent(uid)}`}
                                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] hover:bg-muted/60"
                              >
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold"
                                  aria-hidden
                                >
                                  {userInitial(sum)}
                                </span>
                                <span className="min-w-0 truncate" title={uid}>
                                  {displayNameForIncidentUser(sum, uid)}
                                </span>
                              </Link>
                            )
                          })}
                          {i.relatedUserIds.length > 4 ? (
                            <button
                              type="button"
                              className="text-left text-[11px] text-primary underline-offset-2 hover:underline"
                              onClick={() => setDetailIncident(i)}
                            >
                              +{i.relatedUserIds.length - 4} more (open details)
                            </button>
                          ) : null}
                          {i.relatedUserIds.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground">No user ids</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[100px] font-mono text-[10px]">
                        <span className="mr-1 align-middle">{truncateNet(i.networkKey)}</span>
                        {i.networkKey ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Copy network key"
                            onClick={() => {
                              void navigator.clipboard.writeText(i.networkKey ?? "")
                              toast({ title: "Copied network key hash" })
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(i.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          aria-label={`Incident details ${i.id}`}
                          onClick={() => setDetailIncident(i)}
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                          View
                        </Button>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <Select
                            value={i.status}
                            onValueChange={(v) => patchIncident(i.id, v as IncidentRow["status"])}
                          >
                            <SelectTrigger className="h-8 w-[140px]" aria-label={`Status for ${i.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OPEN">OPEN</SelectItem>
                              <SelectItem value="ACKNOWLEDGED">ACKNOWLEDGED</SelectItem>
                              <SelectItem value="FALSE_POSITIVE">FALSE_POSITIVE</SelectItem>
                              <SelectItem value="CLOSED">CLOSED</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Page {incidentsPage + 1} · showing {incidents.length} / {incidentsTotal}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={incidentsPage <= 0 || loading}
                    onClick={() => setIncidentsPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={(incidentsPage + 1) * 60 >= incidentsTotal || loading}
                    onClick={() => setIncidentsPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Blocking actions need care</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              &quot;Block sign-in&quot; or &quot;Block new sign-ups&quot; can stop legitimate users on shared networks (offices, coffee
              shops, mobile NAT). Prefer <strong>Notify only</strong> or <strong>Extra verification</strong> until abuse is confirmed.
            </AlertDescription>
          </Alert>
          <TooltipProvider delayDuration={200}>
            <Card>
              <CardHeader>
                <CardTitle>Session security policy</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{policyPreview}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {policy ? (
                  <>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
                      <div className="text-sm font-medium text-foreground">Quick start presets</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applies a bundle of settings. Review the form, then click <span className="font-medium">Save policy</span>.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(["recommended", "shared_workspace", "high_assurance"] as PolicyPresetId[]).map((id) => (
                          <Button key={id} type="button" size="sm" variant="secondary"
                            title={POLICY_PRESET_META[id].description} disabled={!canManage} onClick={() => applyPreset(id)}>
                            {POLICY_PRESET_META[id].title}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">1 · Session limits</CardTitle>
                          <CardDescription>How many devices, idle time, and what happens when full.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <PolicyHelpLabel fieldKey="enabled" />
                            <Select value={policy.enabled ? "true" : "false"} onValueChange={(v) => setPolicy({ ...policy, enabled: v === "true" })} disabled={!canManage}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">On</SelectItem>
                                <SelectItem value="false">Off</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="maxConcurrentSessions" />
                            <Input type="number" className="mt-1" value={policy.maxConcurrentSessions}
                              onChange={(e) => setPolicy({ ...policy, maxConcurrentSessions: Number(e.target.value) || 1 })} disabled={!canManage} />
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="sessionIdleTtlMinutes" />
                            <Input type="number" className="mt-1" value={policy.sessionIdleTtlMinutes}
                              onChange={(e) => setPolicy({ ...policy, sessionIdleTtlMinutes: Number(e.target.value) || 5 })} disabled={!canManage} />
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="concurrentSessionPolicy" />
                            <Select value={policy.concurrentSessionPolicy} onValueChange={(v) => setPolicy({ ...policy, concurrentSessionPolicy: v as SessionSecurityPolicyV1["concurrentSessionPolicy"] })} disabled={!canManage}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CONCURRENT_POLICY_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} title={o.hint}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">2 · Shared networks</CardTitle>
                          <CardDescription>Many accounts from the same place (offices, VPNs, carriers).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <PolicyHelpLabel fieldKey="networkClusterMode" />
                            <Select value={policy.networkClusterMode} onValueChange={(v) => setPolicy({ ...policy, networkClusterMode: v as SessionSecurityPolicyV1["networkClusterMode"] })} disabled={!canManage}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {NETWORK_MODE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} title={o.hint}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="multiAccountDistinctUserThreshold" />
                            <Input type="number" className="mt-1" value={policy.multiAccountDistinctUserThreshold}
                              onChange={(e) => setPolicy({ ...policy, multiAccountDistinctUserThreshold: Number(e.target.value) || 1 })} disabled={!canManage} />
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="multiAccountLookbackHours" />
                            <Input type="number" className="mt-1" value={policy.multiAccountLookbackHours}
                              onChange={(e) => setPolicy({ ...policy, multiAccountLookbackHours: Number(e.target.value) || 1 })} disabled={!canManage} />
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">3 · Enforcement &amp; step-up</CardTitle>
                          <CardDescription>What happens when the threshold is reached.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <PolicyHelpLabel fieldKey="multiAccountAction" />
                            <Select value={policy.multiAccountAction} onValueChange={(v) => setPolicy({ ...policy, multiAccountAction: v as SessionSecurityPolicyV1["multiAccountAction"] })} disabled={!canManage}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {MULTI_ACCOUNT_ACTION_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} title={o.hint}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <PolicyHelpLabel fieldKey="stepUpRequiresMpin" />
                            <Select value={policy.stepUpRequiresMpin ? "true" : "false"} onValueChange={(v) => setPolicy({ ...policy, stepUpRequiresMpin: v === "true" })} disabled={!canManage || policy.multiAccountAction !== "STEP_UP"}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Required</SelectItem>
                                <SelectItem value="false">Not required</SelectItem>
                              </SelectContent>
                            </Select>
                            {policy.multiAccountAction !== "STEP_UP" ? (
                              <p className="mt-1 text-xs text-muted-foreground">Applies when enforcement is Extra verification (step-up).</p>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <Accordion type="single" collapsible className="rounded-lg border border-border/60">
                      <AccordionItem value="advanced">
                        <AccordionTrigger className="px-4 text-sm font-medium hover:no-underline">
                          Advanced — incident noise, retention &amp; severity
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <PolicyHelpLabel fieldKey="incidentCooldownMinutes" />
                              <Input type="number" className="mt-1" value={policy.incidentCooldownMinutes}
                                onChange={(e) => setPolicy({ ...policy, incidentCooldownMinutes: Math.max(0, Number(e.target.value) || 0) })} disabled={!canManage} />
                            </div>
                            <div>
                              <PolicyHelpLabel fieldKey="resolvedIncidentRetentionDays" />
                              <Input type="number" className="mt-1" value={policy.resolvedIncidentRetentionDays}
                                onChange={(e) => setPolicy({ ...policy, resolvedIncidentRetentionDays: Math.max(0, Number(e.target.value) || 0) })} disabled={!canManage} />
                            </div>
                            <div>
                              <PolicyHelpLabel fieldKey="clusterIncidentSeverity" />
                              <Select value={policy.clusterIncidentSeverity ?? "default"} onValueChange={(v) => setPolicy({ ...policy, clusterIncidentSeverity: v === "default" ? undefined : (v as SessionSecurityPolicyV1["clusterIncidentSeverity"]) })} disabled={!canManage}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {INCIDENT_SEVERITY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value} title={o.hint}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <PolicyHelpLabel fieldKey="concurrentIncidentSeverity" />
                              <Select value={policy.concurrentIncidentSeverity ?? "default"} onValueChange={(v) => setPolicy({ ...policy, concurrentIncidentSeverity: v === "default" ? undefined : (v as SessionSecurityPolicyV1["concurrentIncidentSeverity"]) })} disabled={!canManage}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {INCIDENT_SEVERITY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value} title={o.hint}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                    {canManage ? <Button type="button" onClick={savePolicy}>Save policy</Button> : null}
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">Loading…</div>
                )}
              </CardContent>
            </Card>
          </TooltipProvider>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(detailIncident)} onOpenChange={(o) => !o && setDetailIncident(null)}>
        <DialogContent className="max-h-[min(90vh,900px)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Security incident detail</DialogTitle>
            <DialogDescription>
              {detailIncident
                ? `${formatIncidentSummary(detailIncident.type, detailIncident.payload)} · ${detailIncident.type}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {detailIncident ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Message</div>
                <p className="mt-1 whitespace-pre-wrap">{detailIncident.message}</p>
              </div>
              <div className="grid gap-1 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <div>
                  Created:{" "}
                  {new Date(detailIncident.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    dateStyle: "medium",
                    timeStyle: "medium",
                  })}
                </div>
                {detailIncident.updatedAt ? (
                  <div>
                    Updated:{" "}
                    {new Date(detailIncident.updatedAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "medium",
                    })}
                  </div>
                ) : null}
                <div>
                  Severity: {detailIncident.severity} · Status: {detailIncident.status}
                </div>
                {detailIncident.networkKey ? (
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="break-all">Network key: {detailIncident.networkKey}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        void navigator.clipboard.writeText(detailIncident.networkKey ?? "")
                        toast({ title: "Copied network key" })
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                ) : null}
              </div>
              {(() => {
                const guide = getIncidentOperatorGuide({
                  type: detailIncident.type,
                  payload: detailIncident.payload,
                  status: detailIncident.status,
                })
                return (
                  <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
                    <div className="text-xs font-semibold text-primary">What to do</div>
                    <p className="mt-2 text-sm leading-relaxed">{guide.headline}</p>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
                      {guide.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )
              })()}
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Affected users ({detailIncident.relatedUserIds.length})
                </div>
                <ul className="mt-2 space-y-2">
                  {detailIncident.relatedUserIds.map((uid) => {
                    const sum = incidentUserSummaries[uid]
                    return (
                      <li key={uid}>
                        <Link
                          href={`${usersBase}?userId=${encodeURIComponent(uid)}`}
                          className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-2 hover:bg-muted/50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold">
                            {userInitial(sum)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{displayNameForIncidentUser(sum, uid)}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">{uid}</div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payload (JSON)</div>
                <pre className="mt-2 max-h-[200px] overflow-auto rounded-md bg-muted p-3 text-[11px]">
                  {detailIncident.payload != null
                    ? JSON.stringify(detailIncident.payload, null, 2)
                    : "—"}
                </pre>
              </div>
              {canManage ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="incident-detail-status">Update status</Label>
                  <Select
                    value={detailIncident.status}
                    onValueChange={async (v) => {
                      const ok = await patchIncident(detailIncident.id, v as IncidentRow["status"])
                      if (ok) {
                        setDetailIncident((prev) =>
                          prev && prev.id === detailIncident.id ? { ...prev, status: v } : prev,
                        )
                      }
                    }}
                  >
                    <SelectTrigger id="incident-detail-status" className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">OPEN</SelectItem>
                      <SelectItem value="ACKNOWLEDGED">ACKNOWLEDGED</SelectItem>
                      <SelectItem value="FALSE_POSITIVE">FALSE_POSITIVE</SelectItem>
                      <SelectItem value="CLOSED">CLOSED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailSession)} onOpenChange={(o) => !o && setDetailSession(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session details</DialogTitle>
            <DialogDescription>Registry payload for support and audit.</DialogDescription>
          </DialogHeader>
          {detailSession ? (
            <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-[11px]">
              {JSON.stringify(detailSession, null, 2)}
            </pre>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revokeTarget)} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session</DialogTitle>
            <DialogDescription>This invalidates the browser credential (jti) for the user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason code</Label>
            <Select value={revokeReason} onValueChange={(v) => setRevokeReason(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVOKE_REASON_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRevoke()}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
