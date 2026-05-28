/**
 * @file user-segments.tsx
 * @module admin-console
 * @description User Segments & Rule Sets — MT5-style group management.
 *   Tab 1 "Segments": Create named user groups, add/remove members, assign rule sets.
 *   Tab 2 "Rule Sets": Create leverage/brokerage/limits override policies assigned to segments.
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Users,
  ChevronRight,
  X,
  Loader2,
  Search,
  CheckCircle,
  Circle,
  ShieldCheck,
  Tag,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/admin-console/shared"
import { toast } from "@/hooks/use-toast"

// ─── Types ───────────────────────────────────────────────────────────────────

type SegmentPolicy = {
  segmentId: string
  policyId: string
  priority: number
  policy: RuleSet
}

type SegmentMember = {
  userId: string
  segmentId: string
  addedAt: string
  user: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    clientId: string | null
    role: string
    isActive: boolean
  }
}

type Segment = {
  id: string
  name: string
  description: string | null
  color: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { members: number; policies: number }
  policies: SegmentPolicy[]
  members?: SegmentMember[]
}

type RuleSetSegment = {
  segmentId: string
  policyId: string
  priority: number
  segment: { id: string; name: string; color: string | null; isActive: boolean }
}

type RuleSet = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  leverage: string | null
  brokerageFlat: string | null
  brokerageRate: string | null
  maxDailyLoss: string | null
  maxDailyTrades: number | null
  maxPositions: number | null
  maxOrderValue: string | null
  allowedSegments: string[]
  createdAt: string
  updatedAt: string
  _count?: { segments: number }
  segments?: RuleSetSegment[]
}

const SEGMENT_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#EF4444",
  "#F59E0B", "#10B981", "#14B8A6", "#3B82F6",
]

const MARKET_SEGMENTS = ["NSE", "NFO", "BSE", "MCX", "CDS", "NCO", "BCD", "CRYPTO"]

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-primary mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Rule Pill ────────────────────────────────────────────────────────────────

function RulePills({ rs }: { rs: RuleSet }) {
  const pills: string[] = []
  if (rs.leverage) pills.push(`${rs.leverage}× leverage`)
  if (rs.brokerageFlat) pills.push(`₹${rs.brokerageFlat} flat`)
  if (rs.brokerageRate) pills.push(`${Number(rs.brokerageRate) * 100}% brokerage`)
  if (rs.maxDailyLoss) pills.push(`₹${Number(rs.maxDailyLoss).toLocaleString("en-IN")} daily loss cap`)
  if (rs.maxDailyTrades) pills.push(`${rs.maxDailyTrades} trades/day`)
  if (rs.maxPositions) pills.push(`${rs.maxPositions} max pos`)
  if (rs.maxOrderValue) pills.push(`₹${Number(rs.maxOrderValue).toLocaleString("en-IN")} max order`)
  if (rs.allowedSegments.length > 0) pills.push(rs.allowedSegments.join("+") + " only")
  if (pills.length === 0) return <span className="text-xs text-muted-foreground">All inherited</span>
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((p) => (
        <Badge key={p} variant="secondary" className="text-xs font-normal">{p}</Badge>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UserSegmentsPage() {
  const [tab, setTab] = useState("segments")
  const [segments, setSegments] = useState<Segment[]>([])
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  // Segment drawer
  const [drawerSegment, setDrawerSegment] = useState<Segment | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState("")
  const [addMemberQuery, setAddMemberQuery] = useState("")
  const [addMemberLoading, setAddMemberLoading] = useState(false)

  // Segment form dialog
  const [segmentDialog, setSegmentDialog] = useState(false)
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [segForm, setSegForm] = useState({ name: "", description: "", color: "#6366F1" })
  const [segSaving, setSegSaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ type: "segment" | "ruleset"; id: string; name: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Rule set form dialog
  const [rsDialog, setRsDialog] = useState(false)
  const [editingRs, setEditingRs] = useState<RuleSet | null>(null)
  const [rsForm, setRsForm] = useState({
    name: "", description: "",
    leverage: "", brokerageFlat: "", brokerageRate: "",
    maxDailyLoss: "", maxDailyTrades: "", maxPositions: "", maxOrderValue: "",
    allowedSegments: [] as string[],
  })
  const [rsSaving, setRsSaving] = useState(false)

  // Assign policy to segment
  const [assignDialog, setAssignDialog] = useState<{ segmentId: string } | null>(null)
  const [assignPolicyId, setAssignPolicyId] = useState("")
  const [assignPriority, setAssignPriority] = useState("0")
  const [assignLoading, setAssignLoading] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchSegments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/segments")
      if (!res.ok) throw new Error("Failed to fetch segments")
      const data = await res.json()
      setSegments(data.segments ?? [])
    } catch {
      toast({ title: "Error", description: "Could not load segments", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRuleSets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/policies")
      if (!res.ok) throw new Error("Failed to fetch rule sets")
      const data = await res.json()
      setRuleSets(data.policies ?? [])
    } catch {
      toast({ title: "Error", description: "Could not load rule sets", variant: "destructive" })
    }
  }, [])

  const fetchDrawerSegment = useCallback(async (id: string) => {
    setDrawerLoading(true)
    try {
      const res = await fetch(`/api/admin/segments/${id}`)
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      setDrawerSegment(data.segment)
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSegments()
    void fetchRuleSets()
  }, [fetchSegments, fetchRuleSets])

  // ── Segment CRUD ───────────────────────────────────────────────────────────

  const openCreateSegment = () => {
    setEditingSegment(null)
    setSegForm({ name: "", description: "", color: "#6366F1" })
    setSegmentDialog(true)
  }

  const openEditSegment = (s: Segment) => {
    setEditingSegment(s)
    setSegForm({ name: s.name, description: s.description ?? "", color: s.color ?? "#6366F1" })
    setSegmentDialog(true)
  }

  const saveSegment = async () => {
    if (!segForm.name.trim()) {
      toast({ title: "Validation", description: "Name is required", variant: "destructive" })
      return
    }
    setSegSaving(true)
    try {
      const url = editingSegment ? `/api/admin/segments/${editingSegment.id}` : "/api/admin/segments"
      const method = editingSegment ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(segForm),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Save failed")
      }
      setSegmentDialog(false)
      await fetchSegments()
      toast({ title: editingSegment ? "Segment updated" : "Segment created" })
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSegSaving(false)
    }
  }

  const toggleSegmentActive = async (s: Segment) => {
    await fetch(`/api/admin/segments/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    })
    await fetchSegments()
    if (drawerSegment?.id === s.id) await fetchDrawerSegment(s.id)
  }

  // ── Member management ─────────────────────────────────────────────────────

  const addMemberByClientId = async () => {
    if (!drawerSegment || !addMemberQuery.trim()) return
    setAddMemberLoading(true)
    try {
      // Search users by clientId or email
      const searchRes = await fetch(`/api/admin/users?search=${encodeURIComponent(addMemberQuery.trim())}&limit=5`)
      const searchData = await searchRes.json()
      const found = searchData.users?.[0]
      if (!found) {
        toast({ title: "Not found", description: "No user found for that query", variant: "destructive" })
        return
      }
      const res = await fetch(`/api/admin/segments/${drawerSegment.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: found.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Failed to add member")
      }
      setAddMemberQuery("")
      await fetchDrawerSegment(drawerSegment.id)
      toast({ title: "Member added", description: found.name ?? found.email ?? found.id })
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAddMemberLoading(false)
    }
  }

  const removeMember = async (userId: string) => {
    if (!drawerSegment) return
    try {
      await fetch(`/api/admin/segments/${drawerSegment.id}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" })
      await fetchDrawerSegment(drawerSegment.id)
      toast({ title: "Member removed" })
    } catch {
      toast({ title: "Error removing member", variant: "destructive" })
    }
  }

  // ── Policy assignment ─────────────────────────────────────────────────────

  const assignPolicy = async () => {
    if (!assignDialog || !assignPolicyId) return
    setAssignLoading(true)
    try {
      const res = await fetch(`/api/admin/segments/${assignDialog.segmentId}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: assignPolicyId, priority: Number(assignPriority) }),
      })
      if (!res.ok) throw new Error("Failed to assign rule set")
      setAssignDialog(null)
      setAssignPolicyId("")
      setAssignPriority("0")
      await fetchSegments()
      if (drawerSegment?.id === assignDialog.segmentId) await fetchDrawerSegment(assignDialog.segmentId)
      toast({ title: "Rule set assigned" })
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAssignLoading(false)
    }
  }

  const unassignPolicy = async (segmentId: string, policyId: string) => {
    try {
      await fetch(`/api/admin/segments/${segmentId}/policies?policyId=${encodeURIComponent(policyId)}`, { method: "DELETE" })
      await fetchSegments()
      if (drawerSegment?.id === segmentId) await fetchDrawerSegment(segmentId)
      toast({ title: "Rule set unassigned" })
    } catch {
      toast({ title: "Error unassigning rule set", variant: "destructive" })
    }
  }

  // ── Rule Set CRUD ──────────────────────────────────────────────────────────

  const openCreateRuleSet = () => {
    setEditingRs(null)
    setRsForm({ name: "", description: "", leverage: "", brokerageFlat: "", brokerageRate: "", maxDailyLoss: "", maxDailyTrades: "", maxPositions: "", maxOrderValue: "", allowedSegments: [] })
    setRsDialog(true)
  }

  const openEditRuleSet = (rs: RuleSet) => {
    setEditingRs(rs)
    setRsForm({
      name: rs.name,
      description: rs.description ?? "",
      leverage: rs.leverage ?? "",
      brokerageFlat: rs.brokerageFlat ?? "",
      brokerageRate: rs.brokerageRate ?? "",
      maxDailyLoss: rs.maxDailyLoss ?? "",
      maxDailyTrades: rs.maxDailyTrades != null ? String(rs.maxDailyTrades) : "",
      maxPositions: rs.maxPositions != null ? String(rs.maxPositions) : "",
      maxOrderValue: rs.maxOrderValue ?? "",
      allowedSegments: rs.allowedSegments ?? [],
    })
    setRsDialog(true)
  }

  const saveRuleSet = async () => {
    if (!rsForm.name.trim()) {
      toast({ title: "Validation", description: "Name is required", variant: "destructive" })
      return
    }
    setRsSaving(true)
    try {
      const url = editingRs ? `/api/admin/policies/${editingRs.id}` : "/api/admin/policies"
      const method = editingRs ? "PATCH" : "POST"
      const toOptionalNum = (v: string) => v.trim() === "" ? null : v.trim()
      const toOptionalInt = (v: string) => v.trim() === "" ? null : parseInt(v.trim(), 10)
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rsForm.name.trim(),
          description: rsForm.description.trim() || null,
          leverage: toOptionalNum(rsForm.leverage),
          brokerageFlat: toOptionalNum(rsForm.brokerageFlat),
          brokerageRate: toOptionalNum(rsForm.brokerageRate),
          maxDailyLoss: toOptionalNum(rsForm.maxDailyLoss),
          maxDailyTrades: toOptionalInt(rsForm.maxDailyTrades),
          maxPositions: toOptionalInt(rsForm.maxPositions),
          maxOrderValue: toOptionalNum(rsForm.maxOrderValue),
          allowedSegments: rsForm.allowedSegments,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Save failed")
      }
      setRsDialog(false)
      await fetchRuleSets()
      toast({ title: editingRs ? "Rule set updated" : "Rule set created" })
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setRsSaving(false)
    }
  }

  const toggleRsActive = async (rs: RuleSet) => {
    await fetch(`/api/admin/policies/${rs.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rs.isActive }),
    })
    await fetchRuleSets()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const url = deleteTarget.type === "segment"
        ? `/api/admin/segments/${deleteTarget.id}`
        : `/api/admin/policies/${deleteTarget.id}`
      await fetch(url, { method: "DELETE" })
      setDeleteTarget(null)
      if (deleteTarget.type === "segment") {
        await fetchSegments()
        if (drawerSegment?.id === deleteTarget.id) setDrawerSegment(null)
      } else {
        await fetchRuleSets()
      }
      toast({ title: "Deleted successfully" })
    } catch {
      toast({ title: "Delete failed", variant: "destructive" })
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredSegments = useMemo(() => {
    const q = search.toLowerCase()
    return segments.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)
    )
  }, [segments, search])

  const filteredRuleSets = useMemo(() => {
    const q = search.toLowerCase()
    return ruleSets.filter((r) =>
      !q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q)
    )
  }, [ruleSets, search])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return (drawerSegment?.members ?? []).filter((m) =>
      !q ||
      (m.user.name ?? "").toLowerCase().includes(q) ||
      (m.user.email ?? "").toLowerCase().includes(q) ||
      (m.user.clientId ?? "").toLowerCase().includes(q)
    )
  }, [drawerSegment?.members, memberSearch])

  const assignableRuleSets = useMemo(() => {
    if (!assignDialog) return ruleSets
    const already = new Set(
      segments.find((s) => s.id === assignDialog.segmentId)?.policies.map((p) => p.policyId) ?? []
    )
    return ruleSets.filter((r) => r.isActive && !already.has(r.id))
  }, [ruleSets, segments, assignDialog])

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalMembers = segments.reduce((acc, s) => acc + s._count.members, 0)

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="User Segments"
        description="Group users into segments and apply trading rule sets — MT5-style group management"
        icon={<Layers className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => { void fetchSegments(); void fetchRuleSets() }}>
            Refresh
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Segments" value={segments.length} />
        <StatCard label="Active Segments" value={segments.filter((s) => s.isActive).length} />
        <StatCard label="Total Members" value={totalMembers} sub="across all segments" />
        <StatCard label="Rule Sets" value={ruleSets.length} sub={`${ruleSets.filter((r) => r.isActive).length} active`} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList>
            <TabsTrigger value="segments" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Segments
            </TabsTrigger>
            <TabsTrigger value="rulesets" className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Rule Sets
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs bg-background border-border w-52"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {tab === "segments" ? (
              <Button size="sm" onClick={openCreateSegment}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                New Segment
              </Button>
            ) : (
              <Button size="sm" onClick={openCreateRuleSet}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                New Rule Set
              </Button>
            )}
          </div>
        </div>

        {/* ── Segments Tab ── */}
        <TabsContent value="segments">
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredSegments.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {segments.length === 0 ? "No segments yet. Click \"New Segment\" to create one." : "No segments match your search."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead>Segment</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>Rule Sets</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSegments.map((s) => (
                        <TableRow
                          key={s.id}
                          className="border-border hover:bg-muted/20 cursor-pointer"
                          onClick={() => { setMemberSearch(""); void fetchDrawerSegment(s.id) }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ background: s.color ?? "#6366F1" }}
                              />
                              <div>
                                <p className="font-medium text-foreground text-sm">{s.name}</p>
                                {s.description && (
                                  <p className="text-xs text-muted-foreground">{s.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              {s._count.members}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {s.policies.length === 0 ? (
                                <span className="text-xs text-muted-foreground">None</span>
                              ) : (
                                s.policies.map((sp) => (
                                  <Badge key={sp.policyId} variant="outline" className="text-xs">
                                    <Tag className="w-3 h-3 mr-1" />
                                    {sp.policy.name}
                                    {sp.priority > 0 && (
                                      <span className="ml-1 text-muted-foreground">p{sp.priority}</span>
                                    )}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={s.isActive}
                              onCheckedChange={() => void toggleSegmentActive(s)}
                            />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditSegment(s)} title="Edit">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({ type: "segment", id: s.id, name: s.name })}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setMemberSearch(""); void fetchDrawerSegment(s.id) }}
                                title="View details"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rule Sets Tab ── */}
        <TabsContent value="rulesets">
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-0">
              {filteredRuleSets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {ruleSets.length === 0 ? "No rule sets yet. Click \"New Rule Set\" to create one." : "No rule sets match your search."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead>Rule Set</TableHead>
                        <TableHead>Rules</TableHead>
                        <TableHead>Segments</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRuleSets.map((rs) => (
                        <TableRow key={rs.id} className="border-border hover:bg-muted/20">
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground text-sm">{rs.name}</p>
                              {rs.description && (
                                <p className="text-xs text-muted-foreground">{rs.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <RulePills rs={rs} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(rs.segments ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground">Unassigned</span>
                              ) : (
                                (rs.segments ?? []).map((ss) => (
                                  <Badge
                                    key={ss.segmentId}
                                    variant="secondary"
                                    className="text-xs"
                                    style={{ borderColor: ss.segment.color ?? undefined }}
                                  >
                                    {ss.segment.name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={rs.isActive}
                              onCheckedChange={() => void toggleRsActive(rs)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditRuleSet(rs)} title="Edit">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({ type: "ruleset", id: rs.id, name: rs.name })}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Segment Detail Dialog ── */}
      <Dialog open={!!drawerSegment} onOpenChange={(open: boolean) => { if (!open) setDrawerSegment(null) }}>
        <DialogContent className="sm:max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto">
          {drawerSegment && (
            <>
              <DialogHeader className="mb-2">
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: drawerSegment.color ?? "#6366F1" }} />
                  {drawerSegment.name}
                </DialogTitle>
                {drawerSegment.description && (
                  <p className="text-xs text-muted-foreground">{drawerSegment.description}</p>
                )}
              </DialogHeader>

              {drawerLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (
                <div className="space-y-6">
                  {/* Assigned Rule Sets */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-foreground">Rule Sets</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAssignDialog({ segmentId: drawerSegment.id })}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Assign
                      </Button>
                    </div>
                    {drawerSegment.policies.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No rule sets assigned.</p>
                    ) : (
                      <div className="space-y-2">
                        {drawerSegment.policies.map((sp) => (
                          <div key={sp.policyId} className="flex items-start justify-between bg-muted/20 rounded p-2 gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{sp.policy.name}</p>
                              <div className="mt-1"><RulePills rs={sp.policy} /></div>
                              <p className="text-xs text-muted-foreground mt-1">Priority: {sp.priority}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void unassignPolicy(drawerSegment.id, sp.policyId)}
                            >
                              <X className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Members */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Members ({drawerSegment._count.members})
                    </p>

                    {/* Add member */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        className="text-xs bg-background border-border h-8"
                        placeholder="Search by clientId, email, or name…"
                        value={addMemberQuery}
                        onChange={(e) => setAddMemberQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void addMemberByClientId() }}
                      />
                      <Button size="sm" variant="outline" onClick={() => void addMemberByClientId()} disabled={addMemberLoading}>
                        {addMemberLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      </Button>
                    </div>

                    {/* Member filter */}
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        className="pl-7 h-7 text-xs bg-background border-border"
                        placeholder="Filter members…"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                    </div>

                    {filteredMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        {(drawerSegment.members ?? []).length === 0 ? "No members. Add one above." : "No members match filter."}
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {filteredMembers.map((m) => (
                          <div key={m.userId} className="flex items-center justify-between bg-muted/20 rounded px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{m.user.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.user.clientId ? `#${m.user.clientId} · ` : ""}{m.user.email ?? m.user.phone ?? ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              {m.user.isActive ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => void removeMember(m.userId)}
                              >
                                <X className="w-3 h-3 text-red-400" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Segment Dialog ── */}
      <Dialog open={segmentDialog} onOpenChange={setSegmentDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingSegment ? "Edit Segment" : "New Segment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                className="mt-1 bg-background border-border"
                value={segForm.name}
                onChange={(e) => setSegForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. VIP Traders"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                className="mt-1 bg-background border-border text-sm"
                rows={2}
                value={segForm.description}
                onChange={(e) => setSegForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {SEGMENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-6 h-6 rounded-full border-2 transition-all"
                    style={{
                      background: c,
                      borderColor: segForm.color === c ? "white" : "transparent",
                    }}
                    onClick={() => setSegForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSegmentDialog(false)} disabled={segSaving}>Cancel</Button>
            <Button onClick={() => void saveSegment()} disabled={segSaving}>
              {segSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSegment ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Rule Set Dialog ── */}
      <Dialog open={rsDialog} onOpenChange={setRsDialog}>
        <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingRs ? "Edit Rule Set" : "New Rule Set"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Leave any field blank to inherit from global platform config.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="mt-1 bg-background border-border" value={rsForm.name} onChange={(e) => setRsForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. VIP 5× Leverage" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="mt-1 bg-background border-border text-sm" rows={2} value={rsForm.description} onChange={(e) => setRsForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Leverage (×)</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="1" step="0.5" value={rsForm.leverage} onChange={(e) => setRsForm((f) => ({ ...f, leverage: e.target.value }))} placeholder="Inherit" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Brokerage flat (₹/trade)</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" step="0.01" value={rsForm.brokerageFlat} onChange={(e) => setRsForm((f) => ({ ...f, brokerageFlat: e.target.value }))} placeholder="Inherit" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Brokerage rate (decimal)</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" step="0.0001" value={rsForm.brokerageRate} onChange={(e) => setRsForm((f) => ({ ...f, brokerageRate: e.target.value }))} placeholder="e.g. 0.0003" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max daily loss (₹)</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" value={rsForm.maxDailyLoss} onChange={(e) => setRsForm((f) => ({ ...f, maxDailyLoss: e.target.value }))} placeholder="Inherit" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max daily trades</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" step="1" value={rsForm.maxDailyTrades} onChange={(e) => setRsForm((f) => ({ ...f, maxDailyTrades: e.target.value }))} placeholder="Inherit" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max positions</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" step="1" value={rsForm.maxPositions} onChange={(e) => setRsForm((f) => ({ ...f, maxPositions: e.target.value }))} placeholder="Inherit" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Max order value (₹)</Label>
                <Input className="mt-1 bg-background border-border" type="number" min="0" value={rsForm.maxOrderValue} onChange={(e) => setRsForm((f) => ({ ...f, maxOrderValue: e.target.value }))} placeholder="Inherit" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Allowed market segments (empty = all)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {MARKET_SEGMENTS.map((seg) => {
                  const active = rsForm.allowedSegments.includes(seg)
                  return (
                    <button
                      key={seg}
                      type="button"
                      onClick={() =>
                        setRsForm((f) => ({
                          ...f,
                          allowedSegments: active
                            ? f.allowedSegments.filter((s) => s !== seg)
                            : [...f.allowedSegments, seg],
                        }))
                      }
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/20 text-muted-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {seg}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRsDialog(false)} disabled={rsSaving}>Cancel</Button>
            <Button onClick={() => void saveRuleSet()} disabled={rsSaving}>
              {rsSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRs ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Rule Set Dialog ── */}
      <Dialog open={!!assignDialog} onOpenChange={(open) => { if (!open) setAssignDialog(null) }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Assign Rule Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Rule Set</Label>
              <Select value={assignPolicyId} onValueChange={setAssignPolicyId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="— Select rule set —" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRuleSets.length === 0 ? (
                    <div className="text-xs text-muted-foreground p-2">All active rule sets are already assigned.</div>
                  ) : (
                    assignableRuleSets.map((rs) => (
                      <SelectItem key={rs.id} value={rs.id}>{rs.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Priority (higher = wins)</Label>
              <Input
                className="mt-1 bg-background border-border"
                type="number"
                step="1"
                value={assignPriority}
                onChange={(e) => setAssignPriority(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)} disabled={assignLoading}>Cancel</Button>
            <Button onClick={() => void assignPolicy()} disabled={assignLoading || !assignPolicyId}>
              {assignLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">&ldquo;{deleteTarget?.name}&rdquo;</span>?
            {deleteTarget?.type === "segment" && " All member associations and rule set assignments will also be removed."}
            {" "}This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
