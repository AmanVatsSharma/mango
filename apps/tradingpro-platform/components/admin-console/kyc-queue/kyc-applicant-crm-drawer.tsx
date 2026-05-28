/**
 * @file kyc-applicant-crm-drawer.tsx
 * @module admin-console/kyc-queue
 * @description Broker CRM context: Profile (notes/tasks), Compliance, Activity timeline — telecaller-first layout.
 * @author StockTrade
 * @created 2026-04-07
 * @updated 2026-04-07
 */

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { UserRound, Building2, History, FileSearch } from "lucide-react"
import { StatusBadge } from "@/components/admin-console/shared"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"
import { getSlaState } from "@/lib/admin/kyc-utils"
import { cn } from "@/lib/utils"
import {
  formatDateTime,
  lifecycleSegmentBadgeClassName,
  lifecycleSegmentDescription,
  lifecycleSegmentShortLabel,
  type KycApplication,
} from "./kyc-types"
import { KycCrmHelpPopover } from "./crm-drawer/kyc-crm-help-popover"
import { KycCrmNotesPanel } from "./crm-drawer/kyc-crm-notes-panel"
import { KycCrmTasksPanel } from "./crm-drawer/kyc-crm-tasks-panel"

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—"
  const [u, d] = email.split("@")
  if (!d) return "—"
  const head = u.slice(0, 2)
  return `${head}•••@${d}`
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—"
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 4) return "••••"
  return `••••${digits.slice(-4)}`
}

type UserManagementSnippet = {
  id: string
  emailVerified?: string | Date | null
  phoneVerified?: string | Date | null
  managedBy?: { id: string; name: string | null; email: string | null } | null
  referredBy?: { id: string; clientId: string | null; name: string | null } | null
}

type TimelineEvent = {
  id: string
  source: string
  at: string
  title: string
  detail: string | null
}

export type KycApplicantCrmDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: KycApplication | null
  onOpenFullReview: () => void
  /** Refresh KYC queue when CRM tasks/notes change (optional hints/radar). */
  onCrmDataChanged?: () => void
}

export function KycApplicantCrmDrawer({
  open,
  onOpenChange,
  item,
  onOpenFullReview,
  onCrmDataChanged,
}: KycApplicantCrmDrawerProps) {
  const [userExtra, setUserExtra] = useState<UserManagementSnippet | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loadingUser, setLoadingUser] = useState(false)
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  const userId = item?.user?.id

  useEffect(() => {
    if (!open || !userId) {
      setUserExtra(null)
      setTimeline([])
      return
    }
    let cancelled = false
    setLoadingUser(true)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.success && data.user) {
          const u = data.user as Record<string, unknown>
          setUserExtra({
            id: String(u.id),
            emailVerified: u.emailVerified as string | Date | null,
            phoneVerified: u.phoneVerified as string | Date | null,
            managedBy: (u.managedBy as UserManagementSnippet["managedBy"]) ?? null,
            referredBy: (u.referredBy as UserManagementSnippet["referredBy"]) ?? null,
          })
        } else if (!cancelled) {
          setUserExtra(null)
        }
      } finally {
        if (!cancelled) setLoadingUser(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    if (!open || !userId) {
      setTimeline([])
      return
    }
    let cancelled = false
    setLoadingTimeline(true)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/onboarding-timeline?limit=80`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.events)) {
          setTimeline(data.events as TimelineEvent[])
        } else if (!cancelled) {
          setTimeline([])
        }
      } finally {
        if (!cancelled) setLoadingTimeline(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  if (!item) {
    return null
  }

  const slaState = getSlaState(item.slaDueAt, item.status)
  const emailOk = Boolean(userExtra?.emailVerified)
  const phoneOk = Boolean(userExtra?.phoneVerified)
  const hint = item.user.crmTaskHint
  const nextLine = hint?.nextDueAt
    ? `Next callback ${formatDateTime(hint.nextDueAt)}${hint.overdueCount > 0 ? ` · ${hint.overdueCount} overdue` : ""}`
    : hint && hint.openCount > 0
      ? `${hint.openCount} open task(s)`
      : null

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:max-h-[96vh] data-[vaul-drawer-direction=right]:sm:max-w-xl data-[vaul-drawer-direction=right]:md:max-w-2xl data-[vaul-drawer-direction=right]:lg:max-w-[44rem]">
        <DrawerHeader className="border-b border-border pb-3 text-left space-y-1">
          <div className="flex items-start justify-between gap-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              Client CRM
            </DrawerTitle>
            <KycCrmHelpPopover />
          </div>
          <DrawerDescription className="text-xs">
            Profile, callbacks, and notes. Compliance actions stay in review. Times in activity list use IST.
          </DrawerDescription>
          {nextLine ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium pt-1">{nextLine}</p>
          ) : null}
          {slaState === "OVERDUE" && item.status === "PENDING" ? (
            <p className="text-[10px] text-destructive">KYC SLA overdue — prioritize compliance review.</p>
          ) : null}
        </DrawerHeader>

        <Tabs defaultValue="profile" className="flex flex-col flex-1 min-h-0 px-4">
          <TabsList className="grid w-full grid-cols-3 h-9 shrink-0">
            <TabsTrigger value="profile" className="text-xs gap-1">
              <UserRound className="h-3 w-3" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs gap-1">
              <FileSearch className="h-3 w-3" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs gap-1">
              <History className="h-3 w-3" />
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-[200px] max-h-[calc(96vh-220px)] mt-3 overflow-y-auto pr-1">
            <TabsContent value="profile" className="mt-0 space-y-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Client ID</p>
                  <p className="font-mono text-sm font-medium">{item.user.clientId || item.user.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Pipeline</p>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] font-medium", lifecycleSegmentBadgeClassName(item.user.lifecycleSegment))}
                  >
                    {lifecycleSegmentShortLabel(item.user.lifecycleSegment)}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {lifecycleSegmentDescription(item.user.lifecycleSegment)}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Name</p>
                <p className="text-sm">{item.user.name || "—"}</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Contact (masked)</p>
                <p className="text-xs text-muted-foreground">{maskEmail(item.user.email)}</p>
                <p className="text-xs text-muted-foreground">{maskPhone(item.user.phone)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={emailOk ? "secondary" : "outline"} className="text-[10px]">
                  Email {emailOk ? "verified" : "pending"}
                </Badge>
                <Badge variant={phoneOk ? "secondary" : "outline"} className="text-[10px]">
                  Phone {phoneOk ? "verified" : "pending"}
                </Badge>
              </div>
              {loadingUser ? <p className="text-xs text-muted-foreground">Loading relationship…</p> : null}
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Relationship manager</p>
                  {userExtra?.managedBy ? (
                    <p>{userExtra.managedBy.name || userExtra.managedBy.email || userExtra.managedBy.id}</p>
                  ) : (
                    <p className="text-xs text-amber-600">Unassigned — assign in User Management or KYC review.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Referrer</p>
                  {userExtra?.referredBy ? (
                    <Link
                      href={buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: userExtra.referredBy.id })}
                      className="text-primary hover:underline font-mono"
                    >
                      {userExtra.referredBy.clientId || userExtra.referredBy.id.slice(0, 8)}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">No referrer on file</p>
                  )}
                </div>
              </div>
              <Separator />
              {userId ? (
                <KycCrmTasksPanel userId={userId} active={open} onTasksChanged={onCrmDataChanged} />
              ) : null}
              {userId ? (
                <KycCrmNotesPanel userId={userId} active={open} onNotesChanged={onCrmDataChanged} />
              ) : null}
            </TabsContent>

            <TabsContent value="compliance" className="mt-0 space-y-3 pb-4">
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={item.status} type="kyc" />
                {slaState === "OVERDUE" ? (
                  <Badge variant="destructive" className="text-[10px]">
                    SLA overdue
                  </Badge>
                ) : null}
                {slaState === "DUE_SOON" ? (
                  <Badge className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/30">SLA due soon</Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block">SLA due</span>
                  <span>{formatDateTime(item.slaDueAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Submitted</span>
                  <span>{formatDateTime(item.submittedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={item.amlStatus} type="risk" />
                <StatusBadge status={item.suspiciousStatus} type="risk" />
              </div>
              <p className="text-[10px] text-muted-foreground">
                KYC queue assignee: {item.assignedTo?.name || item.assignedTo?.email || "Unassigned"}
              </p>
            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-2 pb-4">
              {loadingTimeline ? <p className="text-xs text-muted-foreground">Loading timeline…</p> : null}
              {!loadingTimeline && timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground">No onboarding events yet.</p>
              ) : null}
              <ul className="space-y-2">
                {timeline.map((e) => (
                  <li key={e.id} className="border-b border-border/60 pb-2 last:border-0 text-xs">
                    <div className="flex justify-between gap-2">
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        {e.source}
                      </Badge>
                      <span className="text-muted-foreground shrink-0">{formatDateTime(e.at)}</span>
                    </div>
                    <p className="font-medium mt-1">{e.title}</p>
                    {e.detail ? <p className="text-muted-foreground mt-0.5">{e.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </TabsContent>
          </div>
        </Tabs>

        <DrawerFooter className="border-t border-border pt-3 gap-2">
          <Button className="w-full" size="sm" onClick={onOpenFullReview}>
            Open full compliance review
          </Button>
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href={buildRouteWithQuery(getAdminConsoleRoute("users"), { userId: item.user.id })}>
              Open in User Management
            </Link>
          </Button>
          <DrawerClose asChild>
            <Button variant="ghost" size="sm" className="w-full">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
