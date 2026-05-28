"use client"

/**
 * @file referral-settings-section.tsx
 * @module components/console/sections
 * @description Referral-related user preferences and read-only program rules in the console.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-02
 */

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BookOpen, Settings2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

export function ReferralSettingsSection() {
  const { toast } = useToast()
  const [marketingOptIn, setMarketingOptIn] = useState(true)
  const [programRules, setProgramRules] = useState<ProgramRulesPayload>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/console/referral/settings", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const json = await res.json()
      const mo = json?.data?.marketingOptIn
      if (typeof mo === "boolean") setMarketingOptIn(mo)
      if (json?.data?.programRules !== undefined) setProgramRules(json.data.programRules)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (next: boolean) => {
    setSaving(true)
    try {
      const res = await fetch("/api/console/referral/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ marketingOptIn: next }),
      })
      if (!res.ok) throw new Error("Save failed")
      setMarketingOptIn(next)
      toast({ title: "Saved", description: "Referral preferences updated." })
    } catch {
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" })
      void load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <ConsoleLoadingSkeleton />
  if (error) return <ConsoleErrorState error={error} onRetry={() => void load()} />

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {programRules?.milestones?.length ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Program rules
            </CardTitle>
            <CardDescription>
              Current milestone thresholds from your broker (read-only). Bonus amounts may be hidden by policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {programRules.publicRulesNotice ? (
              <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                {programRules.publicRulesNotice}
              </p>
            ) : null}
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {programRules.milestones.map((m, idx) => (
                <li key={`${m.sortOrder}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">≥ ₹{Number(m.minDepositTotal).toLocaleString("en-IN")} referee deposits</span>
                  <span className="text-xs text-muted-foreground">
                    {m.bonusReferrer != null || m.bonusReferee != null
                      ? `Referrer ₹${Number(m.bonusReferrer ?? 0).toLocaleString("en-IN")} · Referee ₹${Number(m.bonusReferee ?? 0).toLocaleString("en-IN")}`
                      : "Amounts not shown"}
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
            <Settings2 className="h-5 w-5 text-primary" />
            Referral settings
          </CardTitle>
          <CardDescription>Control how we communicate about your referral activity.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/40 p-4">
          <div className="space-y-1">
            <Label htmlFor="ref-marketing" className="text-base font-medium">
              Product updates & referral tips
            </Label>
            <p className="text-sm text-muted-foreground">
              Optional emails or messages about your program and milestones (when we add channels).
            </p>
          </div>
          <Switch
            id="ref-marketing"
            checked={marketingOptIn}
            disabled={saving}
            onCheckedChange={(v) => void persist(v)}
          />
        </CardContent>
      </Card>
    </motion.div>
  )
}
