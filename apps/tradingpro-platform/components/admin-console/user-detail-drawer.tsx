/**
 * File:        components/admin-console/user-detail-drawer.tsx
 * Module:      admin-console · User Management
 * Purpose:     Enterprise right-side drawer showing a complete user profile for admin CRM,
 *              with 6 tabs: Overview, KYC, Trading, Activity, Security, CRM Notes.
 *
 * Exports:
 *   - UserDetailDrawer(props) — slide-over panel triggered by clicking a user name in the table
 *
 * Depends on:
 *   - GET /api/admin/users/[userId]                        — raw Prisma user + sessionCount + financialSummary
 *   - GET /api/admin/users/[userId]/activity?limit=20      — unified activity timeline
 *   - GET /api/admin/users/[userId]/crm/notes?limit=10     — CRM notes (lazy on CRM tab open)
 *   - GET /api/admin/users/[userId]/crm/tasks?status=active — CRM tasks (lazy, fetched alongside notes)
 *   - GET /api/admin/users/[userId]/risk-limit              — risk limits + base configs (lazy on Risk tab)
 *   - GET /api/admin/bonuses/grants/by-user/[userId]        — bonus grants + creditBalance (lazy on Bonus tab)
 *   - POST /api/admin/users/[userId]/freeze                 — freeze/unfreeze quick action
 *   - POST /api/admin/users/[userId]/reset-mpin             — reset MPIN quick action
 *
 * Side-effects:
 *   - Fetches 2 endpoints on open; CRM, Risk, Bonus lazy-load on first tab visit
 *   - Freeze/Reset MPIN write to DB and refetch core data on success
 *
 * Key invariants:
 *   - `detail.sessionCount` is server-computed (active UserSessionRecord rows) — displayed in Security tab
 *   - CRM/Risk/Bonus require specific permissions — gracefully handle 403 with user message
 *   - All monetary values from Prisma Decimal are coerced via Number()
 *
 * Read order:
 *   1. Helpers (formatCurrency, formatDateIST, maskPan, maskAadhaar) — utility fns
 *   2. InfoRow, SectionTitle, StatMiniCard — presentational primitives
 *   3. UserDetailDrawer — main component
 *
 * Author:      AmanVatsSharma
 * Last-updated: 2026-05-07
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  X,
  User,
  Mail,
  Phone,
  Shield,
  Wallet,
  Activity,
  TrendingUp,
  Lock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Edit,
  Eye,
  EyeOff,
  BarChart3,
  LogIn,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  FileCheck,
  MessageSquare,
  Pin,
  ArrowDownCircle,
  ArrowUpCircle,
  Users,
  Gift,
  MapPin,
  Briefcase,
  RefreshCw,
  SendHorizonal,
  AlertCircle,
  Globe,
  Fingerprint,
  Star,
  Unlock,
  PhoneOff,
  CalendarClock,
  CheckSquare,
  Percent,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  const n = isFinite(amount) ? amount : 0
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`
  return `₹${n.toLocaleString("en-IN")}`
}

function formatDateIST(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatDateOnlyIST(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
  })
}

function maskPan(pan: string, show: boolean): string {
  if (!pan) return "—"
  if (show) return pan.toUpperCase()
  if (pan.length !== 10) return "•".repeat(pan.length)
  return `${pan.slice(0, 3)}•••••${pan.slice(-2)}`
}

function maskAadhaar(aadhaar: string, show: boolean): string {
  if (!aadhaar) return "—"
  const digits = aadhaar.replace(/\D/g, "")
  if (show) return digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3")
  const last4 = digits.slice(-4)
  return `XXXX XXXX ${last4}`
}

function safeNum(value: unknown): number {
  const n = Number(value)
  return isFinite(n) ? n : 0
}

// ─── Presentational Primitives ────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  copyable,
}: {
  label: string
  value: React.ReactNode
  copyable?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!copyable) return
    navigator.clipboard.writeText(copyable)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-start justify-between py-2 border-b border-border/60 last:border-0 gap-3">
      <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-1.5 text-right min-w-0">
        <span className="text-sm font-medium text-foreground break-all">{value}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-5 first:mt-1">
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-xs font-semibold text-primary uppercase tracking-wider">{title}</span>
    </div>
  )
}

function StatMiniCard({
  label,
  value,
  subtext,
  valueClass,
}: {
  label: string
  value: React.ReactNode
  subtext?: string
  valueClass?: string
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
      <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold leading-tight ${valueClass ?? "text-foreground"}`}>{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  )
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 mt-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-md" />
      ))}
    </div>
  )
}

// ─── Activity icon helper ─────────────────────────────────────────────────────

function ActivityIcon({ type, action }: { type: string; action: string }) {
  const t = (type ?? "").toUpperCase()
  const a = (action ?? "").toUpperCase()

  if (t === "AUTH" || t === "AUTH_EVENT") {
    if (a.includes("LOGIN") && !a.includes("FAIL")) return <LogIn className="w-3 h-3 text-green-400" />
    if (a.includes("LOGOUT")) return <LogOut className="w-3 h-3 text-muted-foreground" />
    if (a.includes("FAIL") || a.includes("BLOCK")) return <AlertCircle className="w-3 h-3 text-red-400" />
    return <Shield className="w-3 h-3 text-blue-400" />
  }
  if (t === "ORDER") return <BarChart3 className="w-3 h-3 text-blue-400" />
  if (t === "DEPOSIT") return <ArrowDownCircle className="w-3 h-3 text-green-400" />
  if (t === "WITHDRAWAL") return <ArrowUpCircle className="w-3 h-3 text-red-400" />
  if (t === "TRADE") return <TrendingUp className="w-3 h-3 text-purple-400" />
  return <Activity className="w-3 h-3 text-muted-foreground" />
}

function activityBg(type: string): string {
  const t = (type ?? "").toUpperCase()
  if (t === "ORDER") return "bg-blue-500/10"
  if (t === "DEPOSIT") return "bg-green-500/10"
  if (t === "WITHDRAWAL") return "bg-red-500/10"
  if (t === "TRADE") return "bg-purple-500/10"
  return "bg-muted/50"
}

// ─── KYC badge helpers ────────────────────────────────────────────────────────

function KycStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-green-500/15 text-green-500 border-green-500/30",
    PENDING: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    REJECTED: "bg-red-500/15 text-red-500 border-red-500/30",
    UNDER_REVIEW: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    NOT_SUBMITTED: "bg-muted text-muted-foreground border-border",
  }
  return (
    <Badge className={`${map[status] ?? map.NOT_SUBMITTED} text-xs`}>
      {status.replace(/_/g, " ")}
    </Badge>
  )
}

function AmlBadge({ status }: { status?: string }) {
  if (!status) return null
  const map: Record<string, string> = {
    CLEAR: "bg-green-500/15 text-green-500 border-green-500/30",
    PENDING: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    FLAGGED: "bg-red-500/15 text-red-500 border-red-500/30",
    UNDER_REVIEW: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  }
  return (
    <Badge className={`${map[status] ?? "bg-muted text-muted-foreground"} text-xs`}>
      AML: {status}
    </Badge>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface UserDetailDrawerProps {
  open: boolean
  onClose: () => void
  user: { id: string; name?: string; clientId?: string } | null
  onEditClick: () => void
  onStatementClick: () => void
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UserDetailDrawer({
  open,
  onClose,
  user,
  onEditClick,
  onStatementClick,
}: UserDetailDrawerProps) {
  // Core data
  const [detail, setDetail] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // CRM notes (lazy)
  const [crmNotes, setCrmNotes] = useState<any[]>([])
  const [crmLoading, setCrmLoading] = useState(false)
  const [crmError, setCrmError] = useState<string | null>(null)
  const crmLoadedForRef = useRef<string | null>(null)

  // Inline add-note
  const [newNote, setNewNote] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  // CRM tasks (loaded alongside notes)
  const [crmTasks, setCrmTasks] = useState<any[]>([])
  const [crmTasksLoading, setCrmTasksLoading] = useState(false)

  // Risk tab (lazy)
  const [riskData, setRiskData] = useState<any>(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [riskError, setRiskError] = useState<string | null>(null)
  const riskLoadedForRef = useRef<string | null>(null)

  // Bonus tab (lazy)
  const [bonusData, setBonusData] = useState<{ grants: any[]; creditBalance: number } | null>(null)
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusError, setBonusError] = useState<string | null>(null)
  const bonusLoadedForRef = useRef<string | null>(null)

  // Footer quick-action state
  const [freezing, setFreezing] = useState(false)
  const [resettingMpin, setResettingMpin] = useState(false)

  // Sensitive field reveal
  const [showPan, setShowPan] = useState(false)
  const [showAadhaar, setShowAadhaar] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState("overview")

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCoreData = useCallback(async (userId: string) => {
    setLoading(true)
    setError(null)
    setDetail(null)
    setActivities([])
    setShowPan(false)
    setShowAadhaar(false)
    try {
      const [detailRes, actRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch(`/api/admin/users/${userId}/activity?limit=20`),
      ])
      if (detailRes.ok) {
        const data = await detailRes.json()
        setDetail(data.user ?? data)
      } else {
        const data = await detailRes.json().catch(() => null)
        setError(data?.error ?? data?.message ?? "Failed to load user details.")
      }
      if (actRes.ok) {
        const data = await actRes.json()
        const arr = Array.isArray(data.activities)
          ? data.activities
          : Array.isArray(data.events)
          ? data.events
          : []
        setActivities(arr)
      }
    } catch {
      setError("Network error — failed to load user details.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCrmNotes = useCallback(async (userId: string) => {
    if (crmLoadedForRef.current === userId) return
    crmLoadedForRef.current = userId
    setCrmLoading(true)
    setCrmError(null)
    setCrmTasksLoading(true)
    try {
      const [notesRes, tasksRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}/crm/notes?limit=10`),
        fetch(`/api/admin/users/${userId}/crm/tasks?status=active`),
      ])
      if (notesRes.ok) {
        const data = await notesRes.json()
        setCrmNotes(Array.isArray(data.notes) ? data.notes : [])
      } else if (notesRes.status === 403) {
        setCrmError("Insufficient permissions to view CRM notes.")
      } else {
        setCrmError("Failed to load CRM notes.")
      }
      if (tasksRes.ok) {
        const data = await tasksRes.json()
        setCrmTasks(Array.isArray(data.tasks) ? data.tasks : [])
      }
    } catch {
      setCrmError("Network error loading CRM notes.")
    } finally {
      setCrmLoading(false)
      setCrmTasksLoading(false)
    }
  }, [])

  const loadRiskData = useCallback(async (userId: string) => {
    if (riskLoadedForRef.current === userId) return
    riskLoadedForRef.current = userId
    setRiskLoading(true)
    setRiskError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/risk-limit`)
      if (res.ok) {
        const data = await res.json()
        setRiskData(data)
      } else if (res.status === 403) {
        setRiskError("Insufficient permissions to view risk limits.")
      } else {
        setRiskError("Failed to load risk limits.")
      }
    } catch {
      setRiskError("Network error loading risk limits.")
    } finally {
      setRiskLoading(false)
    }
  }, [])

  const loadBonusData = useCallback(async (userId: string) => {
    if (bonusLoadedForRef.current === userId) return
    bonusLoadedForRef.current = userId
    setBonusLoading(true)
    setBonusError(null)
    try {
      const res = await fetch(`/api/admin/bonuses/grants/by-user/${userId}`)
      if (res.ok) {
        const data = await res.json()
        setBonusData({
          grants: Array.isArray(data.grants) ? data.grants : [],
          creditBalance: Number(data.creditBalance ?? 0),
        })
      } else if (res.status === 403) {
        setBonusError("Insufficient permissions to view bonus grants.")
      } else {
        setBonusError("Failed to load bonus grants.")
      }
    } catch {
      setBonusError("Network error loading bonus grants.")
    } finally {
      setBonusLoading(false)
    }
  }, [])

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (open && user?.id) {
      setActiveTab("overview")
      crmLoadedForRef.current = null
      riskLoadedForRef.current = null
      bonusLoadedForRef.current = null
      setCrmNotes([])
      setCrmTasks([])
      setCrmError(null)
      setRiskData(null)
      setRiskError(null)
      setBonusData(null)
      setBonusError(null)
      setNewNote("")
      void loadCoreData(user.id)
    } else if (!open) {
      setDetail(null)
      setActivities([])
      setError(null)
    }
  }, [open, user?.id, loadCoreData])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === "crm" && user?.id) void loadCrmNotes(user.id)
    if (value === "risk" && user?.id) void loadRiskData(user.id)
    if (value === "bonus" && user?.id) void loadBonusData(user.id)
  }

  // ── Add CRM Note ──────────────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (!newNote.trim() || !user?.id) return
    setAddingNote(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/crm/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim(), visibility: "TEAM" }),
      })
      if (res.ok) {
        const data = await res.json()
        setCrmNotes((prev) => [data.note, ...prev])
        setNewNote("")
        crmLoadedForRef.current = null
      }
    } finally {
      setAddingNote(false)
    }
  }

  // ── Quick Actions ─────────────────────────────────────────────────────────

  const handleFreezeToggle = async () => {
    if (!user?.id || !detail) return
    const action = isSuspended ? "Unfreeze" : "Freeze"
    const reason = isSuspended
      ? undefined
      : window.prompt(`Reason for freezing ${detail.name ?? "this account"}:`)
    if (!isSuspended && reason === null) return // cancelled
    const confirmed = window.confirm(
      `${action} account for ${detail.name ?? user.id}? ${reason ? `\nReason: "${reason}"` : ""}`
    )
    if (!confirmed) return
    setFreezing(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeze: !isSuspended, reason: reason ?? undefined }),
      })
      if (res.ok) {
        toast({ title: `Account ${isSuspended ? "unfrozen" : "frozen"} successfully` })
        void loadCoreData(user.id)
      } else {
        const data = await res.json().catch(() => null)
        toast({ title: `Failed to ${action.toLowerCase()} account`, description: data?.message ?? data?.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setFreezing(false)
    }
  }

  const handleResetMpin = async () => {
    if (!user?.id || !detail) return
    const mpin = window.prompt(`Enter new 4-digit MPIN for ${detail.name ?? "this user"}:`)
    if (!mpin) return
    if (!/^\d{4}$/.test(mpin)) {
      toast({ title: "MPIN must be exactly 4 digits", variant: "destructive" })
      return
    }
    setResettingMpin(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-mpin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpin }),
      })
      if (res.ok) {
        toast({ title: "MPIN reset successfully" })
      } else {
        const data = await res.json().catch(() => null)
        toast({ title: "Failed to reset MPIN", description: data?.message ?? data?.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setResettingMpin(false)
    }
  }

  // ── Derived data from raw Prisma user ─────────────────────────────────────

  const ta = detail?.tradingAccount
  const positions = (ta?.positions ?? []) as any[]
  const orders = (ta?.orders ?? []) as any[]
  const trades = (ta?.trades ?? []) as any[]
  const deposits = (detail?.deposits ?? []) as any[]
  const withdrawals = (detail?.withdrawals ?? []) as any[]
  const bankAccounts = (detail?.bankAccounts ?? []) as any[]
  const kyc = detail?.kyc
  const managedBy = detail?.managedBy
  const referredBy = detail?.referredBy

  const fs = detail?.financialSummary
  const activePositionsCount = positions.length
  // Use all-time aggregate totals from the service; fall back to sum of fetched rows if unavailable
  const totalDeposits = fs?.totalDeposits ?? deposits.reduce((s: number, d: any) => s + safeNum(d.amount), 0)
  const totalWithdrawals = fs?.totalWithdrawals ?? withdrawals.reduce((s: number, w: any) => s + safeNum(w.amount), 0)
  const depositCount = fs?.depositCount ?? deposits.length
  const withdrawalCount = fs?.withdrawalCount ?? withdrawals.length
  const realizedPnl: number = fs?.realizedPnl ?? 0

  const balance = safeNum(ta?.balance)
  const availableMargin = safeNum(ta?.availableMargin)
  const usedMargin = safeNum(ta?.usedMargin)

  const kycStatus: string = kyc?.status ?? "NOT_SUBMITTED"
  const isActive: boolean = detail?.isActive !== false
  const isSuspended: boolean = Boolean(detail?.suspendedAt)

  const headerStatusClass = isSuspended
    ? "bg-orange-500/20 text-orange-500 border-orange-500/30"
    : isActive
    ? "bg-green-500/15 text-green-500 border-green-500/30"
    : "bg-red-500/15 text-red-500 border-red-500/30"

  const headerStatusLabel = isSuspended ? "Suspended" : isActive ? "Active" : "Inactive"

  const avatarBg = isSuspended
    ? "bg-orange-500/20 text-orange-500"
    : isActive
    ? "bg-primary/15 text-primary"
    : "bg-muted text-muted-foreground"

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Drawer Panel */}
          <motion.div
            key="drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className="fixed right-0 top-0 h-full w-full max-w-2xl bg-card border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarBg}`}
                >
                  {(user?.name ?? "?")
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm leading-tight truncate">
                    {user?.name ?? detail?.name ?? "User"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {user?.clientId ?? detail?.clientId ?? user?.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`${headerStatusClass} text-xs`}>{headerStatusLabel}</Badge>
                {detail?.role && detail.role !== "USER" && (
                  <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                    {detail.role.replace(/_/g, " ")}
                  </Badge>
                )}
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden">
              <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
                {/* Scrollable tab bar */}
                <div className="shrink-0 px-4 pt-3 border-b border-border/50">
                  <TabsList className="h-8 bg-transparent p-0 gap-0.5 flex w-full overflow-x-auto scrollbar-none">
                    {[
                      { value: "overview", label: "Overview", icon: User },
                      { value: "kyc", label: "KYC", icon: FileCheck },
                      { value: "trading", label: "Trading", icon: TrendingUp },
                      { value: "activity", label: "Activity", icon: Activity },
                      { value: "security", label: "Security", icon: Lock },
                      { value: "crm", label: "CRM", icon: MessageSquare },
                      { value: "risk", label: "Risk", icon: Shield },
                      { value: "bonus", label: "Bonus", icon: Gift },
                    ].map(({ value, label, icon: Icon }) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className="flex-1 min-w-[80px] h-7 text-xs flex items-center gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md"
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-5">

                  {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
                  <TabsContent value="overview" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {loading ? (
                      <LoadingRows count={8} />
                    ) : error ? (
                      <div className="flex items-center gap-2 text-destructive mt-4 p-3 rounded-lg bg-destructive/10">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <p className="text-sm">{error}</p>
                      </div>
                    ) : (
                      <>
                        {/* Profile */}
                        <SectionTitle icon={User} title="Profile" />
                        <InfoRow label="Full Name" value={detail?.name ?? "—"} copyable={detail?.name ?? undefined} />
                        <InfoRow
                          label="Email"
                          value={
                            <span className="flex items-center gap-1">
                              {detail?.email ?? "—"}
                              {detail?.emailVerified && (
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              )}
                            </span>
                          }
                          copyable={detail?.email ?? undefined}
                        />
                        <InfoRow
                          label="Phone"
                          value={
                            <span className="flex items-center gap-1">
                              {detail?.phone ?? "—"}
                              {detail?.phoneVerified && (
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              )}
                            </span>
                          }
                          copyable={detail?.phone ?? undefined}
                        />
                        <InfoRow
                          label="Client ID"
                          value={
                            <code className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {detail?.clientId ?? "—"}
                            </code>
                          }
                          copyable={detail?.clientId ?? undefined}
                        />
                        <InfoRow
                          label="Role"
                          value={
                            <Badge variant="outline" className="text-xs">
                              {detail?.role ?? "USER"}
                            </Badge>
                          }
                        />
                        <InfoRow label="Joined" value={formatDateIST(detail?.createdAt)} />
                        {detail?.bio && (
                          <InfoRow label="Bio" value={<span className="text-muted-foreground text-xs">{detail.bio}</span>} />
                        )}

                        {/* Account Balance */}
                        <SectionTitle icon={Wallet} title="Account" />
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <StatMiniCard
                            label="Balance"
                            value={formatCurrency(balance)}
                            valueClass="text-green-400"
                          />
                          <StatMiniCard
                            label="Available"
                            value={formatCurrency(availableMargin)}
                            valueClass="text-blue-400"
                          />
                          <StatMiniCard
                            label="Used Margin"
                            value={formatCurrency(usedMargin)}
                            valueClass={usedMargin > 0 ? "text-orange-400" : "text-foreground"}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <StatMiniCard
                            label="Total Deposited"
                            value={formatCurrency(totalDeposits)}
                            subtext={`${depositCount} txn`}
                            valueClass="text-green-400"
                          />
                          <StatMiniCard
                            label="Withdrawn"
                            value={formatCurrency(totalWithdrawals)}
                            subtext={`${withdrawalCount} txn`}
                            valueClass="text-red-400"
                          />
                          <StatMiniCard
                            label="Realized P&L"
                            value={`${realizedPnl >= 0 ? "+" : ""}${formatCurrency(realizedPnl)}`}
                            valueClass={realizedPnl > 0 ? "text-green-400" : realizedPnl < 0 ? "text-red-400" : "text-muted-foreground"}
                          />
                        </div>

                        {/* KYC quick status */}
                        <SectionTitle icon={Shield} title="KYC" />
                        <div className="flex items-center gap-2 py-2">
                          <KycStatusBadge status={kycStatus} />
                          {kyc?.amlStatus && <AmlBadge status={kyc.amlStatus} />}
                          {kyc?.suspiciousStatus && kyc.suspiciousStatus !== "NONE" && (
                            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">
                              {kyc.suspiciousStatus.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          See <button onClick={() => handleTabChange("kyc")} className="text-primary underline underline-offset-2">KYC tab</button> for full details.
                        </p>

                        {/* Relationship Manager */}
                        {managedBy && (
                          <>
                            <SectionTitle icon={Briefcase} title="Relationship Manager" />
                            <InfoRow label="RM Name" value={managedBy.name ?? "—"} />
                            <InfoRow label="RM Email" value={managedBy.email ?? "—"} copyable={managedBy.email ?? undefined} />
                          </>
                        )}

                        {/* Referral */}
                        {referredBy && (
                          <>
                            <SectionTitle icon={Gift} title="Referred By" />
                            <InfoRow label="Referrer" value={referredBy.name ?? "—"} />
                            <InfoRow
                              label="Referrer ID"
                              value={
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {referredBy.clientId ?? referredBy.id}
                                </code>
                              }
                              copyable={referredBy.clientId ?? referredBy.id}
                            />
                          </>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ══ KYC ══════════════════════════════════════════════════ */}
                  <TabsContent value="kyc" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {loading ? (
                      <LoadingRows count={7} />
                    ) : !kyc ? (
                      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                        <FileCheck className="w-8 h-8 opacity-20" />
                        <p className="text-sm">KYC not submitted</p>
                      </div>
                    ) : (
                      <>
                        <SectionTitle icon={Shield} title="KYC Status" />
                        <div className="flex flex-wrap gap-2 py-2 mb-1">
                          <KycStatusBadge status={kycStatus} />
                          <AmlBadge status={kyc.amlStatus} />
                          {kyc.suspiciousStatus && kyc.suspiciousStatus !== "NONE" && (
                            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">
                              {kyc.suspiciousStatus.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        {kyc.amlFlags && kyc.amlFlags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(kyc.amlFlags as string[]).map((flag) => (
                              <span
                                key={flag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                        <InfoRow label="Submitted" value={formatDateOnlyIST(kyc.submittedAt)} />
                        {kyc.approvedAt && (
                          <InfoRow label="Approved" value={formatDateOnlyIST(kyc.approvedAt)} />
                        )}

                        <SectionTitle icon={Fingerprint} title="Identity Documents" />
                        <div className="flex items-start justify-between py-2 border-b border-border/60 gap-3">
                          <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5">PAN Number</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">
                              {maskPan(kyc.panNumber ?? "", showPan)}
                            </code>
                            <button
                              onClick={() => setShowPan((v) => !v)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {showPan ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            {kyc.panNumber && (
                              <button
                                onClick={() => navigator.clipboard.writeText(kyc.panNumber)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start justify-between py-2 border-b border-border/60 gap-3">
                          <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5">Aadhaar</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground">
                              {maskAadhaar(kyc.aadhaarNumber ?? "", showAadhaar)}
                            </code>
                            <button
                              onClick={() => setShowAadhaar((v) => !v)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {showAadhaar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        {kyc.bankProofUrl && (
                          <InfoRow
                            label="Bank Proof"
                            value={
                              <a
                                href={kyc.bankProofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary text-xs hover:underline"
                              >
                                View document <ExternalLink className="w-3 h-3" />
                              </a>
                            }
                          />
                        )}

                        {/* Bank Accounts */}
                        {bankAccounts.length > 0 && (
                          <>
                            <SectionTitle icon={Building2} title="Bank Accounts" />
                            <div className="space-y-2">
                              {bankAccounts.map((ba: any, i: number) => (
                                <div
                                  key={ba.id ?? i}
                                  className="rounded-lg bg-muted/20 border border-border/50 p-3"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-medium text-foreground">{ba.bankName ?? "Bank"}</p>
                                    {(ba.isPrimary || ba.isDefault) && (
                                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                        Primary
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    A/C: {ba.maskedAccountNumber ?? ba.accountNumber ?? "•••"}
                                  </p>
                                  {ba.ifscCode && (
                                    <p className="text-xs text-muted-foreground">IFSC: {ba.ifscCode}</p>
                                  )}
                                  {ba.accountType && (
                                    <p className="text-xs text-muted-foreground">{ba.accountType}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ══ TRADING ══════════════════════════════════════════════ */}
                  <TabsContent value="trading" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {loading ? (
                      <LoadingRows count={6} />
                    ) : (
                      <>
                        <SectionTitle icon={BarChart3} title="Positions & Orders" />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <StatMiniCard
                            label="Open Positions"
                            value={activePositionsCount}
                            valueClass={activePositionsCount > 0 ? "text-blue-400" : "text-foreground"}
                          />
                          <StatMiniCard
                            label="Recent Orders"
                            value={orders.length}
                            subtext="Last 20"
                          />
                        </div>

                        <SectionTitle icon={Wallet} title="Funds (All-Time)" />
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <StatMiniCard
                            label="Total Deposits"
                            value={formatCurrency(totalDeposits)}
                            subtext={`${depositCount} completed`}
                            valueClass="text-green-400"
                          />
                          <StatMiniCard
                            label="Total Withdrawals"
                            value={formatCurrency(totalWithdrawals)}
                            subtext={`${withdrawalCount} completed`}
                            valueClass="text-red-400"
                          />
                          <StatMiniCard
                            label="Realized P&L"
                            value={formatCurrency(Math.abs(realizedPnl))}
                            subtext={realizedPnl >= 0 ? "Net profit" : "Net loss"}
                            valueClass={realizedPnl > 0 ? "text-green-400" : realizedPnl < 0 ? "text-red-400" : "text-muted-foreground"}
                          />
                        </div>

                        {/* Recent deposits mini-list */}
                        {deposits.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
                              Recent Deposits
                            </p>
                            <div className="space-y-1.5">
                              {deposits.slice(0, 5).map((d: any, i: number) => (
                                <div
                                  key={d.id ?? i}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-md bg-green-500/5 border border-green-500/15"
                                >
                                  <span className="text-muted-foreground">
                                    {formatDateOnlyIST(d.createdAt)}
                                  </span>
                                  <span className="text-green-400 font-semibold">
                                    +{formatCurrency(safeNum(d.amount))}
                                  </span>
                                  {d.status && (
                                    <span className="text-muted-foreground text-[10px]">{d.status}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Recent withdrawals mini-list */}
                        {withdrawals.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
                              Recent Withdrawals
                            </p>
                            <div className="space-y-1.5">
                              {withdrawals.slice(0, 5).map((w: any, i: number) => (
                                <div
                                  key={w.id ?? i}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-md bg-red-500/5 border border-red-500/15"
                                >
                                  <span className="text-muted-foreground">
                                    {formatDateOnlyIST(w.createdAt)}
                                  </span>
                                  <span className="text-red-400 font-semibold">
                                    -{formatCurrency(safeNum(w.amount))}
                                  </span>
                                  {w.status && (
                                    <span className="text-muted-foreground text-[10px]">{w.status}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Recent trades mini-list */}
                        {trades.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2">
                              Recent Trades
                            </p>
                            <div className="space-y-1.5">
                              {trades.slice(0, 5).map((t: any, i: number) => (
                                <div
                                  key={t.id ?? i}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-md bg-muted/20 border border-border/50"
                                >
                                  <span className="font-medium text-foreground">{t.symbol ?? "—"}</span>
                                  <span
                                    className={
                                      (t.orderSide ?? t.side ?? "").toUpperCase() === "BUY"
                                        ? "text-green-400"
                                        : "text-red-400"
                                    }
                                  >
                                    {(t.orderSide ?? t.side ?? "—").toUpperCase()}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t.quantity ?? "—"} @ {t.price ? `₹${safeNum(t.price).toLocaleString("en-IN")}` : "mkt"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Quick nav links */}
                        <div className="mt-5 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-2">Navigate for full detail</p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              {
                                label: "Positions",
                                icon: TrendingUp,
                                href: `/admin-console/positions?user=${detail?.clientId ?? detail?.id}`,
                              },
                              {
                                label: "Orders",
                                icon: BarChart3,
                                href: `/admin-console/orders?user=${detail?.clientId ?? detail?.id}`,
                              },
                              {
                                label: "Trades",
                                icon: Activity,
                                href: `/admin-console/advanced?user=${detail?.clientId ?? detail?.id}`,
                              },
                            ].map(({ label, icon: Icon, href }) => (
                              <a
                                key={label}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </a>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* ══ ACTIVITY ══════════════════════════════════════════════ */}
                  <TabsContent value="activity" className="mt-4 data-[state=inactive]:hidden">
                    {loading ? (
                      <LoadingRows count={6} />
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                        <Activity className="w-8 h-8 opacity-20" />
                        <p className="text-sm">No recent activity</p>
                      </div>
                    ) : (
                      <div className="space-y-0 mt-1">
                        {activities.map((evt: any, i: number) => (
                          <div
                            key={evt.id ?? i}
                            className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0"
                          >
                            <div
                              className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${activityBg(evt.type)}`}
                            >
                              <ActivityIcon type={evt.type ?? ""} action={evt.action ?? ""} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-medium text-foreground capitalize">
                                  {evt.action ?? evt.type ?? "Event"}
                                </p>
                                {evt.severity && evt.severity !== "INFO" && evt.severity !== "LOW" && (
                                  <Badge
                                    className={`text-[9px] px-1 py-0 ${
                                      evt.severity === "HIGH" || evt.severity === "CRITICAL"
                                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                                        : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                    }`}
                                  >
                                    {evt.severity}
                                  </Badge>
                                )}
                                {evt.amount != null && evt.amount !== 0 && (
                                  <span
                                    className={`text-[10px] font-semibold ${
                                      (evt.type ?? "").toUpperCase() === "DEPOSIT"
                                        ? "text-green-400"
                                        : (evt.type ?? "").toUpperCase() === "WITHDRAWAL"
                                        ? "text-red-400"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {(evt.type ?? "").toUpperCase() === "DEPOSIT" ? "+" : ""}
                                    {formatCurrency(safeNum(evt.amount))}
                                  </span>
                                )}
                              </div>
                              {evt.description && evt.description !== evt.action && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xs">
                                  {evt.description}
                                </p>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                              {formatDateIST(evt.timestamp ?? evt.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* ══ SECURITY ══════════════════════════════════════════════ */}
                  <TabsContent value="security" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {loading ? (
                      <LoadingRows count={5} />
                    ) : (
                      <>
                        <SectionTitle icon={Lock} title="Authentication" />
                        <InfoRow
                          label="OTP on Login"
                          value={
                            detail?.requireOtpOnLogin !== false ? (
                              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-xs">
                                Required
                              </Badge>
                            ) : (
                              <Badge className="bg-muted text-muted-foreground text-xs">Disabled</Badge>
                            )
                          }
                        />
                        <InfoRow
                          label="Account Status"
                          value={
                            isSuspended ? (
                              <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 text-xs">
                                Suspended
                              </Badge>
                            ) : isActive ? (
                              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 text-xs">
                                Active
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-xs">
                                Inactive
                              </Badge>
                            )
                          }
                        />

                        {/* Suspension detail */}
                        {isSuspended && (
                          <div className="mt-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 space-y-1">
                            <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" /> Account Frozen
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Since: {formatDateIST(detail?.suspendedAt)}
                            </p>
                            {detail?.suspensionReason && (
                              <p className="text-xs text-orange-300/80 italic">
                                &ldquo;{detail.suspensionReason}&rdquo;
                              </p>
                            )}
                          </div>
                        )}

                        <SectionTitle icon={Globe} title="Contact Verification" />
                        <InfoRow
                          label="Email Verified"
                          value={
                            detail?.emailVerified ? (
                              <span className="flex items-center gap-1 text-green-500 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {formatDateOnlyIST(detail.emailVerified)}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Not verified
                              </span>
                            )
                          }
                        />
                        <InfoRow
                          label="Phone Verified"
                          value={
                            detail?.phoneVerified ? (
                              <span className="flex items-center gap-1 text-green-500 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {formatDateOnlyIST(detail.phoneVerified)}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Not verified
                              </span>
                            )
                          }
                        />

                        <SectionTitle icon={Users} title="Sessions" />
                        <InfoRow
                          label="Active Sessions"
                          value={
                            typeof detail?.sessionCount === "number" ? (
                              <span className={`font-semibold ${detail.sessionCount > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                                {detail.sessionCount} active
                              </span>
                            ) : "—"
                          }
                        />
                        <p className="text-xs text-muted-foreground mt-3 p-2.5 rounded-md bg-muted/20 border border-border/50">
                          Full session management and security controls are available in Edit Profile.
                        </p>
                      </>
                    )}
                  </TabsContent>

                  {/* ══ CRM ══════════════════════════════════════════════════ */}
                  <TabsContent value="crm" className="mt-4 data-[state=inactive]:hidden">
                    {/* Add note */}
                    <div className="mb-4">
                      <SectionTitle icon={MessageSquare} title="Add Note" />
                      <Textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Type a CRM note for this client…"
                        className="text-sm resize-none h-20 bg-muted/30 border-border focus:border-primary"
                        disabled={addingNote}
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          size="sm"
                          onClick={handleAddNote}
                          disabled={!newNote.trim() || addingNote}
                          className="text-xs h-7 gap-1.5"
                        >
                          {addingNote ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <SendHorizonal className="w-3 h-3" />
                          )}
                          Add Note
                        </Button>
                      </div>
                    </div>

                    <Separator className="mb-4" />

                    <SectionTitle icon={Clock} title="Recent Notes" />

                    {crmLoading ? (
                      <LoadingRows count={3} />
                    ) : crmError ? (
                      <div className="flex items-center gap-2 text-muted-foreground mt-2 p-3 rounded-lg bg-muted/20">
                        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                        <p className="text-xs">{crmError}</p>
                      </div>
                    ) : crmNotes.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <MessageSquare className="w-7 h-7 opacity-20" />
                        <p className="text-xs">No notes yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {crmNotes.map((note: any) => (
                          <div
                            key={note.id}
                            className={`rounded-lg p-3 border text-xs ${
                              note.isPinned
                                ? "bg-yellow-500/5 border-yellow-500/25"
                                : "bg-muted/20 border-border/50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5 gap-2">
                              <div className="flex items-center gap-1.5">
                                {note.isPinned && (
                                  <Pin className="w-3 h-3 text-yellow-400 shrink-0" />
                                )}
                                <span className="text-muted-foreground">
                                  {note.createdBy?.name ?? "Admin"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {note.visibility === "MANAGER_ONLY" && (
                                  <Badge className="text-[9px] px-1 py-0 bg-purple-500/15 text-purple-400 border-purple-500/30">
                                    Private
                                  </Badge>
                                )}
                                <span className="text-muted-foreground text-[10px]">
                                  {formatDateIST(note.createdAt)}
                                </span>
                              </div>
                            </div>
                            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{note.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CRM Tasks */}
                    {(crmTasksLoading || crmTasks.length > 0) && (
                      <>
                        <Separator className="my-4" />
                        <SectionTitle icon={CheckSquare} title="Active Tasks" />
                        {crmTasksLoading ? (
                          <LoadingRows count={2} />
                        ) : (
                          <div className="space-y-2">
                            {crmTasks.map((task: any) => (
                              <div
                                key={task.id}
                                className="rounded-lg p-3 border border-border/50 bg-muted/20 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-medium text-foreground truncate">{task.title}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {task.priority && (
                                      <Badge
                                        className={`text-[9px] px-1 py-0 ${
                                          task.priority === "HIGH" || task.priority === "URGENT"
                                            ? "bg-red-500/15 text-red-400 border-red-500/30"
                                            : task.priority === "MEDIUM"
                                            ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {task.priority}
                                      </Badge>
                                    )}
                                    <Badge className="text-[9px] px-1 py-0 bg-blue-500/15 text-blue-400 border-blue-500/30">
                                      {(task.kind ?? "TASK").replace(/_/g, " ")}
                                    </Badge>
                                  </div>
                                </div>
                                {task.dueAt && (
                                  <p className="flex items-center gap-1 text-muted-foreground text-[10px]">
                                    <CalendarClock className="w-3 h-3" />
                                    Due: {formatDateIST(task.dueAt)}
                                  </p>
                                )}
                                {task.description && (
                                  <p className="text-muted-foreground mt-0.5 truncate">{task.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ══ RISK ══════════════════════════════════════════════════ */}
                  <TabsContent value="risk" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {riskLoading ? (
                      <LoadingRows count={5} />
                    ) : riskError ? (
                      <div className="flex items-center gap-2 text-muted-foreground mt-4 p-3 rounded-lg bg-muted/20">
                        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                        <p className="text-xs">{riskError}</p>
                      </div>
                    ) : !riskData ? (
                      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                        <Shield className="w-8 h-8 opacity-20" />
                        <p className="text-sm">Loading risk limits…</p>
                      </div>
                    ) : (
                      <>
                        <SectionTitle icon={Shield} title="Risk Limits" />
                        {riskData.riskLimit ? (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <Badge
                                className={`text-xs ${
                                  riskData.riskLimit.status === "ACTIVE"
                                    ? "bg-green-500/15 text-green-500 border-green-500/30"
                                    : "bg-red-500/15 text-red-400 border-red-500/30"
                                }`}
                              >
                                {riskData.riskLimit.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <StatMiniCard
                                label="Max Daily Loss"
                                value={formatCurrency(safeNum(riskData.riskLimit.maxDailyLoss))}
                                valueClass="text-red-400"
                              />
                              <StatMiniCard
                                label="Max Position"
                                value={formatCurrency(safeNum(riskData.riskLimit.maxPositionSize))}
                                valueClass="text-blue-400"
                              />
                              <StatMiniCard
                                label="Max Leverage"
                                value={`${safeNum(riskData.riskLimit.maxLeverage).toFixed(1)}×`}
                                valueClass="text-orange-400"
                              />
                              <StatMiniCard
                                label="Max Daily Trades"
                                value={riskData.riskLimit.maxDailyTrades ?? "—"}
                                valueClass="text-purple-400"
                              />
                            </div>

                            {/* Threshold overrides */}
                            {(riskData.riskLimit.riskLevelLowPct != null ||
                              riskData.riskLimit.riskLevelMediumPct != null ||
                              riskData.riskLimit.riskLevelHighPct != null ||
                              riskData.riskLimit.autoCloseLevelPct != null) && (
                              <>
                                <SectionTitle icon={Percent} title="Risk Thresholds (% of Margin)" />
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  {riskData.riskLimit.riskLevelLowPct != null && (
                                    <StatMiniCard
                                      label="Low Risk"
                                      value={`${riskData.riskLimit.riskLevelLowPct}%`}
                                      valueClass="text-green-400"
                                    />
                                  )}
                                  {riskData.riskLimit.riskLevelMediumPct != null && (
                                    <StatMiniCard
                                      label="Medium Risk"
                                      value={`${riskData.riskLimit.riskLevelMediumPct}%`}
                                      valueClass="text-yellow-400"
                                    />
                                  )}
                                  {riskData.riskLimit.riskLevelHighPct != null && (
                                    <StatMiniCard
                                      label="High Risk"
                                      value={`${riskData.riskLimit.riskLevelHighPct}%`}
                                      valueClass="text-orange-400"
                                    />
                                  )}
                                  {riskData.riskLimit.autoCloseLevelPct != null && (
                                    <StatMiniCard
                                      label="Auto-Close"
                                      value={`${riskData.riskLimit.autoCloseLevelPct}%`}
                                      valueClass="text-red-400"
                                    />
                                  )}
                                </div>
                              </>
                            )}

                            {riskData.riskLimit.maxDailyLossInr != null && (
                              <>
                                <SectionTitle icon={Wallet} title="INR Override" />
                                <InfoRow
                                  label="Max Daily Loss (₹)"
                                  value={
                                    <span className="text-red-400 font-semibold">
                                      {formatCurrency(safeNum(riskData.riskLimit.maxDailyLossInr))}
                                    </span>
                                  }
                                />
                              </>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                            <Shield className="w-7 h-7 opacity-20" />
                            <p className="text-xs">No per-user risk limits configured</p>
                            <p className="text-[11px] text-muted-foreground/70">User inherits global risk config</p>
                          </div>
                        )}

                        {/* Base configs */}
                        {Array.isArray(riskData.baseConfigs) && riskData.baseConfigs.length > 0 && (
                          <>
                            <SectionTitle icon={BarChart3} title="Global Base Leverage" />
                            <div className="space-y-1">
                              {riskData.baseConfigs.map((cfg: any, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-md bg-muted/20 border border-border/50"
                                >
                                  <span className="text-muted-foreground">
                                    {cfg.segment} · {cfg.productType}
                                  </span>
                                  <span className="font-medium text-foreground">{safeNum(cfg.leverage).toFixed(1)}×</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </TabsContent>

                  {/* ══ BONUS ══════════════════════════════════════════════════ */}
                  <TabsContent value="bonus" className="mt-4 space-y-0 data-[state=inactive]:hidden">
                    {bonusLoading ? (
                      <LoadingRows count={4} />
                    ) : bonusError ? (
                      <div className="flex items-center gap-2 text-muted-foreground mt-4 p-3 rounded-lg bg-muted/20">
                        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
                        <p className="text-xs">{bonusError}</p>
                      </div>
                    ) : !bonusData ? (
                      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                        <Gift className="w-8 h-8 opacity-20" />
                        <p className="text-sm">Loading bonus data…</p>
                      </div>
                    ) : (
                      <>
                        <SectionTitle icon={Wallet} title="Bonus Balance" />
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <StatMiniCard
                            label="Credit Balance"
                            value={formatCurrency(bonusData.creditBalance)}
                            valueClass="text-purple-400"
                          />
                          <StatMiniCard
                            label="Total Grants"
                            value={bonusData.grants.length}
                            valueClass="text-blue-400"
                          />
                        </div>

                        <SectionTitle icon={Gift} title="Bonus Grants" />
                        {bonusData.grants.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                            <Gift className="w-7 h-7 opacity-20" />
                            <p className="text-xs">No bonus grants</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {bonusData.grants.map((grant: any, i: number) => (
                              <div
                                key={grant.id ?? i}
                                className="rounded-lg p-3 border border-border/50 bg-muted/20 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="font-medium text-foreground truncate">
                                    {grant.rule?.name ?? grant.promoCode ?? "Bonus Grant"}
                                  </span>
                                  <Badge
                                    className={`text-[9px] px-1 py-0 shrink-0 ${
                                      grant.status === "ACTIVE"
                                        ? "bg-green-500/15 text-green-500 border-green-500/30"
                                        : grant.status === "EXPIRED"
                                        ? "bg-muted text-muted-foreground"
                                        : grant.status === "CLAWED_BACK"
                                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                                        : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                    }`}
                                  >
                                    {(grant.status ?? "—").replace(/_/g, " ")}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground">
                                  <span className="text-purple-400 font-semibold">
                                    +{formatCurrency(safeNum(grant.amount ?? grant.creditAmount))}
                                  </span>
                                  <span className="text-[10px]">{formatDateOnlyIST(grant.grantedAt ?? grant.createdAt)}</span>
                                </div>
                                {grant.expiresAt && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Expires: {formatDateOnlyIST(grant.expiresAt)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>

                </div>
              </Tabs>
            </div>

            {/* ── Footer CTAs ──────────────────────────────────────────────── */}
            <div className="shrink-0 px-5 py-3 border-t border-border flex items-center gap-2 bg-card/80 backdrop-blur-sm">
              {/* Quick-action icon buttons */}
              <Button
                size="sm"
                variant="outline"
                className={`h-8 w-8 p-0 shrink-0 ${isSuspended ? "border-green-500/40 text-green-500 hover:bg-green-500/10" : "border-orange-500/40 text-orange-400 hover:bg-orange-500/10"}`}
                onClick={handleFreezeToggle}
                disabled={freezing || !detail}
                title={isSuspended ? "Unfreeze account" : "Freeze account"}
              >
                {freezing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : isSuspended ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 shrink-0 border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-primary/40"
                onClick={handleResetMpin}
                disabled={resettingMpin || !detail}
                title="Reset MPIN"
              >
                {resettingMpin ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Fingerprint className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs h-8 gap-1.5"
                onClick={() => {
                  onStatementClick()
                  onClose()
                }}
              >
                <Eye className="w-3.5 h-3.5" />
                Statement
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs h-8 gap-1.5"
                onClick={() => handleTabChange("kyc")}
              >
                <FileCheck className="w-3.5 h-3.5" />
                KYC
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs h-8 bg-primary hover:bg-primary/90 gap-1.5"
                onClick={() => {
                  onEditClick()
                  onClose()
                }}
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Profile
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
