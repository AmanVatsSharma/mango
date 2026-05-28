/**
 * File:        components/Account.tsx
 * Module:      Account — Dashboard Account Workspace
 * Purpose:     User profile, account type switcher, funds overview, RM contact,
 *              and statement viewer for the dashboard account tab.
 *
 * Exports:
 *   - Account — main account workspace component
 *
 * Depends on:
 *   - @/components/ui/card          — Card, CardContent
 *   - @/components/ui/button        — Button
 *   - @/components/ui/dialog        — Dialog, DialogContent, etc.
 *   - @/components/ui/drawer       — Drawer, DrawerContent, etc.
 *   - @/components/ui/label        — Label
 *   - @/components/ui/input         — Input
 *   - @/components/ui/theme-tab-selector — ThemeTabSelector
 *   - @/components/account/account-switcher — AccountSwitcher
 *   - @/lib/hooks/use-trading-data  — useTransactions
 *   - @/lib/hooks/use-console-features — useConsoleFeatures
 *   - @/lib/branding-routes        — getAppRoute, buildRouteWithQuery
 *   - @/lib/logging/client-logger   — createClientLogger
 *   - @/lib/types/rm-client-display — ClientRmApiResponse
 *
 * Side-effects:
 *   - Fetches /api/console/user-rm on mount
 *   - Fetches /api/console/request-rm on RM request
 *   - Writes to localStorage for active account ID
 *   - CSV export via Blob + download link
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  LogOut,
  DollarSign,
  Briefcase,
  Copy,
  Check,
  LifeBuoy,
  ArrowRight,
  ArrowDownToLine,
  Mail,
  Users,
  UserPlus,
  RefreshCw,
  Phone,
  MessageCircle,
} from "lucide-react"
import { signOut } from "next-auth/react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ThemeTabSelector } from "@/components/ui/theme-tab-selector"
import { toast } from "@/hooks/use-toast"
import { useTransactions } from "@/lib/hooks/use-trading-data"
import { useConsoleFeatures } from "@/lib/hooks/use-console-features"
import Image from "next/image"
import { normalizeAccountStatementAmount } from "@/components/account-number-utils"
import { buildRouteWithQuery, getAppRoute } from "@/lib/branding-routes"
import { AccountSwitcher } from "@/components/account/account-switcher"
import type { ClientRmApiResponse } from "@/lib/types/rm-client-display"
import { createClientLogger } from "@/lib/logging/client-logger"

const navLog = createClientLogger("MOBILE-NAV:Account")

function snapshotNavState(extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return extra
  return {
    ...extra,
    bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
    htmlPointerEvents: getComputedStyle(document.documentElement).pointerEvents,
    viewportWidth: window.innerWidth,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }
}

interface AccountProps {
  portfolio: any
  user: any
  onUpdate: () => void
}

// ─── StatCard ────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode
  title: string
  value: string
  accent: "emerald" | "sky" | "orange"
}

function StatCard({ icon, title, value, accent }: StatCardProps) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/40 bg-white/80 backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-md hover:bg-white dark:bg-white/[0.03] dark:border-white/[0.06] dark:hover:bg-white/[0.05]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent"
        aria-hidden
      />
      <div className="relative flex items-center gap-4 p-4">
        <div
          className={`flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset ${colors[accent]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {title}
          </p>
          <p className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────
// Defined at module scope to preserve component identity across re-renders.
// Defining it inside Account() creates a new component on every render,
// which resets local state (toggling a switch would flash back to default).
function ToggleRow({ label }: { label: string }) {
  const [enabled, setEnabled] = useState(true)
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-white/60 px-3 py-2.5 transition-colors hover:bg-white/80 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <button
        onClick={() => {
          setEnabled((prev) => {
            const next = !prev
            toast({ title: label, description: `Turned ${next ? "on" : "off"}.` })
            return next
          })
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 ${
          enabled ? "bg-primary shadow-sm" : "bg-muted-foreground/20"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300 ${
            enabled ? "translate-x-6" : "translate-x-1.5"
          }`}
        />
      </button>
    </div>
  )
}

// ─── Account ─────────────────────────────────────────────────────────────────
export function Account({ portfolio, user, onUpdate }: AccountProps) {
  const router = useRouter()
  const formatCurrency = (amount: number) =>
    `₹${(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  const [copied, setCopied] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [rmData, setRmData] = useState<ClientRmApiResponse | null>(null)
  const [rmLoading, setRmLoading] = useState(true)
  const [requestingRM, setRequestingRM] = useState(false)
  const [statementDetail, setStatementDetail] = useState<any | null>(null)
  const [statementCopied, setStatementCopied] = useState<"id" | "description" | null>(null)

  const account = portfolio?.account
  const { statementsEnabled, source: statementsSource } = useConsoleFeatures()
  const { transactions, isLoading: txLoading } = useTransactions(
    statementsEnabled ? account?.id : undefined
  )

  // Fetch RM data
  useEffect(() => {
    const fetchRM = async () => {
      setRmLoading(true)
      try {
        const response = await fetch("/api/console/user-rm")
        if (response.ok) {
          const data = (await response.json()) as ClientRmApiResponse
          setRmData(data)
        } else {
          setRmData({ showCard: true, hasRM: false })
        }
      } catch {
        setRmData({ showCard: true, hasRM: false })
      } finally {
        setRmLoading(false)
      }
    }
    fetchRM()
  }, [])

  const handleRequestRM = async () => {
    setRequestingRM(true)
    try {
      const response = await fetch("/api/console/request-rm", {
        method: "POST",
      })
      const data = await response.json()
      if (response.ok) {
        toast({
          title: "Request Submitted",
          description: data.message || "Your request has been submitted successfully.",
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to submit request",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request",
        variant: "destructive",
      })
    } finally {
      setRequestingRM(false)
    }
  }

  // CSV Export
  const exportCSV = () => {
    if (!statementsEnabled) {
      toast({
        title: "Statements disabled",
        description: "Statements are currently disabled for your account.",
        variant: "destructive",
      })
      return
    }
    if (!transactions?.length) return
    const header = "Date,Time (IST),Type,Amount,Description\n"
    const rows = transactions.map((t: any) => {
      const date = new Date(t.createdAt)
      const dateStr = date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
      const timeStr = date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
      return `${dateStr},${timeStr},${t.type},${t.amount},"${t.description || ""}"`
    }).join("\n")
    const csv = header + rows
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "statement.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyStatementField = async (
    label: string,
    text: string,
    field: "id" | "description"
  ) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatementCopied(field)
      setTimeout(() => setStatementCopied(null), 2000)
      toast({ title: "Copied", description: `${label} copied to clipboard.` })
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" })
    }
  }

  const logConsoleCtaClick = () => {
    navLog.info("Open Trading Console clicked", snapshotNavState({ target: getAppRoute("consoleRoot") }))
  }

  const logDepositClick = () => {
    navLog.info("Deposit funds clicked", snapshotNavState({
      target: buildRouteWithQuery(getAppRoute("consoleRoot"), { section: "deposits" }),
    }))
  }

  const clientId = portfolio?.account?.client_id as string | undefined
  const accountId = portfolio?.account?.id as string | undefined
  const userName = user?.name || "Trader"
  const userEmail = user?.email || ""
  const userImage = user?.image as string | undefined

  const initials = (userName || "")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const copyClientId = async () => {
    if (!clientId) return
    try {
      await navigator.clipboard.writeText(clientId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <div className="space-y-5 pb-20 lg:pb-8">
      {/* ── Main Account Card ─────────────────────────────────────── */}
      <Card className="overflow-hidden rounded-2xl shadow-xl border-0">
        {/* Colored accent header strip */}
        <div className="relative overflow-hidden">
          {/* Ambient gradient bg */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-violet-600"
            aria-hidden
          />
          {/* Subtle noise/texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
            aria-hidden
          />
          {/* Bottom fade to slate */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-slate-900/30"
            aria-hidden
          />

          {/* Header content */}
          <div className="relative flex items-start justify-between gap-4 p-5 sm:p-6">
            {/* Left: Avatar + identity */}
            <div className="flex items-center gap-4">
              {userImage ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl ring-2 ring-white/25 shadow-lg">
                  <Image
                    src={userImage}
                    alt={userName}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold text-white ring-2 ring-white/20 shadow-lg">
                  {initials}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    {userName}
                  </h2>
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:text-white"
                  >
                    View Profile
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-0.5 truncate text-sm text-white/60">{userEmail}</p>

                {/* Client ID - Prominent hero badge */}
                {clientId && (
                  <div className="mt-3 group relative">
                    <div className="relative flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 backdrop-blur-sm shadow-lg">
                      {/* Glow effect */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {/* Icon */}
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                        <svg className="h-4 w-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.417.592 6.721 6.721 0 01-3.417-.592 6.721 6.721 0 016.717-6.717 6.721 6.721 0 013.417.592z" />
                        </svg>
                      </div>
                      {/* Text */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                          Client ID
                        </span>
                        <span className="font-mono text-sm font-bold text-white tracking-wide">
                          {clientId}
                        </span>
                      </div>
                      {/* Copy button */}
                      <button
                        onClick={copyClientId}
                        className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/50 transition-all duration-200 hover:bg-white/20 hover:text-white"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: AccountSwitcher + Quick actions */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              <AccountSwitcher />
              <div className="flex items-center gap-2">
                <a
                  aria-label="Support"
                  href="mailto:support@tradingpro.app"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/70 backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:text-white"
                >
                  <LifeBuoy className="h-4 w-4" />
                </a>
                <Button
                  onClick={() => signOut()}
                  variant="ghost"
                  className="h-10 shrink-0 gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:text-white dark:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Log Out</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main card body */}
        <div className="p-4 sm:p-6 space-y-5">
          {/* Appearance + Console CTA row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="rounded-2xl border border-border/50 bg-white/70 p-4 backdrop-blur-md shadow-sm dark:bg-white/[0.03] dark:border-white/[0.06]">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
                <p className="text-xs text-muted-foreground">
                  Light, Dark, or follow your system.
                </p>
              </div>
              <div className="mt-3">
                <ThemeTabSelector />
              </div>
            </div>

            <Button
              onClick={() => {
                logConsoleCtaClick()
                window.location.href = getAppRoute("consoleRoot")
              }}
              className="group relative w-full overflow-hidden rounded-xl bg-indigo-600 py-3.5 text-white shadow-lg ring-1 ring-white/10 transition-all duration-300 hover:bg-indigo-500 hover:shadow-xl hover:scale-[1.01] hover:ring-white/20 sm:w-auto sm:px-6"
              aria-label="Open Trading Console"
            >
              <span className="inline-flex items-center gap-2 font-semibold tracking-wide">
                Open Trading Console
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </Button>
          </div>

          {/* Add Funds */}
          <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-emerald-50/80 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md hover:bg-emerald-50/95 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30">
            {/* Ambient gradient */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-500/[0.06] via-teal-500/[0.04] to-transparent"
              aria-hidden
            />
            <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  Add funds
                </h3>
                <p className="mt-0.5 text-xs text-emerald-700/70 dark:text-emerald-300/60">
                  UPI, QR, or bank transfer — opens the Deposits workspace.
                </p>
              </div>
              <Button
                onClick={() => {
                  logDepositClick()
                  window.location.href = buildRouteWithQuery(getAppRoute("consoleRoot"), {
                    section: "deposits",
                  })
                }}
                className="group/btn relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-white shadow-md ring-1 ring-white/10 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg sm:w-auto"
                aria-label="Open deposits in Trading Console"
              >
                <span className="inline-flex items-center gap-2 font-semibold tracking-wide">
                  <ArrowDownToLine className="h-4 w-4" />
                  Deposit funds
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                </span>
              </Button>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={<DollarSign size={22} />}
              title="Total Balance"
              value={formatCurrency(account?.balance)}
              accent="emerald"
            />
            <StatCard
              icon={<Briefcase size={22} />}
              title="Available Margin"
              value={formatCurrency(account?.availableMargin)}
              accent="sky"
            />
            <StatCard
              icon={
                <svg
                  className="h-5.5 w-5.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Used Margin"
              value={formatCurrency(account?.usedMargin)}
              accent="orange"
            />
          </div>

          {/* Relationship Manager */}
          <div>
            {rmLoading ? (
              <div
                className="h-24 animate-pulse rounded-2xl border border-border/50 bg-white/50 backdrop-blur-sm dark:bg-white/[0.03]"
                aria-hidden
              />
            ) : !rmData?.showCard ? null : rmData.hasRM && rmData.rm ? (
              <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-white/80 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-md transition-all duration-300 hover:shadow-md dark:bg-white/[0.03] dark:ring-white/[0.05]">
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent"
                  aria-hidden
                />
                <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
                  {/* RM Avatar */}
                  <div className="relative mx-auto shrink-0 sm:mx-0">
                    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-2 ring-background shadow-inner">
                      {rmData.rm.imageUrl ? (
                        <Image
                          src={rmData.rm.imageUrl}
                          alt={rmData.rm.displayName || "RM"}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <span className="text-sm font-semibold tracking-tight text-muted-foreground">
                          {(rmData.rm.displayName || "RM")
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Online indicator */}
                    <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-400" />
                  </div>

                  {/* RM Info */}
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Relationship Manager
                    </p>
                    <p className="mt-0.5 truncate text-base font-semibold text-foreground">
                      {rmData.rm.displayName || "—"}
                    </p>
                    {rmData.rm.email && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {rmData.rm.email}
                      </p>
                    )}
                  </div>

                  {/* RM Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                    {rmData.rm.phone && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 rounded-xl border-border/70 text-xs font-medium backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
                        onClick={() => window.open(`tel:${rmData.rm!.phone}`)}
                      >
                        <Phone className="h-3.5 w-3.5 opacity-70" />
                        Call
                      </Button>
                    )}
                    {rmData.rm.whatsappPhone && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 rounded-xl border-emerald-500/30 text-xs font-medium text-emerald-700 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-500/10 dark:text-emerald-400"
                        onClick={() =>
                          window.open(
                            `https://wa.me/${rmData.rm!.whatsappPhone!.replace(/[^0-9]/g, "")}`
                          )
                        }
                      >
                        <MessageCircle className="h-3.5 w-3.5 opacity-70" />
                        WhatsApp
                      </Button>
                    )}
                    {rmData.rm.email && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 rounded-xl border-border/70 text-xs font-medium backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
                        onClick={() => window.open(`mailto:${rmData.rm!.email}`)}
                      >
                        <Mail className="h-3.5 w-3.5 opacity-70" />
                        Email
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="group relative overflow-hidden rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-center backdrop-blur-sm transition-all duration-300 hover:border-border dark:bg-white/[0.02]">
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent"
                  aria-hidden
                />
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/50">
                    <Users
                      className="h-6 w-6 text-muted-foreground/50"
                      strokeWidth={1.25}
                    />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    No relationship manager yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Request a dedicated contact from your firm.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-4 h-9 gap-1.5 rounded-xl text-xs font-medium transition-all duration-200 hover:scale-[1.02]"
                    onClick={handleRequestRM}
                    disabled={requestingRM}
                  >
                    {requestingRM ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Request manager
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Profile Drawer ────────────────────────────────────────── */}
      <Drawer
        open={profileOpen}
        onOpenChange={(open) => {
          setProfileOpen(open)
          if (!open)
            setTimeout(() => document.body.style.removeProperty("pointer-events"), 350)
        }}
      >
        <DrawerContent className="h-[85vh] flex flex-col bg-white dark:bg-slate-900 dark:text-slate-100">
          <DrawerHeader className="border-b px-4 py-5 sm:px-6">
            <DrawerTitle>My Profile</DrawerTitle>
            <DrawerDescription>
              Manage your personal information and trading preferences
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 space-y-8 overflow-y-auto p-4 sm:p-6">
            {/* Personal Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                Personal
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Name</Label>
                  <Input value={userName} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                  <Input value={userEmail} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Client Code</Label>
                  <Input value={clientId || ""} disabled />
                </div>
              </div>
            </div>

            {/* Nominee */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                  Nominee
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({ title: "Nominee", description: "Nominee details editor coming soon." })
                  }
                >
                  Add / Edit
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Add a nominee for seamless asset transfer.
              </p>
            </div>

            {/* Bank Accounts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Bank</h3>
                <Button size="sm" onClick={() => toast({ title: "Bank Linking", description: "Secure bank linking flow coming soon." })}>
                  Link Bank
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">No bank linked yet.</p>
            </div>

            {/* Brokerage Plan */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                  Brokerage Plan
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({ title: "Brokerage Plan", description: "Plan selection coming soon." })
                  }
                >
                  Change
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Current: Standard (₹20/order). Contact support for premium plans.
              </p>
            </div>

            {/* Segments & MTF */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                Segments &amp; MTF
              </h3>
              <div className="space-y-2">
                <ToggleRow label="Equity Delivery / Intraday" />
                <ToggleRow label="NSE Futures" />
                <ToggleRow label="NSE Options" />
                <ToggleRow label="MCX Commodities" />
                <ToggleRow label="MTF (Margin Trading Facility)" />
              </div>
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs text-amber-800 backdrop-blur-sm dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
                PayLater activation: Inactive. Can be activated by support team.
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border/50 text-xs text-gray-500 dark:text-slate-400">
              Need help?{" "}
              <a
                className="text-primary hover:underline"
                href="mailto:support@tradingpro.app"
              >
                Contact Support
              </a>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Statement Section (feature-flagged) ────────────────────── */}
      {statementsEnabled && (
        <Card className="overflow-hidden rounded-2xl shadow-xl border-0">
          <div className="relative overflow-hidden">
            <div
              className="absolute inset-0 bg-gradient-to-br from-slate-100/80 to-slate-50/40 dark:from-slate-800/40 dark:to-slate-900/20"
              aria-hidden
            />
            <div className="relative p-4 sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">Statement</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recent debits and credits with IST timestamps.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportCSV}
                  className="gap-1.5 rounded-xl border-border/60 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </Button>
              </div>

              <div className="rounded-2xl border border-border/50 bg-white/70 shadow-sm backdrop-blur-md dark:bg-white/[0.03] dark:border-white/[0.06]">
                {txLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading statement entries…
                    </div>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No statement entries available yet.
                  </div>
                ) : (
                  <>
                    {/* Mobile list */}
                    <div className="space-y-3 p-3 sm:hidden">
                      {transactions.map((t: any) => (
                        <div
                          key={t.id}
                          className="rounded-xl border border-border/50 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white dark:bg-white/[0.03]"
                        >
                          <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              {new Date(t.createdAt).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Kolkata",
                              })}
                            </span>
                            <span
                              className={`shrink-0 rounded-lg px-2 py-0.5 font-semibold ${
                                t.type === "CREDIT"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              }`}
                            >
                              {t.type}
                            </span>
                          </div>
                          <p
                            className={`mt-2 font-mono text-lg font-semibold tabular-nums ${
                              t.type === "CREDIT"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-700 dark:text-red-400"
                            }`}
                          >
                            {formatCurrency(normalizeAccountStatementAmount(t.amount))}
                          </p>
                          <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed text-foreground">
                            {t.description || "—"}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-8 px-2 text-xs"
                            onClick={() => setStatementDetail(t)}
                          >
                            Details
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden w-full overflow-auto sm:block lg:max-h-[360px]">
                      <table className="table-fixed min-w-[720px] w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                          <tr>
                            <th className="w-[100px] px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-200">
                              Date
                            </th>
                            <th className="w-[72px] px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-200">
                              Time
                            </th>
                            <th className="w-[88px] px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-200">
                              Type
                            </th>
                            <th className="w-[120px] px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-200">
                              Amount
                            </th>
                            <th className="min-w-0 px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-200">
                              Description
                            </th>
                            <th className="w-[80px] px-4 py-3 text-right" />
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((t: any) => (
                            <tr
                              key={t.id}
                              className="border-b border-border/40 transition-colors hover:bg-muted/30 dark:border-white/[0.04]"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-foreground">
                                {new Date(t.createdAt).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  timeZone: "Asia/Kolkata",
                                })}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-foreground">
                                {new Date(t.createdAt).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Kolkata",
                                })}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                                    t.type === "CREDIT"
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                  }`}
                                >
                                  {t.type}
                                </span>
                              </td>
                              <td
                                className={`whitespace-nowrap px-4 py-3 text-right font-mono ${
                                  t.type === "CREDIT"
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-red-700 dark:text-red-400"
                                }`}
                              >
                                {formatCurrency(normalizeAccountStatementAmount(t.amount))}
                              </td>
                              <td className="min-w-0 px-4 py-3 text-gray-600 dark:text-slate-300">
                                <p className="whitespace-normal break-words leading-relaxed">
                                  {t.description || "—"}
                                </p>
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                                  ID: {t.id}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => setStatementDetail(t)}
                                >
                                  Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Statement Detail Dialog */}
          <Dialog
            open={!!statementDetail}
            onOpenChange={(open) => !open && setStatementDetail(null)}
          >
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Statement entry</DialogTitle>
                <DialogDescription className="text-sm">
                  Full description and ID for your records.
                </DialogDescription>
              </DialogHeader>
              {statementDetail && (
                <div className="space-y-4 pt-1">
                  {/* When */}
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                      When (IST)
                    </p>
                    <p className="font-medium text-foreground">
                      {new Date(statementDetail.createdAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                      Amount
                    </p>
                    <p
                      className={`text-lg font-semibold font-mono tabular-nums ${
                        statementDetail.type === "CREDIT"
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatCurrency(normalizeAccountStatementAmount(statementDetail.amount))}
                    </p>
                    <span
                      className={`mt-2 inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${
                        statementDetail.type === "CREDIT"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {statementDetail.type}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Description
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() =>
                          copyStatementField(
                            "Description",
                            statementDetail.description || "",
                            "description"
                          )
                        }
                      >
                        {statementCopied === "description" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {statementDetail.description || "—"}
                    </p>
                  </div>

                  {/* ID */}
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        ID
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() =>
                          copyStatementField("ID", String(statementDetail.id), "id")
                        }
                      >
                        {statementCopied === "id" ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy
                      </Button>
                    </div>
                    <code className="block break-all rounded-lg border border-border/50 bg-background/50 p-2 text-xs font-mono">
                      {statementDetail.id}
                    </code>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </Card>
      )}
    </div>
  )
}