/**
 * @file dashboard-latest-onboarded-widgets.tsx
 * @module admin-console
 * @description Combined compact onboarding widget: dense signup list + row hover profile (admin home).
 * @author StockTrade
 * @created 2026-04-06
 * @updated 2026-04-07
 */

"use client"

import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"
import { TradingDashboardOnlineDot } from "@/components/admin-console/shared"
import { ScanEye, UserPlus, ChevronRight } from "lucide-react"

export type LatestOnboardedDashboardUser = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  kycStatus: string
  createdAt: string
  emailVerified: string | null
  phoneVerified: string | null
  tradingAccount: {
    balance: number
    availableMargin: number
    usedMargin: number
  } | null
  isTradingDashboardOnline?: boolean
}

export function mapApiUserToLatestOnboarded(raw: unknown): LatestOnboardedDashboardUser | null {
  if (!raw || typeof raw !== "object") return null
  const u = raw as Record<string, unknown>
  if (typeof u.id !== "string") return null

  let createdAt = ""
  if (typeof u.createdAt === "string") createdAt = u.createdAt
  else if (u.createdAt instanceof Date) createdAt = u.createdAt.toISOString()
  else createdAt = new Date().toISOString()

  const ta = u.tradingAccount
  let tradingAccount: LatestOnboardedDashboardUser["tradingAccount"] = null
  if (ta && typeof ta === "object" && ta !== null) {
    const t = ta as Record<string, unknown>
    tradingAccount = {
      balance: typeof t.balance === "number" ? t.balance : Number(t.balance) || 0,
      availableMargin:
        typeof t.availableMargin === "number" ? t.availableMargin : Number(t.availableMargin) || 0,
      usedMargin: typeof t.usedMargin === "number" ? t.usedMargin : Number(t.usedMargin) || 0,
    }
  }

  return {
    id: u.id,
    name: typeof u.name === "string" ? u.name : null,
    email: typeof u.email === "string" ? u.email : null,
    phone: typeof u.phone === "string" ? u.phone : null,
    clientId: typeof u.clientId === "string" ? u.clientId : null,
    kycStatus: typeof u.kycStatus === "string" ? u.kycStatus : "NOT_SUBMITTED",
    createdAt,
    emailVerified: typeof u.emailVerified === "string" ? u.emailVerified : null,
    phoneVerified: typeof u.phoneVerified === "string" ? u.phoneVerified : null,
    tradingAccount,
    isTradingDashboardOnline: Boolean(u.isTradingDashboardOnline),
  }
}

function formatJoinedIstShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function kycBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toUpperCase()
  if (s === "APPROVED") return "default"
  if (s === "PENDING" || s === "NOT_SUBMITTED") return "secondary"
  if (s === "REJECTED") return "destructive"
  return "outline"
}

function maskEmail(email: string | null): string {
  if (!email?.trim()) return "—"
  const [local, chain] = email.split("@")
  if (!chain) return "—"
  const safe = local.length <= 2 ? `${local.slice(0, 1)}***` : `${local.slice(0, 2)}***`
  return `${safe}@${chain}`
}

function maskPhone(phone: string | null): string {
  if (!phone?.trim()) return "—"
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "***"
  return `***${digits.slice(-4)}`
}

function initials(name: string | null, clientId: string | null): string {
  const n = (name || "").trim()
  if (n.length >= 2) return n.slice(0, 2).toUpperCase()
  const c = (clientId || "").trim()
  if (c.length >= 2) return c.slice(0, 2).toUpperCase()
  return "?"
}

function VerifiedChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
        ok ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
      }`}
    >
      {label} {ok ? "✓" : "—"}
    </span>
  )
}

/** Rich profile panel shared by hover surface (keeps markup in one place). */
function OnboardedProfilePanel({ u }: { u: LatestOnboardedDashboardUser }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 border">
          <AvatarFallback className="text-xs">{initials(u.name, u.clientId)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {u.isTradingDashboardOnline ? <TradingDashboardOnlineDot /> : null}
            <p className="font-semibold text-sm truncate">{u.name || "Unknown"}</p>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{u.clientId || u.id}</p>
          <Badge variant={kycBadgeVariant(u.kycStatus)} className="mt-1.5 text-[10px]">
            KYC: {u.kycStatus.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>
      <Separator />
      <div className="space-y-1.5 text-xs">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Joined (IST) </span>
          {formatJoinedIstFull(u.createdAt)}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Email </span>
          {maskEmail(u.email)}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Phone </span>
          {maskPhone(u.phone)}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <VerifiedChip label="Email" ok={Boolean(u.emailVerified)} />
          <VerifiedChip label="Phone" ok={Boolean(u.phoneVerified)} />
        </div>
      </div>
      {u.tradingAccount ? (
        <>
          <Separator />
          <div className="text-xs space-y-1">
            <p className="font-medium text-foreground">Wallet</p>
            <p className="text-muted-foreground">
              Balance{" "}
              <span className="text-foreground font-mono tabular-nums">
                ₹{u.tradingAccount.balance.toLocaleString("en-IN")}
              </span>
            </p>
            <p className="text-muted-foreground">
              Avail. margin{" "}
              <span className="text-foreground font-mono tabular-nums">
                ₹{u.tradingAccount.availableMargin.toLocaleString("en-IN")}
              </span>
            </p>
          </div>
        </>
      ) : null}
      <Separator />
      <Button size="sm" className="w-full h-8 text-xs" asChild>
        <Link href={buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: u.id })}>
          Open in User Management
        </Link>
      </Button>
    </div>
  )
}

function formatJoinedIstFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

type KycSummary = {
  approved: number
  rejected: number
  pending: number
}

type WidgetProps = {
  users: LatestOnboardedDashboardUser[]
  loading: boolean
  kycSummary?: KycSummary
}

function WidgetSkeleton() {
  return (
    <div className="divide-y divide-border/50 rounded-md border border-border/50 overflow-hidden">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <Skeleton className="h-3 w-[45%] max-w-[160px]" />
            <Skeleton className="h-2.5 w-20 hidden sm:block" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full shrink-0" />
          <Skeleton className="h-3 w-16 shrink-0 hidden sm:block" />
        </div>
      ))}
    </div>
  )
}

/** One dense row: list scan + hover/focus for full profile (single-card layout). */
function OnboardedPulseRow({ u }: { u: LatestOnboardedDashboardUser }) {
  const cid = u.clientId || u.id.slice(0, 8)
  return (
    <HoverCard openDelay={180} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="h-8 w-8 border border-border/80 shrink-0">
            <AvatarFallback className="text-[10px] font-semibold">{initials(u.name, u.clientId)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {u.name || "Unknown"}
              </span>
              {u.isTradingDashboardOnline ? <TradingDashboardOnlineDot /> : null}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate sm:hidden">{cid}</p>
          </div>
          <span className="hidden sm:block text-[10px] text-muted-foreground font-mono truncate max-w-[100px] md:max-w-[120px] shrink-0 text-right">
            {cid}
          </span>
          <Badge variant={kycBadgeVariant(u.kycStatus)} className="shrink-0 text-[9px] px-1.5 py-0 h-5 font-normal">
            {u.kycStatus.replace(/_/g, " ")}
          </Badge>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-[76px] text-right max-[380px]:hidden">
            {formatJoinedIstShort(u.createdAt)}
          </span>
          <ScanEye className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 opacity-70 group-hover:opacity-100" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 p-0 overflow-hidden" sideOffset={6}>
        <OnboardedProfilePanel u={u} />
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * Single admin-home surface: newest USER signups in one scannable block; hover/focus row for masked profile + deep link.
 */
export function LatestOnboardedInsightWidget({ users, loading, kycSummary }: WidgetProps) {
  return (
    <Card className="bg-card border-border shadow-sm overflow-hidden">
      <CardHeader className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2 space-y-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2 min-w-0">
            <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 shrink-0">
              <UserPlus className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg font-bold text-primary leading-tight">
                Onboarding pulse
              </CardTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                Latest USER signups · IST · hover or focus a row for profile
              </p>
            </div>
          </div>
          {!loading ? (
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal w-fit">
              {users.length} shown
            </Badge>
          ) : null}
        </div>

        {/* KYC funnel summary chips */}
        {kycSummary && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-0.5">
              KYC
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400">
              ✓ {kycSummary.approved.toLocaleString()} Approved
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-yellow-500/10 text-yellow-500">
              ● {kycSummary.pending.toLocaleString()} Pending
            </span>
            {kycSummary.rejected > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-400">
                ✕ {kycSummary.rejected.toLocaleString()} Rejected
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-2 sm:px-0">
        {loading ? (
          <div className="px-3 sm:px-5">
            <WidgetSkeleton />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8 px-4">No recent signups to show.</p>
        ) : (
          <div className="divide-y divide-border/60 max-h-[min(320px,50vh)] overflow-y-auto border-t border-border/50">
            {users.map((u) => (
              <OnboardedPulseRow key={u.id} u={u} />
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="px-3 sm:px-5 py-3 border-t border-border/50 bg-muted/20">
        <Button variant="ghost" size="sm" className="text-xs h-8 px-2 -ml-2 text-primary" asChild>
          <Link href={buildRouteWithQuery(getAdminConsoleRoute("users"), { role: "USER" })}>
            View all users
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
