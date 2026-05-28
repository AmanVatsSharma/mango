/**
 * @file user-management.tsx
 * @module admin-console
 * @description Command-center grade user management — modern stats bar, always-visible filter pills,
 *   active-filter chips, sortable table, expandable rows, user detail drawer, consolidated action
 *   dropdown, sticky bulk-ops bar, CSV export, and column configurator.
 *
 * Notes:
 * - Green dot before name = trading dashboard SSE is active for that user.
 * - Live mode polls every 25 s; `/api/admin/presence/stream` pushes instant deltas when Redis is on.
 * - Dup badge: normalized email/phone overlap (`contactDuplicate=1` filter; MODERATOR book-scoped server-side).
 * - Group by contact key loads `GET /api/admin/users/contact-clusters` (collapsible clusters).
 * - Shareable URL: `contactDuplicate=1`, `groupedClusters=1` (with `userId` / `rmId` preserved).
 * - All existing logic (fetch, SSE, URL sync, dialogs) preserved; only JSX redesigned.
 */

"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import {
  Users,
  Search,
  Eye,
  Edit,
  Download,
  UserPlus,
  Shield,
  DollarSign,
  Activity,
  Copy,
  Check,
  AlertTriangle,
  X,
  FileCheck,
  Clock,
  CheckCircle2,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Columns3,
  Wifi,
  TrendingUp,
  Wallet,
  Filter,
  SortAsc,
  Radio,
  ExternalLink,
  UserCheck,
  Layers,
} from "lucide-react"
import { StatusBadge, PageHeader, RefreshButton, Pagination } from "./shared"
import { CreateUserDialog } from "./create-user-dialog"
import { UserStatementDialog } from "./user-statement-dialog"
import { AddFundsDialog } from "./add-funds-dialog"
import { EditUserDialog } from "./edit-user-dialog"
import { KYCManagementDialog } from "./kyc-management-dialog"
import { UserActivityDialog } from "./user-activity-dialog"
import { UserQuickActions } from "./user-quick-actions"
import { UserDetailDrawer } from "./user-detail-drawer"
import { UserQuickNotePopover } from "./user-quick-note-popover"
import { toast } from "@/hooks/use-toast"
import { deriveDataSourceStatus, type DataSourceStatus } from "@/lib/admin/data-source"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"
import Link from "next/link"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"

// ─── Types ──────────────────────────────────────────────────────────────────

type ContactClusterApi = {
  clusterType: "email" | "phone"
  clusterKey: string
  members: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    clientId: string | null
    createdAt: string
    kycStatus: string
  }[]
}

type RelatedUserApiRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  createdAt: string
  kycStatus: string
}

type SortField = "name" | "balance" | "joined" | null
type SortDir = "asc" | "desc"

type ColumnKey = "clientId" | "account" | "status" | "kyc" | "onboarding" | "joined"
type ColumnConfig = Record<ColumnKey, boolean>

const DEFAULT_COLUMNS: ColumnConfig = {
  clientId: true,
  account: true,
  status: true,
  kyc: true,
  onboarding: true,
  joined: false,
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  clientId: "Client ID",
  account: "Account",
  status: "Status",
  kyc: "KYC",
  onboarding: "Onboarding",
  joined: "Joined",
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeShareableAdminFlag(value: string | null): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

function formatCurrencyCompact(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`
  return `₹${amount.toLocaleString("en-IN")}`
}

function getOnboardingStage(user: any): { stage: number; labels: string[] } {
  const labels = ["Created", "KYC", "Funded", "Active"]
  const kyc = (user.kycStatus ?? "").toUpperCase()
  const kycDone = kyc === "APPROVED" || kyc === "VERIFIED"
  const funded = (user.stats?.totalDeposits ?? 0) > 0
  const active = (user.isActive === true || user.isActive !== false) && (user.totalTrades ?? user.stats?.totalOrders ?? 0) > 0

  let stage = 0
  if (kycDone) stage = 1
  if (funded) stage = 2
  if (active) stage = 3

  return { stage, labels }
}

function exportUsersToCSV(users: any[], columns: ColumnConfig): void {
  const headers = ["Name", "Email", "Phone"]
  if (columns.clientId) headers.push("Client ID")
  if (columns.account) headers.push("Balance", "Available Margin", "Used Margin")
  if (columns.status) headers.push("Status")
  if (columns.kyc) headers.push("KYC Status")
  if (columns.joined) headers.push("Joined")
  headers.push("Total Trades", "Active Positions")

  const rows = users.map((u) => {
    const cols: string[] = [
      u.name ?? "",
      u.email ?? "",
      u.phone ?? "",
    ]
    if (columns.clientId) cols.push(u.clientId ?? "")
    if (columns.account) {
      cols.push(String(u.balance ?? 0))
      cols.push(String(u.availableMargin ?? 0))
      cols.push(String(u.usedMargin ?? 0))
    }
    if (columns.status) cols.push(u.status ?? "")
    if (columns.kyc) cols.push(u.kycStatus ?? "")
    if (columns.joined) cols.push(u.joinDate ?? "")
    cols.push(String(u.totalTrades ?? u.stats?.totalOrders ?? 0))
    cols.push(String(u.activePositions ?? u.stats?.activePositions ?? 0))
    return cols
  })

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Related Accounts Popover (preserved) ───────────────────────────────────

function RelatedAccountsPopover({
  userId,
  totalDup,
  dupTitle,
}: {
  userId: string
  totalDup: number
  dupTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<RelatedUserApiRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/related`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.related)) {
          setRows(data.related as RelatedUserApiRow[])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, userId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="cursor-pointer border-amber-500/50 text-amber-600 text-[10px] shrink-0"
          title={dupTitle ?? "Accounts with same normalized email or phone tail"}
        >
          Dup {totalDup}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <p className="text-xs font-medium text-foreground mb-2">Related accounts</p>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No other visible accounts.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto text-xs">
            {rows.map((r) => (
              <li key={r.id} className="border-b border-border pb-2 last:border-0">
                <Link
                  href={buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: r.id })}
                  className="text-primary font-mono hover:underline"
                >
                  {r.clientId ?? r.id}
                </Link>
                <p className="text-muted-foreground truncate">{r.name ?? "—"}</p>
                <p className="text-muted-foreground">KYC {r.kycStatus}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── Sample data (preserved) ─────────────────────────────────────────────────

const mockUsers = [
  {
    id: "1",
    clientId: "USR_001234",
    name: "Alex Chen",
    email: "alex.chen@email.com",
    phone: "+1-555-0123",
    balance: 45230.5,
    availableMargin: 40000,
    usedMargin: 5230,
    status: "active",
    kycStatus: "verified",
    joinDate: "15/01/2024",
    joinDateIso: "2024-01-15T00:00:00.000Z",
    lastLogin: "2 hours ago",
    totalTrades: 156,
    winRate: 78,
    tradingAccount: { id: "acc-1", balance: 45230, availableMargin: 40000, usedMargin: 5230 },
    stats: { totalOrders: 156, activePositions: 3, totalDeposits: 50000, totalWithdrawals: 5000 },
    isActive: true,
    suspendedAt: null,
    eligibilityPolicyDormant: false,
    relatedEmailCount: 0,
    relatedPhoneCount: 0,
    isTradingDashboardOnline: false,
  },
]

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subLabel,
  icon: Icon,
  iconColor,
  onClick,
  active,
}: {
  label: string
  value: React.ReactNode
  subLabel?: string
  icon: React.ElementType
  iconColor: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15 }}>
      <Card
        className={`bg-card border-border shadow-sm neon-border transition-all ${
          onClick ? "cursor-pointer hover:border-primary/40" : ""
        } ${active ? "border-primary/60 bg-primary/5" : ""}`}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
              <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
              {subLabel && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subLabel}</p>}
            </div>
            <div className={`p-2 rounded-lg bg-muted/50 ${iconColor} shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Filter Chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs border border-primary/25">
      {label}
      <button onClick={onRemove} className="hover:text-primary/60">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ─── Onboarding Steps ────────────────────────────────────────────────────────

function OnboardingSteps({ user }: { user: any }) {
  const { stage, labels } = getOnboardingStage(user)
  return (
    <div className="flex items-center gap-0.5">
      {labels.map((l, i) => (
        <span
          key={l}
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
            i <= stage
              ? "bg-green-500/15 text-green-500"
              : "bg-muted text-muted-foreground/50"
          }`}
          title={l}
        >
          {l[0]}
        </span>
      ))}
    </div>
  )
}

// ─── User Avatar ─────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name?: string }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs shrink-0 select-none">
      {initials}
    </div>
  )
}

// ─── Sortable Column Header ───────────────────────────────────────────────────

function SortableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string
  field: SortField
  currentField: SortField
  currentDir: SortDir
  onSort: (f: SortField) => void
  className?: string
}) {
  const active = currentField === field
  return (
    <TableHead
      className={`text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ChevronUp className="w-3 h-3 text-primary" />
          ) : (
            <ChevronDown className="w-3 h-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </TableHead>
  )
}

// ─── Column Configurator ──────────────────────────────────────────────────────

function ColumnConfigurator({
  columns,
  onChange,
}: {
  columns: ColumnConfig
  onChange: (c: ColumnConfig) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-foreground text-xs h-8 px-2.5 gap-1.5">
          <Columns3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Columns</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="end">
        <p className="text-xs font-semibold text-foreground mb-3">Toggle columns</p>
        <div className="space-y-2">
          {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor={`col-${key}`}>
                {COLUMN_LABELS[key]}
              </Label>
              <Switch
                id={`col-${key}`}
                checked={columns[key]}
                onCheckedChange={(v) => onChange({ ...columns, [key]: v })}
                className="scale-75"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UserManagement() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL params
  const rmIdFromUrl = searchParams.get("rmId")
  const userIdFromUrl = searchParams.get("userId")
  const openStatementFromUrl = searchParams.get("openStatement")
  const groupedClustersInitial = normalizeShareableAdminFlag(searchParams.get("groupedClusters"))
  const contactDuplicateInitial = groupedClustersInitial
    ? false
    : normalizeShareableAdminFlag(searchParams.get("contactDuplicate"))

  // ── Dialog & selection state ──
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showStatementDialog, setShowStatementDialog] = useState(false)
  const [showAddFundsDialog, setShowAddFundsDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showKYCDialog, setShowKYCDialog] = useState(false)
  const [showActivityDialog, setShowActivityDialog] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // ── Drawer state ──
  const [drawerUser, setDrawerUser] = useState<any>(null)

  // ── Expanded rows ──
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // ── Sort & columns ──
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [columns, setColumns] = useState<ColumnConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("um-columns-v1")
        if (saved) return JSON.parse(saved) as ColumnConfig
      } catch {}
    }
    return DEFAULT_COLUMNS
  })

  // ── Filter state ──
  const [searchTerm, setSearchTerm] = useState("")
  const [filters, setFilters] = useState({
    status: "all" as "active" | "deactivated" | "suspended" | "all",
    kycStatus: "all" as string,
    role: "all" as string,
    dateFrom: "",
    dateTo: "",
    rmId: rmIdFromUrl ?? "",
    userId: userIdFromUrl ?? "",
    contactDuplicate: contactDuplicateInitial,
  })
  const [groupedContactView, setGroupedContactView] = useState(groupedClustersInitial)
  const [contactClusters, setContactClusters] = useState<ContactClusterApi[]>([])

  // ── Data state ──
  const [users, setUsers] = useState<typeof mockUsers>([])
  const [useSampleData, setUseSampleData] = useState(false)
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus>("loading")
  const [dataSourceErrors, setDataSourceErrors] = useState<string[]>([])
  const [dataSourceSummary, setDataSourceSummary] = useState<{ okCount: number; total: number } | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    kycPending: 0,
    totalBalance: 0,
  })

  const openedStatementForUserIdRef = useRef<string | null>(null)

  // ── Persist column config ──
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("um-columns-v1", JSON.stringify(columns))
    }
  }, [columns])

  // ── Sort handler ──
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
        return field
      }
      setSortDir("asc")
      return field
    })
  }, [])

  // ─── Build query string (preserved) ────────────────────────────────────────

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams()
    params.set("page", page.toString())
    params.set("limit", "50")
    if (searchTerm) params.set("search", searchTerm)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.kycStatus !== "all") params.set("kycStatus", filters.kycStatus)
    if (filters.role !== "all") params.set("role", filters.role)
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
    if (filters.dateTo) params.set("dateTo", filters.dateTo)
    if (filters.rmId) params.set("rmId", filters.rmId)
    if (filters.userId) params.set("userId", filters.userId)
    if (filters.contactDuplicate) params.set("contactDuplicate", "1")
    return params.toString()
  }, [page, searchTerm, filters])

  // ── URL sync (preserved) ──
  useEffect(() => {
    const rmId = searchParams.get("rmId")
    const userId = searchParams.get("userId")
    const cdParam = normalizeShareableAdminFlag(searchParams.get("contactDuplicate"))
    const gcParam = normalizeShareableAdminFlag(searchParams.get("groupedClusters"))
    setGroupedContactView(gcParam)
    setFilters((prev) => ({
      ...prev,
      ...(rmId ?? userId
        ? { rmId: rmId ?? prev.rmId, userId: userId ?? prev.userId }
        : {}),
      contactDuplicate: gcParam ? false : cdParam,
    }))
  }, [searchParams])

  useEffect(() => {
    if (!filters.userId) openedStatementForUserIdRef.current = null
  }, [filters.userId])

  // ── Deep link: openStatement=1 (preserved) ──
  useEffect(() => {
    if (openStatementFromUrl !== "1" || !filters.userId || loading || users.length === 0) return
    const u = users.find((x) => x.id === filters.userId)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("openStatement")
    const qs = next.toString()
    const cleanUrl = `${getAdminConsoleRoute("users")}${qs ? `?${qs}` : ""}`
    if (!u) {
      router.replace(cleanUrl)
      toast({ title: "Statement link", description: "User not in current list — adjust filters then retry.", variant: "destructive" })
      return
    }
    openedStatementForUserIdRef.current = filters.userId
    setSelectedUser(u)
    setShowStatementDialog(true)
    router.replace(cleanUrl)
  }, [openStatementFromUrl, filters.userId, loading, users, searchParams, router])

  // ── Deep link: userId= (preserved) ──
  useEffect(() => {
    if (!filters.userId || loading || users.length === 0 || openStatementFromUrl === "1") return
    if (openedStatementForUserIdRef.current === filters.userId) return
    const u = users.find((x) => x.id === filters.userId)
    if (!u) return
    openedStatementForUserIdRef.current = filters.userId
    setSelectedUser(u)
    setShowStatementDialog(true)
  }, [filters.userId, loading, users, openStatementFromUrl])

  const getIstTimestamp = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

  const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null)
    return data?.error ?? data?.message ?? fallback
  }

  // ── SSE presence ──
  const visibleUserIds = useMemo(() => users.map((u) => u.id), [users])
  const livePresence = useAdminTradingPresenceStream(visibleUserIds, !useSampleData && !loading)

  // ─── Fetch real data (preserved) ────────────────────────────────────────────

  const fetchRealData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
      setDataSourceStatus("loading")
    } else {
      setIsRefreshing(true)
    }

    const queryString = buildQueryString()
    const usersResult = { name: "Users API", ok: false, error: "" }
    const statsResult = { name: "Stats API", ok: false, error: "" }

    try {
      if (groupedContactView) {
        const clustersResult = { name: "Contact clusters API", ok: false, error: "" }
        const statsResult2 = { name: "Stats API", ok: false, error: "" }
        const [clustersResponse, statsResponse] = await Promise.all([
          fetch("/api/admin/users/contact-clusters").catch((error) => {
            clustersResult.error = error?.message ?? "Contact clusters request failed"
            return null
          }),
          fetch("/api/admin/stats").catch((error) => {
            statsResult2.error = error?.message ?? "Stats request failed"
            return null
          }),
        ])

        setUsers([])
        setTotalPages(1)

        if (clustersResponse?.ok) {
          const data = await clustersResponse.json()
          setContactClusters(Array.isArray(data.clusters) ? (data.clusters as ContactClusterApi[]) : [])
          clustersResult.ok = true
        } else if (clustersResponse) {
          clustersResult.error = await getResponseErrorMessage(clustersResponse, "Failed to load contact clusters")
          setContactClusters([])
        } else {
          setContactClusters([])
        }

        if (statsResponse?.ok) {
          const data = await statsResponse.json()
          if (data.success && data.stats) {
            setStats({ total: data.stats.users.total, active: data.stats.users.active, kycPending: data.stats.kyc?.pending ?? 0, totalBalance: data.stats.tradingAccounts.totalBalance })
            statsResult2.ok = true
          }
        } else if (statsResponse) {
          statsResult2.error = await getResponseErrorMessage(statsResponse, "Failed to load stats")
          setStats({ total: 0, active: 0, kycPending: 0, totalBalance: 0 })
        } else {
          setStats({ total: 0, active: 0, kycPending: 0, totalBalance: 0 })
        }

        const summary = deriveDataSourceStatus([clustersResult, statsResult2])
        setDataSourceStatus(summary.status)
        setDataSourceErrors(summary.errors)
        setDataSourceSummary({ okCount: summary.okCount, total: summary.total })
        setLastUpdatedAt(getIstTimestamp())
        return
      }

      const [usersResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/users?${queryString}`).catch((error) => {
          usersResult.error = error?.message ?? "Users request failed"
          return null
        }),
        fetch("/api/admin/stats").catch((error) => {
          statsResult.error = error?.message ?? "Stats request failed"
          return null
        }),
      ])

      if (usersResponse?.ok) {
        const data = await usersResponse.json()
        if (data.users) {
          const realUsers = data.users.map((u: any) => ({
            id: u.id,
            clientId: u.clientId ?? u.id.slice(0, 10),
            name: u.name ?? "Unknown",
            email: u.email ?? "N/A",
            phone: u.phone ?? "N/A",
            balance: u.tradingAccount?.balance ?? 0,
            availableMargin: u.tradingAccount?.availableMargin ?? 0,
            usedMargin: u.tradingAccount?.usedMargin ?? 0,
            status: u.suspendedAt ? "suspended" : u.isActive ? "active" : "deactivated",
            isActive: u.isActive !== false,
            suspendedAt: u.suspendedAt ?? null,
            eligibilityPolicyDormant: Boolean(u.eligibilityPolicyDormant),
            kycStatus: u.kycStatus === "APPROVED" ? "verified" : u.kycStatus === "PENDING" ? "pending" : u.kycStatus ?? "not_verified",
            joinDate: new Date(u.createdAt).toLocaleDateString("en-IN"),
            joinDateIso: u.createdAt,
            totalTrades: u.stats?.totalOrders ?? 0,
            activePositions: u.stats?.activePositions ?? 0,
            totalDeposits: u.stats?.totalDeposits ?? 0,
            totalWithdrawals: u.stats?.totalWithdrawals ?? 0,
            tradingAccount: u.tradingAccount,
            stats: u.stats,
            isTradingDashboardOnline: Boolean(u.isTradingDashboardOnline),
            relatedEmailCount: typeof u.relatedEmailCount === "number" ? u.relatedEmailCount : 0,
            relatedPhoneCount: typeof u.relatedPhoneCount === "number" ? u.relatedPhoneCount : 0,
          }))
          setUsers(realUsers)
          setTotalPages(data.pages ?? 1)
          usersResult.ok = true
        }
      } else if (usersResponse) {
        usersResult.error = await getResponseErrorMessage(usersResponse, "Failed to load users")
        setUsers([])
        setTotalPages(1)
      } else {
        setUsers([])
        setTotalPages(1)
      }

      if (statsResponse?.ok) {
        const data = await statsResponse.json()
        if (data.success && data.stats) {
          setStats({
            total: data.stats.users.total,
            active: data.stats.users.active,
            kycPending: data.stats.kyc?.pending ?? 0,
            totalBalance: data.stats.tradingAccounts.totalBalance,
          })
          statsResult.ok = true
        }
      } else if (statsResponse) {
        statsResult.error = await getResponseErrorMessage(statsResponse, "Failed to load stats")
        setStats({ total: 0, active: 0, kycPending: 0, totalBalance: 0 })
      } else {
        setStats({ total: 0, active: 0, kycPending: 0, totalBalance: 0 })
      }

      const summary = deriveDataSourceStatus([usersResult, statsResult])
      setDataSourceStatus(summary.status)
      setDataSourceErrors(summary.errors)
      setDataSourceSummary({ okCount: summary.okCount, total: summary.total })
      setLastUpdatedAt(getIstTimestamp())
    } catch (error: any) {
      setUsers([])
      setStats({ total: 0, active: 0, kycPending: 0, totalBalance: 0 })
      setTotalPages(1)
      setDataSourceStatus("error")
      setDataSourceErrors([error?.message ?? "Unable to fetch user data"])
      setDataSourceSummary({ okCount: 0, total: 2 })
    } finally {
      if (!silent) setLoading(false)
      setIsRefreshing(false)
    }
  }, [buildQueryString, groupedContactView])

  useEffect(() => {
    if (!useSampleData) void fetchRealData()
    setSelectedUsers(new Set())
  }, [page, searchTerm, filters, useSampleData, groupedContactView])

  const fetchRealDataRef = useRef(fetchRealData)
  fetchRealDataRef.current = fetchRealData

  // 25s polling
  useEffect(() => {
    if (useSampleData) return
    const id = window.setInterval(() => void fetchRealDataRef.current({ silent: true }), 25_000)
    return () => window.clearInterval(id)
  }, [useSampleData])

  // ── Sample data ──
  const handleUseSampleData = () => {
    const totalBalance = mockUsers.reduce((sum, u) => sum + (u.balance ?? 0), 0)
    const activeCount = mockUsers.filter((u) => u.status === "active").length
    const kycPending = mockUsers.filter((u) => u.kycStatus === "pending").length
    setUseSampleData(true)
    setGroupedContactView(false)
    setContactClusters([])
    setLoading(false)
    setUsers(mockUsers)
    setTotalPages(1)
    setStats({ total: mockUsers.length, active: activeCount, kycPending, totalBalance })
    setDataSourceStatus("sample")
    setDataSourceErrors([])
    setDataSourceSummary({ okCount: 0, total: 2 })
    setLastUpdatedAt(getIstTimestamp())
    toast({ title: "Sample data loaded", description: "User management is now showing sample data." })
  }

  const handleUseLiveData = () => setUseSampleData(false)

  // ── Bulk actions (preserved) ──
  const handleBulkAction = async (action: "activate" | "deactivate") => {
    if (useSampleData) {
      toast({ title: "Live data required", description: "Switch to live data to perform bulk actions.", variant: "destructive" })
      return
    }
    if (selectedUsers.size === 0) {
      toast({ title: "No Selection", description: "Please select at least one user", variant: "destructive" })
      return
    }
    if (!confirm(`Are you sure you want to ${action === "activate" ? "activate" : "deactivate"} ${selectedUsers.size} user(s)?`)) return

    setLoading(true)
    try {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedUsers), action: "updateStatus", isActive: action === "activate" }),
      })
      if (!response.ok) throw new Error("Failed to perform bulk operation")
      toast({ title: "Success", description: `${selectedUsers.size} user(s) ${action === "activate" ? "activated" : "deactivated"} successfully` })
      setSelectedUsers(new Set())
      void fetchRealData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message ?? "Failed to perform bulk operation", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleUserStatus = async (user: any) => {
    if (useSampleData) {
      toast({ title: "Live data required", description: "Switch to live data to update user status.", variant: "destructive" })
      return
    }
    const isLiveActive = user.isActive === true
    if (!confirm(`Are you sure you want to ${isLiveActive ? "deactivate" : "activate"} ${user.name}?`)) return
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isActive: !isLiveActive }),
      })
      if (response.ok) {
        toast({ title: "Success", description: `User ${isLiveActive ? "deactivated" : "activated"} successfully` })
        void fetchRealData()
      }
    } catch {
      toast({ title: "Error", description: "Failed to update user status", variant: "destructive" })
    }
  }

  const toggleUserSelection = (userId: string) => {
    const n = new Set(selectedUsers)
    n.has(userId) ? n.delete(userId) : n.add(userId)
    setSelectedUsers(n)
  }

  const toggleSelectAll = () => {
    setSelectedUsers(selectedUsers.size === users.length && users.length > 0 ? new Set() : new Set(users.map((u) => u.id)))
  }

  const toggleExpandRow = (userId: string) => {
    const n = new Set(expandedRows)
    n.has(userId) ? n.delete(userId) : n.add(userId)
    setExpandedRows(n)
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      status: "all",
      kycStatus: "all",
      role: "all",
      dateFrom: "",
      dateTo: "",
      contactDuplicate: false,
    }))
    setGroupedContactView(false)
    setContactClusters([])
    const next = new URLSearchParams(searchParams.toString())
    next.delete("contactDuplicate")
    next.delete("groupedClusters")
    void router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname)
  }

  // ── Derived data ──

  const filteredUsers = useMemo(() =>
    users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.clientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
    [users, searchTerm],
  )

  const sortedUsers = useMemo(() => {
    if (!sortField) return filteredUsers
    return [...filteredUsers].sort((a, b) => {
      let cmp = 0
      if (sortField === "name") cmp = (a.name ?? "").localeCompare(b.name ?? "")
      if (sortField === "balance") cmp = (a.balance ?? 0) - (b.balance ?? 0)
      if (sortField === "joined") cmp = new Date(a.joinDateIso ?? 0).getTime() - new Date(b.joinDateIso ?? 0).getTime()
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filteredUsers, sortField, sortDir])

  const filteredContactClusters = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return contactClusters
    return contactClusters
      .map((c) => ({
        ...c,
        members: c.members.filter(
          (m) =>
            (m.name?.toLowerCase().includes(q)) ||
            (m.clientId?.toLowerCase().includes(q)) ||
            (m.email?.toLowerCase().includes(q)) ||
            (m.phone?.toLowerCase().includes(q)) ||
            c.clusterKey.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.members.length > 0)
  }, [contactClusters, searchTerm])

  const dataBadge = (() => {
    if (dataSourceStatus === "live") return { status: "SUCCESS", label: "Live" }
    if (dataSourceStatus === "partial") {
      const suffix = dataSourceSummary ? ` ${dataSourceSummary.okCount}/${dataSourceSummary.total}` : ""
      return { status: "WARNING", label: `Partial${suffix}` }
    }
    if (dataSourceStatus === "error") return { status: "ERROR", label: "Error" }
    if (dataSourceStatus === "sample") return { status: "INFO", label: "Sample" }
    return { status: "PENDING", label: "Loading" }
  })()

  const liveNowCount = useMemo(() =>
    users.filter((u) => {
      const live = livePresence[u.id]
      return live !== undefined ? live : Boolean(u.isTradingDashboardOnline)
    }).length,
    [users, livePresence],
  )

  const suspendedCount = useMemo(() => users.filter((u) => u.suspendedAt).length, [users])

  // Active filter chips data
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; remove: () => void }[] = []
    if (filters.status !== "all") chips.push({ label: `Status: ${filters.status}`, remove: () => setFilters((p) => ({ ...p, status: "all" })) })
    if (filters.kycStatus !== "all") chips.push({ label: `KYC: ${filters.kycStatus}`, remove: () => setFilters((p) => ({ ...p, kycStatus: "all" })) })
    if (filters.role !== "all") chips.push({ label: `Role: ${filters.role}`, remove: () => setFilters((p) => ({ ...p, role: "all" })) })
    if (filters.dateFrom) chips.push({ label: `From: ${filters.dateFrom}`, remove: () => setFilters((p) => ({ ...p, dateFrom: "" })) })
    if (filters.dateTo) chips.push({ label: `To: ${filters.dateTo}`, remove: () => setFilters((p) => ({ ...p, dateTo: "" })) })
    if (filters.contactDuplicate) {
      chips.push({
        label: "Duplicate contacts",
        remove: () => {
          setFilters((p) => ({ ...p, contactDuplicate: false }))
          const next = new URLSearchParams(searchParams.toString())
          next.delete("contactDuplicate")
          void router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname)
        },
      })
    }
    if (groupedContactView) {
      chips.push({
        label: "Grouped clusters",
        remove: () => {
          setGroupedContactView(false)
          setContactClusters([])
          const next = new URLSearchParams(searchParams.toString())
          next.delete("groupedClusters")
          void router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname)
        },
      })
    }
    return chips
  }, [filters, groupedContactView, searchParams, router, pathname])

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Data source alerts ── */}
      {dataSourceStatus === "error" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <AlertTitle className="text-red-500 text-sm">Live data unavailable</AlertTitle>
          <AlertDescription className="text-red-400 text-xs space-y-2">
            {dataSourceErrors.map((m) => <p key={m}>{m}</p>)}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => void fetchRealData()} disabled={loading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Retry
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleUseSampleData}>
                Use Sample Data
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "partial" && (
        <Alert className="bg-yellow-500/10 border-yellow-500/50">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <AlertTitle className="text-yellow-500 text-sm">Partial data</AlertTitle>
          <AlertDescription className="text-yellow-500/80 text-xs space-y-2">
            {dataSourceErrors.map((m) => <p key={m}>{m}</p>)}
            <Button variant="outline" size="sm" className="text-xs" onClick={() => void fetchRealData()} disabled={loading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {dataSourceStatus === "sample" && (
        <Alert className="bg-blue-500/10 border-blue-500/50">
          <Activity className="h-4 w-4 text-blue-500 shrink-0" />
          <AlertTitle className="text-blue-500 text-sm">Sample data mode</AlertTitle>
          <AlertDescription className="text-blue-500/80 text-xs flex items-center gap-3">
            <span>Showing demo data — admin actions disabled.</span>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleUseLiveData}>
              Use Live Data
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Page header ── */}
      <PageHeader
        title="User Management"
        description="Manage accounts, KYC, funds, and access"
        icon={<Users className="w-6 h-6 shrink-0" />}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={dataBadge.status} type="general">{dataBadge.label}</StatusBadge>
            {lastUpdatedAt && <span className="text-xs text-muted-foreground hidden sm:inline">{lastUpdatedAt}</span>}
            {!useSampleData && (
              <Button variant="outline" size="sm" className="text-xs" onClick={handleUseSampleData}>
                Demo
              </Button>
            )}
            <Button
              onClick={() => setShowAddFundsDialog(true)}
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
              size="sm"
            >
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Add Funds</span>
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              size="sm"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">New User</span>
            </Button>
          </div>
        }
      />

      {/* ── Stats Bar (6 cards, click-to-filter) ── */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <StatCard
          label="Total Users"
          value={loading ? "—" : stats.total.toLocaleString()}
          subLabel="All accounts"
          icon={Users}
          iconColor="text-blue-400"
        />
        <StatCard
          label="Active"
          value={loading ? "—" : stats.active.toLocaleString()}
          subLabel={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% of total` : undefined}
          icon={UserCheck}
          iconColor="text-green-400"
          onClick={() => setFilters((p) => ({ ...p, status: p.status === "active" ? "all" : "active" }))}
          active={filters.status === "active"}
        />
        <StatCard
          label="Suspended"
          value={loading ? "—" : suspendedCount}
          subLabel="On this page"
          icon={AlertTriangle}
          iconColor="text-orange-400"
          onClick={() => setFilters((p) => ({ ...p, status: p.status === "suspended" ? "all" : "suspended" }))}
          active={filters.status === "suspended"}
        />
        <StatCard
          label="KYC Pending"
          value={loading ? "—" : stats.kycPending.toLocaleString()}
          subLabel="Awaiting review"
          icon={FileCheck}
          iconColor="text-yellow-400"
          onClick={() => setFilters((p) => ({ ...p, kycStatus: p.kycStatus === "PENDING" ? "all" : "PENDING" }))}
          active={filters.kycStatus === "PENDING"}
        />
        <StatCard
          label="Total AUM"
          value={loading ? "—" : formatCurrencyCompact(stats.totalBalance)}
          subLabel="Trading accounts"
          icon={Wallet}
          iconColor="text-purple-400"
        />
        <StatCard
          label="Live Now"
          value={loading ? "—" : liveNowCount}
          subLabel="On trading dashboard"
          icon={Radio}
          iconColor="text-cyan-400"
        />
      </motion.div>

      {/* ── Command Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-3 sm:p-4 space-y-3">
            {/* Row 1: Search + actions */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, client ID, email or phone…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-muted/40 border-border focus:border-primary text-sm h-9"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-foreground text-xs h-9 px-2.5 gap-1.5 shrink-0">
                    <SortAsc className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sort</span>
                    {sortField && <span className="text-primary">·</span>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
                  {(
                    [
                      { field: "name" as SortField, label: "Name" },
                      { field: "balance" as SortField, label: "Balance" },
                      { field: "joined" as SortField, label: "Date Joined" },
                    ] as const
                  ).map(({ field, label }) => (
                    <DropdownMenuItem
                      key={field}
                      onClick={() => handleSort(field)}
                      className={sortField === field ? "text-primary" : ""}
                    >
                      {label}
                      {sortField === field && (
                        <span className="ml-auto text-primary text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  {sortField && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setSortField(null)} className="text-muted-foreground">
                        Clear sort
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <ColumnConfigurator columns={columns} onChange={setColumns} />

              <Button
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground hover:text-foreground text-xs h-9 px-2.5 gap-1.5 shrink-0"
                onClick={() => exportUsersToCSV(sortedUsers, columns)}
                disabled={sortedUsers.length === 0}
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>

              <RefreshButton
                onClick={() => (useSampleData ? handleUseLiveData() : void fetchRealData())}
                loading={loading || isRefreshing}
              />
            </div>

            {/* Row 2: Filter pills */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status */}
              <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v as any }))}>
                <SelectTrigger className="h-7 text-xs bg-muted/30 border-border w-auto min-w-[90px] px-2 gap-1">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="deactivated">Deactivated</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>

              {/* KYC */}
              <Select value={filters.kycStatus} onValueChange={(v) => setFilters((p) => ({ ...p, kycStatus: v }))}>
                <SelectTrigger className="h-7 text-xs bg-muted/30 border-border w-auto min-w-[90px] px-2 gap-1">
                  <SelectValue placeholder="KYC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All KYC</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="NOT_SUBMITTED">Not submitted</SelectItem>
                </SelectContent>
              </Select>

              {/* Role */}
              <Select value={filters.role} onValueChange={(v) => setFilters((p) => ({ ...p, role: v }))}>
                <SelectTrigger className="h-7 text-xs bg-muted/30 border-border w-auto min-w-[80px] px-2 gap-1">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="MODERATOR">Moderator</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>

              {/* Date range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs bg-muted/30 border-border px-2 gap-1">
                    <Clock className="w-3 h-3" />
                    {filters.dateFrom || filters.dateTo ? (
                      <span className="text-primary">
                        {filters.dateFrom && `${filters.dateFrom}`}
                        {filters.dateFrom && filters.dateTo && " → "}
                        {filters.dateTo && `${filters.dateTo}`}
                      </span>
                    ) : (
                      "Joined"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} className="h-7 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} className="h-7 text-xs mt-1" />
                    </div>
                    {(filters.dateFrom || filters.dateTo) && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setFilters((p) => ({ ...p, dateFrom: "", dateTo: "" }))}>
                        Clear dates
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Duplicate contacts */}
              <Button
                variant={filters.contactDuplicate ? "default" : "outline"}
                size="sm"
                className={`h-7 text-xs px-2 gap-1 ${filters.contactDuplicate ? "bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30" : "bg-muted/30 border-border"}`}
                disabled={groupedContactView}
                onClick={() => {
                  const on = !filters.contactDuplicate
                  setFilters((p) => ({ ...p, contactDuplicate: on }))
                  const next = new URLSearchParams(searchParams.toString())
                  on ? next.set("contactDuplicate", "1") : next.delete("contactDuplicate")
                  void router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname)
                }}
              >
                <Layers className="w-3 h-3" />
                Duplicates
              </Button>

              {/* Grouped clusters */}
              <Button
                variant={groupedContactView ? "default" : "outline"}
                size="sm"
                className={`h-7 text-xs px-2 gap-1 ${groupedContactView ? "bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30" : "bg-muted/30 border-border"}`}
                disabled={useSampleData}
                onClick={() => {
                  const on = !groupedContactView
                  setGroupedContactView(on)
                  if (on) setFilters((p) => ({ ...p, contactDuplicate: false }))
                  else setContactClusters([])
                  setSelectedUsers(new Set())
                  const next = new URLSearchParams(searchParams.toString())
                  if (on) { next.set("groupedClusters", "1"); next.delete("contactDuplicate") }
                  else next.delete("groupedClusters")
                  void router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname)
                }}
              >
                <Layers className="w-3 h-3" />
                Clusters
              </Button>

              {/* Clear all */}
              {activeFilterChips.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground px-2" onClick={clearFilters}>
                  <X className="w-3 h-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>

            {/* Row 3: Active filter chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {activeFilterChips.map((chip) => (
                  <FilterChip key={chip.label} label={chip.label} onRemove={chip.remove} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Users Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="px-4 sm:px-6 pt-4 pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-foreground">
              {groupedContactView
                ? `Contact clusters (${filteredContactClusters.length})`
                : `Users (${sortedUsers.length}${totalPages > 1 ? ` of ${stats.total}` : ""})`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {sortField && (
                <span className="text-primary">
                  Sorted by {sortField} {sortDir === "asc" ? "↑" : "↓"}
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-4">
            {/* ── Grouped clusters view ── */}
            {groupedContactView ? (
              <div className="px-4">
                {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading clusters…</p>}
                {!loading && filteredContactClusters.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No duplicate contact clusters in the current scope.</p>
                )}
                {!loading && filteredContactClusters.length > 0 && (
                  <Accordion type="multiple" className="w-full">
                    {filteredContactClusters.map((c, idx) => (
                      <AccordionItem key={`${c.clusterType}:${c.clusterKey}:${idx}`} value={`${c.clusterType}:${c.clusterKey}:${idx}`}>
                        <AccordionTrigger className="text-sm">
                          <span className="text-left">
                            <span className="font-medium text-primary">{c.clusterType === "email" ? "Email" : "Phone"}</span>
                            <span className="text-muted-foreground mx-2">·</span>
                            <code className="text-xs bg-muted px-1 rounded">{c.clusterKey}</code>
                            <span className="text-muted-foreground mx-2">·</span>
                            {c.members.length} account{c.members.length !== 1 ? "s" : ""}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto rounded-md border border-border">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-border">
                                  <TableHead className="text-muted-foreground">Client ID</TableHead>
                                  <TableHead className="text-muted-foreground">Name</TableHead>
                                  <TableHead className="text-muted-foreground">Email</TableHead>
                                  <TableHead className="text-muted-foreground">Phone</TableHead>
                                  <TableHead className="text-muted-foreground">KYC</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {c.members.map((m) => (
                                  <TableRow key={m.id} className="border-border">
                                    <TableCell>
                                      <Link href={buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: m.id })} className="text-primary font-mono text-sm hover:underline">
                                        {m.clientId ?? m.id}
                                      </Link>
                                    </TableCell>
                                    <TableCell className="text-sm">{m.name ?? "—"}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{m.email ?? "—"}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{m.phone ?? "—"}</TableCell>
                                    <TableCell className="text-xs">{m.kycStatus}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            ) : (
              /* ── Main user table ── */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={selectedUsers.size === users.length && users.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <SortableHead label="User" field="name" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      {columns.clientId && <TableHead className="text-muted-foreground">Client ID</TableHead>}
                      {columns.account && <SortableHead label="Account" field="balance" currentField={sortField} currentDir={sortDir} onSort={handleSort} />}
                      {columns.status && <TableHead className="text-muted-foreground">Status</TableHead>}
                      {columns.kyc && <TableHead className="text-muted-foreground">KYC</TableHead>}
                      {columns.onboarding && <TableHead className="text-muted-foreground">Onboarding</TableHead>}
                      {columns.joined && <SortableHead label="Joined" field="joined" currentField={sortField} currentDir={sortDir} onSort={handleSort} />}
                      <TableHead className="text-muted-foreground text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Loading users…</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && sortedUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="w-8 h-8 opacity-20" />
                            <p className="text-sm">No users match your filters</p>
                            {activeFilterChips.length > 0 && (
                              <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters}>
                                Clear filters
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {!loading && sortedUsers.map((user, index) => {
                      const isExpanded = expandedRows.has(user.id)
                      const isOnline = livePresence[user.id] !== undefined ? livePresence[user.id] : Boolean(user.isTradingDashboardOnline)
                      const re = (user as any).relatedEmailCount ?? 0
                      const rp = (user as any).relatedPhoneCount ?? 0

                      return (
                        <>
                          <motion.tr
                            key={user.id}
                            className={`border-border hover:bg-muted/20 transition-colors cursor-pointer ${selectedUsers.has(user.id) ? "bg-primary/5" : ""} ${isExpanded ? "bg-muted/10" : ""}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.5) }}
                            onClick={(e) => {
                              // Don't expand if clicking on interactive elements
                              const target = e.target as HTMLElement
                              if (target.closest("button, a, input, [role=checkbox], [data-radix-collection-item]")) return
                              toggleExpandRow(user.id)
                            }}
                          >
                            {/* Checkbox */}
                            <TableCell className="pl-4 w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedUsers.has(user.id)}
                                onCheckedChange={() => toggleUserSelection(user.id)}
                              />
                            </TableCell>

                            {/* User column */}
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDrawerUser(user)
                                  }}
                                  className="shrink-0"
                                  title="Open user profile"
                                >
                                  <UserAvatar name={user.name} />
                                </button>
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                                    {isOnline && (
                                      <span
                                        className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.9)] ring-1 ring-green-500/30 shrink-0"
                                        aria-label="Trading dashboard online"
                                        title="Live on trading dashboard"
                                      />
                                    )}
                                    <button
                                      className="hover:text-primary transition-colors truncate max-w-[130px]"
                                      onClick={(e) => { e.stopPropagation(); setDrawerUser(user) }}
                                      title="Open profile"
                                    >
                                      {user.name}
                                    </button>
                                    {re + rp > 0 && (
                                      <RelatedAccountsPopover
                                        userId={user.id}
                                        totalDup={re + rp}
                                        dupTitle={`Email peers: ${re}; phone peers: ${rp}`}
                                      />
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate max-w-[160px]">{user.email}</p>
                                  <p className="text-[11px] text-muted-foreground/70">{user.phone}</p>
                                </div>
                              </div>
                            </TableCell>

                            {/* Client ID */}
                            {columns.clientId && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <code className="text-primary font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                                    {user.clientId}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(user.clientId, `cid-${user.id}`)}
                                    className="h-5 w-5 p-0"
                                  >
                                    {copiedField === `cid-${user.id}` ? (
                                      <Check className="w-3 h-3 text-green-400" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            )}

                            {/* Account */}
                            {columns.account && (
                              <TableCell>
                                <div>
                                  <p className="text-sm font-bold text-green-400">{formatCurrencyCompact(user.balance)}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Avl: {formatCurrencyCompact((user as any).availableMargin ?? 0)}
                                  </p>
                                </div>
                              </TableCell>
                            )}

                            {/* Status */}
                            {columns.status && (
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1">
                                  <StatusBadge status={user.status} type="user" />
                                  {(user as any).eligibilityPolicyDormant && (
                                    <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                                      Low activity
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                            )}

                            {/* KYC */}
                            {columns.kyc && (
                              <TableCell>
                                <StatusBadge status={user.kycStatus} type="kyc" />
                              </TableCell>
                            )}

                            {/* Onboarding */}
                            {columns.onboarding && (
                              <TableCell>
                                <OnboardingSteps user={user} />
                              </TableCell>
                            )}

                            {/* Joined */}
                            {columns.joined && (
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {user.joinDate}
                              </TableCell>
                            )}

                            {/* Actions */}
                            <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                {/* Statement */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  title="View Statement"
                                  onClick={() => { setSelectedUser(user); setShowStatementDialog(true) }}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                {/* Edit */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  title="Edit User"
                                  onClick={() => { setSelectedUser(user); setShowEditDialog(true) }}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>

                                {/* More dropdown */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">View</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => { setSelectedUser(user); setShowActivityDialog(true) }}>
                                      <Clock className="w-3.5 h-3.5 mr-2" /> Activity
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSelectedUser(user); setShowKYCDialog(true) }}>
                                      <FileCheck className="w-3.5 h-3.5 mr-2" /> KYC Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(buildRouteWithQuery(getAdminConsoleRoute("advanced"), { user: user.clientId ?? user.id }))}>
                                      <Activity className="w-3.5 h-3.5 mr-2" /> Trades
                                      <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(buildRouteWithQuery(getAdminConsoleRoute("positions"), { user: user.clientId ?? user.id, openOnly: "true" }))}>
                                      <TrendingUp className="w-3.5 h-3.5 mr-2" /> Positions
                                      <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(buildRouteWithQuery(getAdminConsoleRoute("orders"), { user: user.clientId ?? user.id }))}>
                                      <Download className="w-3.5 h-3.5 mr-2" /> Orders
                                      <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={() => handleToggleUserStatus(user)}
                                      className={(user as any).isActive ? "text-red-400 focus:text-red-400" : "text-green-400 focus:text-green-400"}
                                    >
                                      {(user as any).isActive ? (
                                        <><X className="w-3.5 h-3.5 mr-2" /> Deactivate</>
                                      ) : (
                                        <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Activate</>
                                      )}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Security / management quick actions (existing component) */}
                                <UserQuickActions
                                  user={user}
                                  onActionCompleted={() => void fetchRealData()}
                                  disabled={useSampleData}
                                  disabledReason="Switch to live data to run quick actions"
                                />
                              </div>
                            </TableCell>
                          </motion.tr>

                          {/* ── Expandable row detail ── */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr key={`${user.id}-expanded`} className="border-border">
                                <td colSpan={9} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 py-3 bg-muted/10 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
                                      {/* Balance details */}
                                      <div>
                                        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                                          <Wallet className="w-3 h-3" /> Balance Details
                                        </p>
                                        <div className="space-y-1 text-xs">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Total Balance</span>
                                            <span className="text-green-400 font-medium">{formatCurrencyCompact(user.balance)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Available Margin</span>
                                            <span>{formatCurrencyCompact((user as any).availableMargin ?? 0)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Used Margin</span>
                                            <span className={(user as any).usedMargin > 0 ? "text-orange-400" : ""}>{formatCurrencyCompact((user as any).usedMargin ?? 0)}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Activity summary */}
                                      <div>
                                        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                                          <Activity className="w-3 h-3" /> Trading Summary
                                        </p>
                                        <div className="space-y-1 text-xs">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Total Trades</span>
                                            <span className="font-medium">{user.totalTrades ?? user.stats?.totalOrders ?? 0}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Open Positions</span>
                                            <span className={(user as any).activePositions > 0 ? "text-blue-400 font-medium" : ""}>
                                              {(user as any).activePositions ?? user.stats?.activePositions ?? 0}
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Total Deposits</span>
                                            <span className="text-green-400">{formatCurrencyCompact((user as any).totalDeposits ?? user.stats?.totalDeposits ?? 0)}</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Quick CRM note */}
                                      <div>
                                        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                                          <Edit className="w-3 h-3" /> Quick Note
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <UserQuickNotePopover
                                            userId={user.id}
                                            userName={user.name}
                                            disabled={useSampleData}
                                          />
                                          <span className="text-xs text-muted-foreground">
                                            Add a CRM note for {user.name.split(" ")[0]}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                          Joined: {user.joinDate ?? "—"}
                                        </p>
                                      </div>
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!groupedContactView && (
              <div className="px-4 pt-3">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  loading={loading}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Sticky bulk ops bar ── */}
      <AnimatePresence>
        {selectedUsers.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border border-border shadow-xl rounded-xl px-4 py-2.5 text-sm"
          >
            <span className="text-muted-foreground text-xs mr-1">
              <span className="font-semibold text-foreground">{selectedUsers.size}</span> selected
            </span>
            <Separator orientation="vertical" className="h-5" />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-500/40 text-green-500 hover:bg-green-500/10"
              onClick={() => handleBulkAction("activate")}
              disabled={loading}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-500/40 text-red-500 hover:bg-red-500/10"
              onClick={() => handleBulkAction("deactivate")}
              disabled={loading}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Deactivate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border text-muted-foreground hover:text-foreground"
              onClick={() => exportUsersToCSV(sortedUsers.filter((u) => selectedUsers.has(u.id)), columns)}
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => setSelectedUsers(new Set())}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── User Detail Drawer ── */}
      <UserDetailDrawer
        open={Boolean(drawerUser)}
        onClose={() => setDrawerUser(null)}
        user={drawerUser}
        onEditClick={() => { setSelectedUser(drawerUser); setShowEditDialog(true) }}
        onStatementClick={() => { setSelectedUser(drawerUser); setShowStatementDialog(true) }}
      />

      {/* ── Dialogs (preserved) ── */}
      <CreateUserDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <UserStatementDialog open={showStatementDialog} onOpenChange={setShowStatementDialog} user={selectedUser} />
      <AddFundsDialog open={showAddFundsDialog} onOpenChange={setShowAddFundsDialog} />
      <EditUserDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        user={selectedUser}
        onUserUpdated={() => { void fetchRealData(); setShowEditDialog(false) }}
      />
      <KYCManagementDialog
        open={showKYCDialog}
        onOpenChange={setShowKYCDialog}
        user={selectedUser}
        onKYCUpdated={() => { void fetchRealData(); setShowKYCDialog(false) }}
      />
      <UserActivityDialog
        open={showActivityDialog}
        onOpenChange={setShowActivityDialog}
        user={selectedUser}
      />
    </div>
  )
}
