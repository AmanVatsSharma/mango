/**
 * @file rm-management.tsx
 * @module admin-console
 * @description RM & Team management component - manages RMs and shows their team members (complements User Management)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-28
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  Contact2,
  Inbox,
  UserCircle2,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton } from "./shared"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"

const adminJsonError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => null)
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>
    return (typeof d.error === "string" && d.error) || (typeof d.message === "string" && d.message) || fallback
  }
  return fallback
}

interface RmQueueRowUser {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  managedById: string | null
}

interface RmAssignmentRequestRow {
  id: string
  userId: string
  status: string
  note: string | null
  dismissReason: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedById: string | null
  user: RmQueueRowUser
}

interface RmRequestsMeta {
  totalMatching: number
  pendingCount: number
  clientsWithoutRm: number
  limit: number
  offset: number
}

type RmQueueAssignUserRef = {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
}

function RmQueueAssignDialog({
  userRef,
  open,
  onOpenChange,
  onCompleted,
  canAssign,
}: {
  userRef: RmQueueAssignUserRef | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onCompleted: () => void
  canAssign: boolean
}) {
  const UNASSIGNED = "__UNASSIGNED__"
  type RmOpt = { id: string; name: string | null; email: string | null; role: string }
  const [rmOptions, setRmOptions] = useState<RmOpt[]>([])
  const [selectedRmId, setSelectedRmId] = useState(UNASSIGNED)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userRef) return
    setLoading(true)
    setError(null)
    try {
      const [rmsResponse, userResponse] = await Promise.all([
        fetch("/api/admin/rms"),
        fetch(`/api/admin/users/${userRef.id}`),
      ])
      if (!rmsResponse.ok) throw new Error(await adminJsonError(rmsResponse, "Failed to load RM list"))
      if (!userResponse.ok) throw new Error(await adminJsonError(userResponse, "Failed to load user"))
      const rmsData = await rmsResponse.json()
      const userData = await userResponse.json()
      const managedById = userData?.user?.managedById || ""
      setRmOptions((rmsData?.rms || []).filter((rm: RmOpt) => rm.role === "ADMIN" || rm.role === "MODERATOR"))
      setSelectedRmId(managedById || UNASSIGNED)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [userRef])

  useEffect(() => {
    if (open && userRef) void load()
  }, [open, userRef, load])

  const handleSave = async () => {
    if (!userRef) return
    const rmId = selectedRmId === UNASSIGNED ? null : selectedRmId
    if (!rmId) {
      setError("Select a relationship manager to assign")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${userRef.id}/assign-rm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rmId }),
      })
      if (!response.ok) throw new Error(await adminJsonError(response, "Failed to assign RM"))
      toast({ title: "RM assigned", description: "Client request will show as fulfilled." })
      onOpenChange(false)
      onCompleted()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to assign")
    } finally {
      setSaving(false)
    }
  }

  const emptyOpts = !loading && rmOptions.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign relationship manager</DialogTitle>
          <DialogDescription>
            Fulfill queue request for {userRef?.name || userRef?.email || userRef?.clientId || "this client"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {emptyOpts && (
            <Alert className="bg-yellow-500/10 border-yellow-500/50">
              <AlertTitle>No RM options</AlertTitle>
              <AlertDescription>Create an Admin or Moderator first.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Select RM</Label>
            <Select value={selectedRmId} onValueChange={setSelectedRmId} disabled={loading || emptyOpts || !canAssign}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "Choose RM"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>— Select —</SelectItem>
                {rmOptions.map((rm) => (
                  <SelectItem key={rm.id} value={rm.id}>
                    {rm.name || rm.email || rm.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={() => void handleSave()} disabled={saving || loading || emptyOpts || !canAssign} className="w-full">
            {saving ? "Saving…" : "Assign RM"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RM {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  isActive: boolean
  role: string
  assignedUsersCount: number
  createdAt: Date
  rmPublicContact?: Record<string, unknown> | null
  managedBy?: {
    id: string
    name: string | null
    email: string | null
    role: string
  } | null
}

interface TeamMember {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  isActive: boolean
  role: string
  createdAt: Date
}

export function RMManagement() {
  const { user: adminUser, permissions } = useAdminSession()
  const [rms, setRms] = useState<RM[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [expandedRMs, setExpandedRMs] = useState<Set<string>>(new Set())
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({})
  const [loadingTeams, setLoadingTeams] = useState<Set<string>>(new Set())
  const [includeUsersInList, setIncludeUsersInList] = useState(true)
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "MODERATOR" as string, // Default role
  })

  const [publicContactOpen, setPublicContactOpen] = useState(false)
  const [publicContactRm, setPublicContactRm] = useState<RM | null>(null)
  const [publicContactForm, setPublicContactForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    whatsappPhone: "",
    imageUrl: "",
  })
  const [publicContactSaving, setPublicContactSaving] = useState(false)

  const [mainTab, setMainTab] = useState<"teams" | "requests">("teams")
  const [rmRequests, setRmRequests] = useState<RmAssignmentRequestRow[]>([])
  const [rmRequestsMeta, setRmRequestsMeta] = useState<RmRequestsMeta | null>(null)
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestStatusFilter, setRequestStatusFilter] = useState<"PENDING" | "FULFILLED" | "DISMISSED" | "ALL">("PENDING")
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [assignTarget, setAssignTarget] = useState<RmQueueAssignUserRef | null>(null)
  const [dismissTarget, setDismissTarget] = useState<RmAssignmentRequestRow | null>(null)
  const [dismissReasonDraft, setDismissReasonDraft] = useState("")
  const [dismissSaving, setDismissSaving] = useState(false)

  const currentUserRole = adminUser?.role ?? null
  const canManageRms = permissions.includes("admin.users.rm") || permissions.includes("admin.all")

  const fetchRMs = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        includeUsers: String(includeUsersInList),
      })
      const response = await fetch(`/api/admin/rms?${qs.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch RMs")

      const data = await response.json()
      setRms(data.rms || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load RMs"
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [includeUsersInList])

  const refreshRmRequestStats = useCallback(async () => {
    if (!canManageRms) return
    try {
      const r = await fetch("/api/admin/rm-assignment-requests?status=PENDING&limit=1")
      if (!r.ok) return
      const d = await r.json()
      setPendingRequestCount(typeof d.meta?.pendingCount === "number" ? d.meta.pendingCount : 0)
    } catch {
      /* ignore */
    }
  }, [canManageRms])

  const fetchRmRequests = useCallback(async () => {
    if (!canManageRms) return
    setLoadingRequests(true)
    try {
      const qs = new URLSearchParams({
        status: requestStatusFilter,
        limit: "100",
        offset: "0",
      })
      const response = await fetch(`/api/admin/rm-assignment-requests?${qs.toString()}`)
      if (!response.ok) throw new Error(await adminJsonError(response, "Failed to load requests"))
      const data = await response.json()
      setRmRequests(data.requests || [])
      setRmRequestsMeta(data.meta || null)
      if (typeof data.meta?.pendingCount === "number") {
        setPendingRequestCount(data.meta.pendingCount)
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load RM requests",
        variant: "destructive",
      })
    } finally {
      setLoadingRequests(false)
    }
  }, [canManageRms, requestStatusFilter])

  useEffect(() => {
    void refreshRmRequestStats()
  }, [refreshRmRequestStats])

  useEffect(() => {
    if (mainTab === "requests") void fetchRmRequests()
  }, [mainTab, fetchRmRequests])

  const fetchTeamMembers = async (rmId: string) => {
    if (teamMembers[rmId]) {
      // Already loaded, just toggle
      toggleExpandRM(rmId)
      return
    }

    setLoadingTeams(prev => new Set(prev).add(rmId))

    try {
      const response = await fetch(`/api/admin/rms/${rmId}/team`)
      if (!response.ok) throw new Error("Failed to fetch team members")

      const data = await response.json()
      setTeamMembers(prev => ({
        ...prev,
        [rmId]: data.members || []
      }))
      toggleExpandRM(rmId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load team members"
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      })
    } finally {
      setLoadingTeams(prev => {
        const next = new Set(prev)
        next.delete(rmId)
        return next
      })
    }
  }

  const toggleExpandRM = (rmId: string) => {
    setExpandedRMs(prev => {
      const next = new Set(prev)
      if (next.has(rmId)) {
        next.delete(rmId)
      } else {
        next.add(rmId)
      }
      return next
    })
  }

  useEffect(() => {
    setExpandedRMs(new Set())
    setTeamMembers({})
  }, [includeUsersInList])

  useEffect(() => {
    void fetchRMs()
  }, [fetchRMs])

  const handleCreateRM = async () => {
    if (!canManageRms) {
      toast({
        title: "Forbidden",
        description: "You do not have permission to create team members.",
        variant: "destructive",
      })
      return
    }
    if (!createForm.name || !createForm.email || !createForm.phone || !createForm.password) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields",
        variant: "destructive"
      })
      return
    }

    try {
      const response = await fetch("/api/admin/rms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          phone: createForm.phone,
          password: createForm.password,
          role: createForm.role
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create RM")
      }

      toast({
        title: "✅ Success",
        description: "Team member created successfully"
      })

      setShowCreateDialog(false)
      setCreateForm({ name: "", email: "", phone: "", password: "", role: "MODERATOR" })
      void fetchRMs()
      void refreshRmRequestStats()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create RM"
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      })
    }
  }

  const filteredRMs = rms.filter(
    (rm) =>
      rm.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rm.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rm.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const openPublicContactDialog = (rm: RM) => {
    if (rm.role !== "ADMIN" && rm.role !== "MODERATOR") return
    const p = rm.rmPublicContact && typeof rm.rmPublicContact === "object"
      ? (rm.rmPublicContact as Record<string, string | undefined>)
      : {}
    setPublicContactRm(rm)
    setPublicContactForm({
      displayName: typeof p.displayName === "string" ? p.displayName : "",
      email: typeof p.email === "string" ? p.email : "",
      phone: typeof p.phone === "string" ? p.phone : "",
      whatsappPhone: typeof p.whatsappPhone === "string" ? p.whatsappPhone : "",
      imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : "",
    })
    setPublicContactOpen(true)
  }

  const savePublicContact = async () => {
    if (!publicContactRm || !canManageRms) return
    setPublicContactSaving(true)
    try {
      const body: Record<string, string | null> = {}
      const keys = ["displayName", "email", "phone", "whatsappPhone", "imageUrl"] as const
      for (const k of keys) {
        const v = publicContactForm[k].trim()
        body[k] = v.length ? v : null
      }
      const res = await fetch(`/api/admin/rms/${publicContactRm.id}/public-contact`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Failed to save")
      }
      toast({ title: "Saved", description: "Client-facing RM contact updated" })
      setPublicContactOpen(false)
      setPublicContactRm(null)
      void fetchRMs()
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      })
    } finally {
      setPublicContactSaving(false)
    }
  }

  const confirmDismissRequest = async () => {
    if (!dismissTarget || !canManageRms) return
    setDismissSaving(true)
    try {
      const res = await fetch(`/api/admin/rm-assignment-requests/${dismissTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DISMISSED",
          dismissReason: dismissReasonDraft.trim() ? dismissReasonDraft.trim().slice(0, 2000) : null,
        }),
      })
      if (!res.ok) throw new Error(await adminJsonError(res, "Dismiss failed"))
      toast({ title: "Dismissed", description: "Request removed from the pending queue." })
      setDismissTarget(null)
      setDismissReasonDraft("")
      await fetchRmRequests()
      await refreshRmRequestStats()
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Dismiss failed",
        variant: "destructive",
      })
    } finally {
      setDismissSaving(false)
    }
  }

  const formatQueueDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header */}
      <PageHeader
        title="RM & Teams"
        description="Manage teams hierarchically: Admins and Moderators can be RMs (have users managed by them). Super Admin manages Admins/Moderators/Users, Admin manages Moderators/Users, Moderator manages Users. Use Assignment requests to fulfil client RM requests from the trading Account tab."
        icon={<UserCheck className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                if (mainTab === "requests") void fetchRmRequests()
                else void fetchRMs()
              }}
              loading={mainTab === "requests" ? loadingRequests : loading}
            />
            <Button
              onClick={() => setShowCreateDialog(true)}
              disabled={!canManageRms}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm flex-shrink-0"
              size="sm"
            >
              <UserPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Create RM</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </>
        }
      />

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as "teams" | "requests")}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-2 sm:inline-flex sm:max-w-none">
          <TabsTrigger value="teams" className="gap-2">
            <Users className="h-4 w-4" />
            RMs & teams
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <Inbox className="h-4 w-4" />
            Assignment requests
            {pendingRequestCount > 0 ? (
              <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] tabular-nums">
                {pendingRequestCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-0 space-y-3 sm:space-y-4 md:space-y-6">
      {/* Stats */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Total RMs</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate">{rms.length}</p>
              </div>
              <Users className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Active RMs</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                  {rms.filter(r => r.isActive).length}
                </p>
              </div>
              <UserCheck className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-green-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Assigned Users</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                  {rms.reduce((sum, rm) => sum + rm.assignedUsersCount, 0)}
                </p>
              </div>
              <Users className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search and Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 md:gap-4">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search RMs by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 sm:pl-10 bg-muted/50 border-border focus:border-primary text-sm"
                />
              </div>
              {currentUserRole !== "MODERATOR" && (
                <div className="flex items-center gap-2 shrink-0 py-1 sm:py-0">
                  <Switch
                    id="rm-include-users"
                    checked={includeUsersInList}
                    onCheckedChange={setIncludeUsersInList}
                  />
                  <Label
                    htmlFor="rm-include-users"
                    className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
                  >
                    Show users in list
                  </Label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* RMs Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-lg sm:text-xl font-bold text-primary">
              Relationship Managers & Teams ({filteredRMs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6 pb-3 sm:pb-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : filteredRMs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No RMs found</div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <div className="min-w-[700px] sm:min-w-0">
                  <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground w-8"></TableHead>
                      <TableHead className="text-muted-foreground">User Details</TableHead>
                      <TableHead className="text-muted-foreground">Role</TableHead>
                      <TableHead className="text-muted-foreground">Contact</TableHead>
                      <TableHead className="text-muted-foreground">Team Size</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRMs.map((rm, index) => {
                      const isExpanded = expandedRMs.has(rm.id)
                      const team = teamMembers[rm.id] || []
                      const isLoadingTeam = loadingTeams.has(rm.id)
                      
                      return (
                        <>
                          <motion.tr
                            key={rm.id}
                            className="border-border hover:bg-muted/30 transition-colors"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                          >
                            <TableCell>
                              {rm.assignedUsersCount > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => fetchTeamMembers(rm.id)}
                                  className="h-6 w-6 p-0"
                                  disabled={isLoadingTeam}
                                >
                                  {isLoadingTeam ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-foreground">{rm.name || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">ID: {rm.id.slice(0, 8)}...</p>
                                {rm.managedBy && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Managed by: {rm.managedBy.name || rm.managedBy.email || 'N/A'} ({rm.managedBy.role})
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={
                                  rm.role === 'SUPER_ADMIN' ? 'bg-purple-400/20 text-purple-400 border-purple-400/30' :
                                  rm.role === 'ADMIN' ? 'bg-blue-400/20 text-blue-400 border-blue-400/30' :
                                  rm.role === 'MODERATOR' ? 'bg-green-400/20 text-green-400 border-green-400/30' :
                                  'bg-gray-400/20 text-gray-400 border-gray-400/30'
                                }
                              >
                                {rm.role === 'SUPER_ADMIN' ? 'Super Admin' :
                                 rm.role === 'ADMIN' ? 'Admin' :
                                 rm.role === 'MODERATOR' ? 'Moderator' :
                                 'User'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {rm.email && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Mail className="w-3 h-3" />
                                    <span className="truncate max-w-[200px]">{rm.email}</span>
                                  </div>
                                )}
                                {rm.phone && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone className="w-3 h-3" />
                                    <span>{rm.phone}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-blue-400/20 text-blue-400 border-blue-400/30">
                                {rm.assignedUsersCount} {rm.assignedUsersCount === 1 ? 'user' : 'users'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {rm.isActive ? (
                                <Badge className="bg-green-400/20 text-green-400 border-green-400/30">
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="bg-red-400/20 text-red-400 border-red-400/30">
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                {(rm.role === "ADMIN" || rm.role === "MODERATOR") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPublicContactDialog(rm)}
                                    disabled={!canManageRms}
                                    className="h-7 gap-1 border-border/80 px-2 text-xs font-medium"
                                  >
                                    <Contact2 className="h-3 w-3 opacity-70" />
                                    Client view
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    window.location.href = buildRouteWithQuery(getAdminConsoleRoute("users"), { rmId: rm.id })
                                  }}
                                  className="text-primary hover:text-primary/80 text-xs"
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Manage
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                          
                          {/* Team Members Row */}
                          {isExpanded && (
                            <motion.tr
                              key={`${rm.id}-team`}
                              className="bg-muted/20"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                            >
                              <TableCell colSpan={7} className="p-0">
                                <div className="px-6 py-4">
                                  {isLoadingTeam ? (
                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
                                      Loading team members...
                                    </div>
                                  ) : team.length > 0 ? (
                                    <>
                                      <div className="flex items-center gap-2 mb-3">
                                        <Users className="w-4 h-4 text-primary" />
                                        <h4 className="text-sm font-semibold text-foreground">
                                          Team Members ({team.length})
                                        </h4>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {team.map((member) => (
                                          <Card key={member.id} className="bg-card/50 border-border/50">
                                            <CardContent className="p-3">
                                              <div className="space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-sm text-foreground truncate">
                                                      {member.name || "N/A"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                      {member.clientId || member.id.slice(0, 8)}...
                                                    </p>
                                                  </div>
                                                  <div className="flex flex-col gap-1 items-end">
                                                    <Badge 
                                                      className={
                                                        member.role === 'ADMIN' ? 'bg-blue-400/20 text-blue-400 border-blue-400/30 text-xs' :
                                                        member.role === 'MODERATOR' ? 'bg-green-400/20 text-green-400 border-green-400/30 text-xs' :
                                                        'bg-gray-400/20 text-gray-400 border-gray-400/30 text-xs'
                                                      }
                                                    >
                                                      {member.role === 'ADMIN' ? 'Admin' :
                                                       member.role === 'MODERATOR' ? 'Moderator' :
                                                       'User'}
                                                    </Badge>
                                                    {member.isActive ? (
                                                      <Badge className="bg-green-400/20 text-green-400 border-green-400/30 text-xs">
                                                        Active
                                                      </Badge>
                                                    ) : (
                                                      <Badge className="bg-red-400/20 text-red-400 border-red-400/30 text-xs">
                                                        Inactive
                                                      </Badge>
                                                    )}
                                                  </div>
                                                </div>
                                                {member.email && (
                                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Mail className="w-3 h-3" />
                                                    <span className="truncate">{member.email}</span>
                                                  </div>
                                                )}
                                                {member.phone && (
                                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Phone className="w-3 h-3" />
                                                    <span>{member.phone}</span>
                                                  </div>
                                                )}
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    window.location.href = buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: member.id })
                                                  }}
                                                  className="w-full mt-2 text-xs h-7"
                                                >
                                                  <Eye className="w-3 h-3 mr-1" />
                                                  View in User Management
                                                </Button>
                                              </div>
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-center py-8">
                                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                      <p className="text-sm text-muted-foreground">
                                        No team members assigned yet
                                      </p>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          window.location.href = buildRouteWithQuery(getAdminConsoleRoute("users"), { rmId: rm.id })
                                        }}
                                        className="mt-3 text-xs"
                                      >
                                        Assign Users
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </motion.tr>
                          )}
                        </>
                      )
                    })}
                  </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
        </TabsContent>

        <TabsContent value="requests" className="mt-0 space-y-3 sm:space-y-4 md:space-y-6">
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending RM requests</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {rmRequestsMeta?.pendingCount ?? pendingRequestCount}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Clients with no RM</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {rmRequestsMeta?.clientsWithoutRm ?? "—"}
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-xs"
                  onClick={() => {
                    window.location.href = getAdminConsoleRoute("users")
                  }}
                >
                  Open user management
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <Card className="bg-card border-border shadow-sm neon-border">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold text-primary">Request queue</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={requestStatusFilter}
                  onValueChange={(v) =>
                    setRequestStatusFilter(v as "PENDING" | "FULFILLED" | "DISMISSED" | "ALL")
                  }
                >
                  <SelectTrigger className="h-9 w-[160px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                    <SelectItem value="ALL">All</SelectItem>
                  </SelectContent>
                </Select>
                <RefreshButton onClick={() => void fetchRmRequests()} loading={loadingRequests} />
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6 pb-4">
              {!canManageRms ? (
                <Alert>
                  <AlertTitle>No access</AlertTitle>
                  <AlertDescription>RM assignment permission required.</AlertDescription>
                </Alert>
              ) : loadingRequests ? (
                <div className="flex justify-center py-10 text-sm text-muted-foreground">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : rmRequests.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No requests in this filter. Clients without an RM can tap &quot;Request manager&quot; on the Account
                  tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rmRequests.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex items-start gap-2">
                              <UserCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">
                                  {row.user.name || row.user.email || "—"}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {row.user.clientId ? `ID ${row.user.clientId}` : row.user.email || row.userId.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatQueueDate(row.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                row.status === "PENDING"
                                  ? "border-amber-500/50 text-amber-200"
                                  : row.status === "FULFILLED"
                                    ? "border-green-500/50 text-green-200"
                                    : "border-border text-muted-foreground"
                              }
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {row.status === "PENDING" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-8 text-xs"
                                    disabled={!canManageRms}
                                    onClick={() =>
                                      setAssignTarget({
                                        id: row.user.id,
                                        name: row.user.name,
                                        email: row.user.email,
                                        clientId: row.user.clientId,
                                      })
                                    }
                                  >
                                    Assign RM
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    disabled={!canManageRms}
                                    onClick={() => {
                                      setDismissTarget(row)
                                      setDismissReasonDraft("")
                                    }}
                                  >
                                    Dismiss
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => {
                                  window.location.href = buildRouteWithQuery(getAdminConsoleRoute("users"), {
                                    userId: row.user.id,
                                  })
                                }}
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                User
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

      <RmQueueAssignDialog
        userRef={assignTarget}
        open={Boolean(assignTarget)}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null)
        }}
        canAssign={canManageRms}
        onCompleted={async () => {
          setAssignTarget(null)
          await fetchRmRequests()
          await refreshRmRequestStats()
          await fetchRMs()
        }}
      />

      <Dialog
        open={Boolean(dismissTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setDismissTarget(null)
            setDismissReasonDraft("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss RM request</DialogTitle>
            <DialogDescription>
              The client can submit a new request later from the Account tab if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="dismiss-reason">Note (optional)</Label>
            <Textarea
              id="dismiss-reason"
              value={dismissReasonDraft}
              onChange={(e) => setDismissReasonDraft(e.target.value)}
              placeholder="Reason for ops / audit"
              rows={3}
              className="resize-none text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDismissTarget(null)
                  setDismissReasonDraft("")
                }}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={dismissSaving} onClick={() => void confirmDismissRequest()}>
                {dismissSaving ? "Saving…" : "Dismiss request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={publicContactOpen}
        onOpenChange={(o) => {
          setPublicContactOpen(o)
          if (!o) setPublicContactRm(null)
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md gap-0 overflow-hidden border-border/80 p-0 sm:w-full">
          <DialogHeader className="space-y-1 border-b border-border/60 bg-muted/25 px-4 pb-3 pt-4 text-left">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Contact2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-tight tracking-tight">
                  Client-visible contact
                </DialogTitle>
                <DialogDescription className="text-xs leading-snug">
                  Overrides apply when Settings → Account RM uses &quot;RM / override&quot;. Empty = use profile.
                </DialogDescription>
              </div>
            </div>
            {publicContactRm ? (
              <p className="truncate pl-12 text-xs text-muted-foreground sm:pl-14">
                <span className="font-medium text-foreground">{publicContactRm.name || "—"}</span>
                {publicContactRm.email ? ` · ${publicContactRm.email}` : ` · ${publicContactRm.id.slice(0, 8)}…`}
              </p>
            ) : null}
          </DialogHeader>

          <div className="max-h-[min(65vh,28rem)] overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pc-displayName" className="text-[11px] font-medium text-muted-foreground">
                  Display name
                </Label>
                <Input
                  id="pc-displayName"
                  value={publicContactForm.displayName}
                  onChange={(e) =>
                    setPublicContactForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  placeholder="Shown on Account tab"
                  className="h-9 border-border/80 text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pc-email" className="text-[11px] font-medium text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="pc-email"
                  type="email"
                  value={publicContactForm.email}
                  onChange={(e) => setPublicContactForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Override"
                  className="h-9 border-border/80 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-phone" className="text-[11px] font-medium text-muted-foreground">
                  Phone
                </Label>
                <Input
                  id="pc-phone"
                  value={publicContactForm.phone}
                  onChange={(e) => setPublicContactForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Call / SMS"
                  className="h-9 border-border/80 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-wa" className="text-[11px] font-medium text-muted-foreground">
                  WhatsApp
                </Label>
                <Input
                  id="pc-wa"
                  value={publicContactForm.whatsappPhone}
                  onChange={(e) =>
                    setPublicContactForm((f) => ({ ...f, whatsappPhone: e.target.value }))
                  }
                  placeholder="Optional"
                  className="h-9 border-border/80 text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pc-image" className="text-[11px] font-medium text-muted-foreground">
                  Photo URL
                </Label>
                <Input
                  id="pc-image"
                  value={publicContactForm.imageUrl}
                  onChange={(e) =>
                    setPublicContactForm((f) => ({ ...f, imageUrl: e.target.value }))
                  }
                  placeholder="https://…"
                  className="h-9 border-border/80 text-sm"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-border/60" />
          <div className="flex justify-end gap-2 bg-muted/15 px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setPublicContactOpen(false)
                setPublicContactRm(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" className="text-xs" onClick={savePublicContact} disabled={publicContactSaving}>
              {publicContactSaving ? "Saving…" : "Save overrides"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create RM Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle className="text-lg sm:text-xl font-bold text-primary">Create Team Member</DialogTitle>
            <DialogDescription className="text-sm sm:text-base text-muted-foreground">
              Create a new team member. Role will be assigned based on your permissions:
              {currentUserRole === 'SUPER_ADMIN' && ' You can create Admin, Moderator, or User.'}
              {currentUserRole === 'ADMIN' && ' You can create Moderator or User.'}
              {currentUserRole === 'MODERATOR' && ' You can create User.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Enter RM name"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Enter password"
              />
            </div>
            {(currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN') && (
              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => setCreateForm({ ...createForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUserRole === 'SUPER_ADMIN' && (
                      <>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MODERATOR">Moderator</SelectItem>
                        <SelectItem value="USER">User</SelectItem>
                      </>
                    )}
                    {currentUserRole === 'ADMIN' && (
                      <>
                        <SelectItem value="MODERATOR">Moderator</SelectItem>
                        <SelectItem value="USER">User</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRM}>
                Create Team Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
