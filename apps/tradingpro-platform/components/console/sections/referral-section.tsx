"use client"

/**
 * @file referral-section.tsx
 * @module components/console/sections
 * @description User referral hub: copy invite link, stats, referee list, bonus history.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-02
 */

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Copy, Gift, IndianRupee, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { ConsoleLoadingSkeleton } from "../console-loading-state"
import { ConsoleErrorState } from "../console-error-state"

type ProgramRulesPayload = {
  milestones: Array<{
    sortOrder: number
    minDepositTotal: string
    bonusReferrer: string | null
    bonusReferee: string | null
  }>
  publicRulesNotice: string | null
} | null

type ReferralPayload = {
  refCode: string | null
  inviteUrl: string | null
  refereeCount: number
  stats?: {
    lifetimePaidTotal: string
    pendingCount: number
    eligibleCount: number
    paidCount: number
  }
  referees: { clientIdMasked: string; joinedAt: string; attributedAt?: string }[]
  myRewards: {
    id: string
    amount: string
    status: string
    statusLabel?: string
    role: string
    createdAt: string
    paidAt?: string | null
    failureReason?: string | null
    milestoneKey?: string
  }[]
  programRules?: ProgramRulesPayload
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    case "ELIGIBLE":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300"
    case "PENDING":
      return "bg-muted text-muted-foreground"
    case "CANCELLED":
      return "bg-destructive/15 text-destructive"
    default:
      return "bg-muted text-foreground"
  }
}

export function ReferralSection() {
  const { toast } = useToast()
  const [data, setData] = useState<ReferralPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refereesPage, setRefereesPage] = useState(5)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/console/referral", { credentials: "include" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json.data as ReferralPayload)
      setRefereesPage(5)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyLink = () => {
    if (!data?.inviteUrl) return
    void navigator.clipboard.writeText(data.inviteUrl)
    toast({ title: "Link copied", description: "Share it with friends to invite them." })
  }

  if (loading) return <ConsoleLoadingSkeleton />
  if (error) return <ConsoleErrorState error={error} onRetry={() => void load()} />

  const stats = data?.stats
  const refereesShown = (data?.referees ?? []).slice(0, refereesPage)
  const hasMoreReferees = (data?.referees?.length ?? 0) > refereesPage

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 lg:space-y-8"
    >
      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="flex items-center gap-3 pt-6">
              <IndianRupee className="h-8 w-8 text-primary opacity-90" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lifetime paid</p>
                <p className="text-xl font-semibold tabular-nums">
                  ₹{Number(stats.lifetimePaidTotal || 0).toLocaleString("en-IN")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="h-8 w-8 text-primary opacity-90" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Referees</p>
                <p className="text-xl font-semibold tabular-nums">{data?.refereeCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending / Eligible</p>
              <p className="text-xl font-semibold tabular-nums">
                {stats.pendingCount} / {stats.eligibleCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid bonuses</p>
              <p className="text-xl font-semibold tabular-nums">{stats.paidCount}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Invite friends
          </CardTitle>
          <CardDescription>
            Your referral code is your Client ID. When referred users fund their account and meet program rules, bonuses may
            apply per admin-configured milestones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-mono">
              {data?.refCode ?? "—"}
            </code>
            <Button type="button" size="sm" variant="secondary" onClick={copyLink} disabled={!data?.inviteUrl}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
          </div>
          {data?.inviteUrl ? (
            <p className="break-all text-xs text-muted-foreground">{data.inviteUrl}</p>
          ) : null}
        </CardContent>
      </Card>

      {data?.programRules?.milestones?.length ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Active program milestones</CardTitle>
            <CardDescription>
              Thresholds shown when your admin has enabled public rules. Amounts appear only if the program allows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.programRules.publicRulesNotice ? (
              <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                {data.programRules.publicRulesNotice}
              </p>
            ) : null}
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {data.programRules.milestones.map((m, idx) => (
                <li key={`${m.sortOrder}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">From ₹{Number(m.minDepositTotal).toLocaleString("en-IN")} deposited (referee)</span>
                  <span className="text-xs text-muted-foreground">
                    {m.bonusReferrer != null || m.bonusReferee != null
                      ? `Referrer ₹${Number(m.bonusReferrer ?? 0).toLocaleString("en-IN")} · Referee ₹${Number(m.bonusReferee ?? 0).toLocaleString("en-IN")}`
                      : "Bonus amounts hidden"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Your invites ({data?.refereeCount ?? 0})
          </CardTitle>
          <CardDescription>Attributed signups (client IDs masked). Date is when the referral was linked.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {(refereesShown.length ? refereesShown : []).map((r) => (
              <li
                key={`${r.clientIdMasked}-${r.attributedAt ?? r.joinedAt}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{r.clientIdMasked}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.attributedAt ?? r.joinedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
            {!data?.referees?.length ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No referrals yet — share your link above.</li>
            ) : null}
          </ul>
          {hasMoreReferees ? (
            <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setRefereesPage((p) => p + 10)}>
              Load more
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Your referral bonuses</CardTitle>
          <CardDescription>Credits from the referral program. Paid rows include payout time when available.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {(data?.myRewards?.length ? data.myRewards : []).map((rw) => (
              <li key={rw.id} className="flex flex-col gap-1 px-3 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <span className="text-muted-foreground">
                    ₹{Number(rw.amount).toLocaleString("en-IN")} · {rw.role}
                    {rw.milestoneKey ? ` · ${rw.milestoneKey}` : ""}
                  </span>
                  {rw.paidAt ? (
                    <p className="text-xs text-muted-foreground">Paid {new Date(rw.paidAt).toLocaleString("en-IN")}</p>
                  ) : null}
                  {rw.failureReason ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{rw.failureReason}</p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(rw.status)}`}
                >
                  {rw.statusLabel ?? rw.status}
                </span>
              </li>
            ))}
            {!data?.myRewards?.length ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No bonuses recorded yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  )
}
