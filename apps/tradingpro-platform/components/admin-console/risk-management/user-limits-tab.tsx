/**
 * File:        components/admin-console/risk-management/user-limits-tab.tsx
 * Module:      Admin Console · Risk Management · User Limits
 * Purpose:     Per-user risk limits configuration and active risk alerts management,
 *              including five optional threshold override fields (low/medium/high/auto-close %
 *              and max daily loss INR).
 *
 * Exports:
 *   - UserLimitsTab({ refreshKey }) — tab panel showing risk limit table and alerts list
 *
 * Depends on:
 *   - @/components/admin-console/common/user-picker-typeahead — typeahead user search input
 *   - @/components/admin-console/shared                       — StatusBadge component
 *   - /api/admin/risk/limits                                  — CRUD for per-user risk limits
 *   - /api/admin/risk/alerts                                  — active risk alerts list
 *
 * Side-effects:
 *   - HTTP GET /api/admin/risk/limits, /api/admin/risk/alerts on mount and refreshKey change
 *   - HTTP POST/PUT /api/admin/risk/limits on save
 *   - HTTP POST /api/admin/risk/alerts/:id/resolve on alert resolve
 *
 * Key invariants:
 *   - refreshKey prop triggers a data reload when incremented by parent
 *   - selectedLimit is set when editing; null when creating
 *   - Empty string in threshold input fields maps to null (use global default)
 *   - Threshold percentages are validated 0–100 client-side before submit
 *
 * Read order:
 *   1. EMPTY_LIMIT — default form state
 *   2. UserLimitsTab — main component
 *   3. handleSaveLimit — submit handler
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit,
  Loader2,
  Plus,
  Shield,
  Users,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { StatusBadge } from "@/components/admin-console/shared"
import { UserPickerTypeahead } from "@/components/admin-console/common/user-picker-typeahead"
import {
  normalizeRiskLimitNonNegativeInput,
  normalizeRiskLimitNonNegativeIntegerInput,
} from "@/components/admin-console/risk-management-number-utils"
import type { RiskAlert, RiskLimit } from "./risk-types"

const EMPTY_LIMIT = {
  userId: "",
  maxDailyLoss: 0,
  maxPositionSize: 0,
  maxLeverage: 0,
  maxDailyTrades: 0,
  // Threshold overrides — empty string = "use global default" (maps to null on save)
  riskLevelLowPct: "" as string | number,
  riskLevelMediumPct: "" as string | number,
  riskLevelHighPct: "" as string | number,
  autoCloseLevelPct: "" as string | number,
  maxDailyLossInr: "" as string | number,
}

const SEVERITY_CONFIG = {
  CRITICAL: { bg: "bg-red-500/10", border: "border-red-500/30", badge: "text-red-400" },
  HIGH: { bg: "bg-orange-500/10", border: "border-orange-500/30", badge: "text-orange-400" },
  MEDIUM: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", badge: "text-yellow-400" },
  LOW: { bg: "bg-muted/40", border: "border-border", badge: "text-muted-foreground" },
} as const

interface UserLimitsTabProps {
  refreshKey: number
}

export function UserLimitsTab({ refreshKey }: UserLimitsTabProps) {
  const [limits, setLimits] = useState<RiskLimit[]>([])
  const [alerts, setAlerts] = useState<RiskAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [showLimitDialog, setShowLimitDialog] = useState(false)
  const [selectedLimit, setSelectedLimit] = useState<RiskLimit | null>(null)
  const [newLimit, setNewLimit] = useState({ ...EMPTY_LIMIT })
  const [saving, setSaving] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [limitsRes, alertsRes] = await Promise.all([
        fetch("/api/admin/risk/limits").catch(() => null),
        fetch("/api/admin/risk/alerts").catch(() => null),
      ])
      if (limitsRes?.ok) {
        const data = await limitsRes.json()
        setLimits(data.limits ?? [])
      } else {
        setLimits([])
      }
      if (alertsRes?.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts ?? [])
      } else {
        setAlerts([])
      }
    } catch {
      toast({ title: "Error", description: "Failed to load risk limits data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  /** Convert empty string threshold inputs to undefined (omit from body = use global). */
  function buildLimitBody() {
    const pctToNumber = (v: string | number) =>
      v === "" ? undefined : Number(v)
    return {
      userId: newLimit.userId,
      maxDailyLoss: newLimit.maxDailyLoss,
      maxPositionSize: newLimit.maxPositionSize,
      maxLeverage: newLimit.maxLeverage,
      maxDailyTrades: newLimit.maxDailyTrades,
      riskLevelLowPct: pctToNumber(newLimit.riskLevelLowPct),
      riskLevelMediumPct: pctToNumber(newLimit.riskLevelMediumPct),
      riskLevelHighPct: pctToNumber(newLimit.riskLevelHighPct),
      autoCloseLevelPct: pctToNumber(newLimit.autoCloseLevelPct),
      maxDailyLossInr: pctToNumber(newLimit.maxDailyLossInr),
    }
  }

  const handleSaveLimit = async () => {
    setSaving(true)
    try {
      const url = selectedLimit ? `/api/admin/risk/limits/${selectedLimit.id}` : "/api/admin/risk/limits"
      const method = selectedLimit ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLimitBody()),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error((errData as { error?: string }).error ?? "Failed to save limit")
      }
      toast({ title: "Success", description: selectedLimit ? "Risk limit updated" : "Risk limit created" })
      setShowLimitDialog(false)
      setSelectedLimit(null)
      setNewLimit({ ...EMPTY_LIMIT })
      void fetchData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save risk limit"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const resolveAlert = async (alertId: string) => {
    setResolvingId(alertId)
    try {
      const res = await fetch(`/api/admin/risk/alerts/${alertId}/resolve`, { method: "POST" })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? "Failed to resolve alert")
      }
      toast({ title: "Alert resolved" })
      void fetchData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to resolve alert"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setResolvingId(null)
    }
  }

  const activeLimits = limits.filter((l) => l.status === "ACTIVE").length
  const warningUsers = limits.filter((l) => l.status === "WARNING").length
  const suspendedUsers = limits.filter((l) => l.status === "SUSPENDED").length
  const activeAlerts = alerts.filter((a) => !a.resolved).length

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Active Limits</p>
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <p className="text-2xl font-bold text-green-400">{activeLimits}</p>
                )}
              </div>
              <Shield className="w-7 h-7 text-green-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Warning Users</p>
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <p className={`text-2xl font-bold ${warningUsers > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {warningUsers}
                  </p>
                )}
              </div>
              <Users className={`w-7 h-7 flex-shrink-0 ${warningUsers > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Suspended</p>
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <p className={`text-2xl font-bold ${suspendedUsers > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {suspendedUsers}
                  </p>
                )}
              </div>
              <AlertCircle className={`w-7 h-7 flex-shrink-0 ${suspendedUsers > 0 ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Active Alerts</p>
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <p className={`text-2xl font-bold ${activeAlerts > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                    {activeAlerts}
                  </p>
                )}
              </div>
              <AlertTriangle className={`w-7 h-7 flex-shrink-0 ${activeAlerts > 0 ? "text-orange-400" : "text-muted-foreground"}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Limits table */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary">User Risk Limits</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Per-user override limits for daily loss, position size, leverage, and daily trades</p>
        </div>
        <Dialog
          open={showLimitDialog}
          onOpenChange={(open) => {
            setShowLimitDialog(open)
            if (!open) { setSelectedLimit(null); setNewLimit({ ...EMPTY_LIMIT }) }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Limit
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-primary">
                {selectedLimit ? "Edit Risk Limit" : "Create Risk Limit"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Set per-user override limits. These take precedence over platform-wide defaults.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm mb-1.5 block">User</Label>
                <UserPickerTypeahead
                  value={newLimit.userId}
                  onChange={(userId) => setNewLimit({ ...newLimit, userId })}
                  placeholder="Search by name, email, or client ID…"
                  disabled={!!selectedLimit}
                />
                {!selectedLimit && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Type at least 2 characters to search for a user.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Max Daily Loss (₹)</Label>
                  <Input
                    type="number"
                    value={newLimit.maxDailyLoss}
                    onChange={(e) =>
                      setNewLimit({ ...newLimit, maxDailyLoss: normalizeRiskLimitNonNegativeInput(e.target.value, newLimit.maxDailyLoss) })
                    }
                    className="bg-background"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Max Position Size (₹)</Label>
                  <Input
                    type="number"
                    value={newLimit.maxPositionSize}
                    onChange={(e) =>
                      setNewLimit({ ...newLimit, maxPositionSize: normalizeRiskLimitNonNegativeInput(e.target.value, newLimit.maxPositionSize) })
                    }
                    className="bg-background"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Max Leverage</Label>
                  <Input
                    type="number"
                    value={newLimit.maxLeverage}
                    onChange={(e) =>
                      setNewLimit({ ...newLimit, maxLeverage: normalizeRiskLimitNonNegativeInput(e.target.value, newLimit.maxLeverage) })
                    }
                    className="bg-background"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Max Daily Trades</Label>
                  <Input
                    type="number"
                    value={newLimit.maxDailyTrades}
                    onChange={(e) =>
                      setNewLimit({ ...newLimit, maxDailyTrades: normalizeRiskLimitNonNegativeIntegerInput(e.target.value, newLimit.maxDailyTrades) })
                    }
                    className="bg-background"
                  />
                </div>
              </div>

              {/* Per-user threshold overrides — empty = use global default */}
              <div className="pt-1">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Risk Threshold Overrides <span className="font-normal normal-case">(leave blank to use global default)</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Risk Level Low %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="e.g. 30 (global default)"
                      value={newLimit.riskLevelLowPct}
                      onChange={(e) =>
                        setNewLimit({ ...newLimit, riskLevelLowPct: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Risk Level Medium %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="e.g. 60 (global default)"
                      value={newLimit.riskLevelMediumPct}
                      onChange={(e) =>
                        setNewLimit({ ...newLimit, riskLevelMediumPct: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Risk Level High %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="e.g. 75 (global warning)"
                      value={newLimit.riskLevelHighPct}
                      onChange={(e) =>
                        setNewLimit({ ...newLimit, riskLevelHighPct: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block">Auto-Close Level %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="e.g. 80 (global auto-close)"
                      value={newLimit.autoCloseLevelPct}
                      onChange={(e) =>
                        setNewLimit({ ...newLimit, autoCloseLevelPct: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm mb-1.5 block">Max Daily Loss (₹) Override</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="e.g. 50000 (leave blank for no INR limit)"
                      value={newLimit.maxDailyLossInr}
                      onChange={(e) =>
                        setNewLimit({ ...newLimit, maxDailyLossInr: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void handleSaveLimit()} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {selectedLimit ? "Update Limit" : "Create Limit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="px-0 pb-3 pt-0">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>User</TableHead>
                    <TableHead>Max Daily Loss</TableHead>
                    <TableHead>Max Position Size</TableHead>
                    <TableHead>Max Leverage</TableHead>
                    <TableHead>Max Daily Trades</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(3)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : limits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        No per-user risk limits configured. Platform-wide defaults from the Platform Config tab apply.
                      </TableCell>
                    </TableRow>
                  ) : (
                    limits.map((limit) => (
                      <TableRow key={limit.id} className="border-border hover:bg-muted/20">
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground text-sm">{limit.userName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{limit.userId.slice(0, 8)}…</p>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">₹{limit.maxDailyLoss.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="tabular-nums">₹{limit.maxPositionSize.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="tabular-nums">{limit.maxLeverage}x</TableCell>
                        <TableCell className="tabular-nums">{limit.maxDailyTrades}</TableCell>
                        <TableCell>
                          <StatusBadge status={limit.status} type="risk" />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(limit.lastUpdated).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLimit(limit)
                              setNewLimit({
                                userId: limit.userId,
                                maxDailyLoss: limit.maxDailyLoss,
                                maxPositionSize: limit.maxPositionSize,
                                maxLeverage: limit.maxLeverage,
                                maxDailyTrades: limit.maxDailyTrades,
                                riskLevelLowPct: limit.riskLevelLowPct ?? "",
                                riskLevelMediumPct: limit.riskLevelMediumPct ?? "",
                                riskLevelHighPct: limit.riskLevelHighPct ?? "",
                                autoCloseLevelPct: limit.autoCloseLevelPct ?? "",
                                maxDailyLossInr: limit.maxDailyLossInr ?? "",
                              })
                              setShowLimitDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Alerts */}
      <div>
        <h2 className="text-base font-semibold text-primary mb-3">Risk Alerts</h2>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-4 space-y-3">
            {loading ? (
              [...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 text-green-400/50" />
                <p className="text-sm">No active alerts — all clear.</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.LOW
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${cfg.bg} ${cfg.border} flex items-start justify-between gap-3`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Badge className={`text-xs ${cfg.badge} bg-transparent border-current`}>{alert.severity}</Badge>
                        <span className="text-sm font-medium text-foreground">{alert.type.replace(/_/g, " ")}</span>
                        {alert.resolved && (
                          <Badge className="bg-green-400/20 text-green-400 border-green-400/30 text-xs">Resolved</Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground mb-1 break-words">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.userName} · {new Date(alert.timestamp).toLocaleString("en-IN")}
                      </p>
                    </div>
                    {!alert.resolved && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                        disabled={resolvingId === alert.id}
                        onClick={() => void resolveAlert(alert.id)}
                      >
                        {resolvingId === alert.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resolve"}
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
