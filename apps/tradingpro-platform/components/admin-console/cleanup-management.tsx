"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Calendar, Eraser, ShieldAlert, Eraser as CleanupIcon } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton } from "./shared"

interface PreviewCounts {
  oldOrders: number
  oldClosedPositions: number
  earliest: string | null
  latest: string | null
}

interface CleanupAutomationSummary {
  source?: string
  lastRunAtIso?: string
  runDateIst?: string
  retentionDays?: number
  dailyRunHourIst?: number
  cutoffIso?: string
  deletedOrders?: number
  deletedPositions?: number
}

export function CleanupManagement() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<PreviewCounts | null>(null)
  const [executing, setExecuting] = useState(false)
  const [fromDate, setFromDate] = useState<string>("")
  const [dryRunRows, setDryRunRows] = useState<any[]>([])
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false)
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState("0")
  const [cleanupRunHourIst, setCleanupRunHourIst] = useState("6")
  const [automationSaving, setAutomationSaving] = useState(false)
  const [automationSummary, setAutomationSummary] = useState<CleanupAutomationSummary | null>(null)

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (fromDate) p.set("before", fromDate)
    return p
  }, [fromDate])

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cleanup/preview?${query.toString()}`, {
        credentials: "include"
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setCounts(data.counts)
      setDryRunRows(data.samples || [])
    } catch (e: any) {
      console.error("❌ [CLEANUP] Preview failed", e)
      setError(e.message || "Failed to load preview")
    } finally {
      setLoading(false)
    }
  }, [query])

  const loadAutomationSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cleanup/automation", {
        credentials: "include"
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json().catch(() => ({}))
      const automation = data?.automation ?? {}
      setAutoCleanupEnabled(Boolean(automation.enabled))
      setCleanupRetentionDays(String(automation.retentionDays ?? 0))
      setCleanupRunHourIst(String(automation.dailyRunHourIst ?? 6))
      if (automation.summary && typeof automation.summary === "object") {
        setAutomationSummary(automation.summary as CleanupAutomationSummary)
      } else {
        setAutomationSummary(null)
      }
    } catch (e: any) {
      console.error("❌ [CLEANUP] Failed to load automation settings", e)
    }
  }, [])

  const saveAutomationSettings = useCallback(async () => {
    const normalizedRetentionDays = Number(cleanupRetentionDays)
    const normalizedRunHourIst = Number(cleanupRunHourIst)
    if (!Number.isFinite(normalizedRetentionDays) || normalizedRetentionDays < 0) {
      setError("Retention days must be a non-negative number")
      return
    }
    if (!Number.isFinite(normalizedRunHourIst) || normalizedRunHourIst < 0 || normalizedRunHourIst > 23) {
      setError("Daily run hour must be between 0 and 23")
      return
    }

    setAutomationSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/cleanup/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: autoCleanupEnabled,
          retentionDays: Math.trunc(normalizedRetentionDays),
          dailyRunHourIst: Math.trunc(normalizedRunHourIst),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save automation settings")
      }

      await loadAutomationSettings()
      toast({ title: "Saved", description: "Automation settings saved successfully." })
    } catch (e: any) {
      console.error("❌ [CLEANUP] Failed to save automation settings", e)
      setError(e?.message || "Failed to save automation settings")
    } finally {
      setAutomationSaving(false)
    }
  }, [autoCleanupEnabled, cleanupRetentionDays, cleanupRunHourIst, loadAutomationSettings])

  const executeCleanup = useCallback(async () => {
    if (!confirm("This will permanently delete historical orders/closed positions before the selected date. Continue?")) return
    try {
      setExecuting(true)
      setError(null)
      const res = await fetch(`/api/admin/cleanup/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ before: fromDate || todayISO })
      })
      if (!res.ok) throw new Error(`Cleanup failed: ${res.status}`)
      const data = await res.json()
      toast({
        title: "Cleanup completed",
        description: `Deleted ${data.deletedOrders} orders, ${data.deletedPositions} positions.`
      })
      loadPreview()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Cleanup failed"
      toast({ title: "Error", description: message, variant: "destructive" })
      setError(message)
    } finally {
      setExecuting(false)
    }
  }, [fromDate, todayISO, loadPreview])

  useEffect(() => {
    setFromDate(todayISO)
  }, [todayISO])

  useEffect(() => {
    loadPreview()
    loadAutomationSettings()
  }, [loadPreview, loadAutomationSettings])

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Daily Cleanup"
        description="Manual + worker-driven cleanup for old orders and closed positions (IST schedule supported)"
        icon={<CleanupIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <RefreshButton
            onClick={() => {
              loadPreview()
              loadAutomationSettings()
            }}
            loading={loading}
            showLabel={false}
          />
        }
      />

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
          <AlertTitle className="text-red-500">Operation failed</AlertTitle>
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Automation (Worker-linked)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Enable automatic daily cleanup</p>
              <p className="text-xs text-muted-foreground">
                Runs once per IST day when any server worker tick is active and current IST hour is within the configured window.
              </p>
            </div>
            <Switch checked={autoCleanupEnabled} onCheckedChange={setAutoCleanupEnabled} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Retention days</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={cleanupRetentionDays}
                onChange={(e) => setCleanupRetentionDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">0 means keep only today; purge everything older.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Daily run hour (IST)</label>
              <Input
                type="number"
                min={0}
                max={23}
                step={1}
                value={cleanupRunHourIst}
                onChange={(e) => setCleanupRunHourIst(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Recommended morning window: 5 to 7 IST.</p>
            </div>
          </div>

          {automationSummary ? (
            <Alert className="bg-blue-500/10 border-blue-500/40">
              <AlertTitle className="text-blue-500">Last auto cleanup run</AlertTitle>
              <AlertDescription className="text-blue-400/90 text-xs">
                Source: {automationSummary.source || "—"} · Run: {automationSummary.lastRunAtIso || "—"} · Deleted{" "}
                {automationSummary.deletedOrders ?? 0} orders and {automationSummary.deletedPositions ?? 0} closed positions.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-muted/20 border-border">
              <AlertTitle>No auto-run history</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Save automation settings to enable worker-driven cleanup telemetry.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={saveAutomationSettings} disabled={automationSaving}>
              {automationSaving ? "Saving..." : "Save Automation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Filters & Safety</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Delete items BEFORE date</label>
              <Input type="date" value={fromDate} max={todayISO} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Alert className="bg-yellow-500/10 border-yellow-500/50">
                <ShieldAlert className="w-4 h-4 text-yellow-500" />
                <AlertTitle className="text-yellow-500">Safety Rule</AlertTitle>
                <AlertDescription className="text-yellow-500/80">
                  Cleanup will never touch today's data. It only affects orders with createdAt before the selected date, and positions that are closed before that date.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {counts && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Old Orders</div>
                <div className="text-2xl font-bold">{counts.oldOrders.toLocaleString()}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Closed Positions (old)</div>
                <div className="text-2xl font-bold">{counts.oldClosedPositions.toLocaleString()}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Earliest</div>
                <div className="font-mono">{counts.earliest || '—'}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Latest (pre-selected date)</div>
                <div className="font-mono">{counts.latest || '—'}</div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">Loading preview…</TableCell>
                  </TableRow>
                )}
                {!loading && dryRunRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">No candidates for cleanup</TableCell>
                  </TableRow>
                )}
                {!loading && dryRunRows.map((r, idx) => (
                  <TableRow key={`${r.type}-${r.id}-${idx}`} className="border-border">
                    <TableCell>
                      <Badge className={r.type === 'ORDER' ? 'bg-blue-400/20 text-blue-400 border-blue-400/30' : 'bg-purple-400/20 text-purple-400 border-purple-400/30'}>
                        {r.type}
                      </Badge>
                    </TableCell>
                    <TableCell><code className="font-mono text-primary">{r.id}</code></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {r.date}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.meta || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={executeCleanup} disabled={executing || loading} className="bg-red-600 hover:bg-red-700 text-white">
              <Eraser className="w-4 h-4 mr-2" /> Execute Cleanup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
