/**
 * @file referrals-management.tsx
 * @module components/admin-console
 * @description Admin referrals shell: Program setup vs Activity (relationships & ledger).
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-03 — Split panels, simplified IA per UX plan.
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Loader2, RefreshCw, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import {
  ReferralsProgramPanel,
  type ReferralAdminSummaryPayload,
} from "@/components/admin-console/referrals/referrals-program-panel"
import { ReferralsActivityPanel } from "@/components/admin-console/referrals/referrals-activity-panel"

export function ReferralsManagement() {
  const { toast } = useToast()
  const { permissions } = useAdminSession()
  const canManage = permissions.includes("admin.all") || permissions.includes("admin.referrals.manage")

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<ReferralAdminSummaryPayload | null>(null)
  const [program, setProgram] = useState<any>(null)

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/admin/referrals/summary", { credentials: "include" })
    if (!res.ok) throw new Error("summary")
    const j = await res.json()
    setSummary(j.data)
  }, [])

  const loadProgram = useCallback(async () => {
    const res = await fetch("/api/admin/referrals/program", { credentials: "include" })
    if (!res.ok) throw new Error("program")
    const j = await res.json()
    setProgram(j.data)
  }, [])

  const refreshProgramData = useCallback(async () => {
    await Promise.all([loadSummary(), loadProgram()])
  }, [loadSummary, loadProgram])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadSummary(), loadProgram()])
    } catch {
      toast({ title: "Error", description: "Could not load referral admin data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [loadSummary, loadProgram, toast])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  if (loading && !program) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        Loading referrals…
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
            <p className="text-sm text-muted-foreground">
              Set up bonus rules in <strong>Program</strong>, then review people and payouts in <strong>Activity</strong>.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshAll()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="program" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="program">Program setup</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="program" className="mt-4">
          <ReferralsProgramPanel
            canManage={canManage}
            summary={summary}
            program={program}
            onProgramDataChanged={refreshProgramData}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ReferralsActivityPanel canManage={canManage} onLedgerMutated={() => void loadSummary()} />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
