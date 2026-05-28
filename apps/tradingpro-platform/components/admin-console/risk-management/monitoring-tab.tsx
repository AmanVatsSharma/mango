/**
 * @file monitoring-tab.tsx
 * @module admin-console/risk-management
 * @description Risk Monitoring tab — thresholds, backstop runner, and enforcement settings
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { normalizeRiskManagementFractionThresholdInput } from "@/components/admin-console/risk-management-number-utils"
import type {
  PositionPnLWorkerHeartbeat,
  RiskBackstopApiResponse,
  RiskThresholdSource,
  RiskThresholds,
} from "./risk-types"
import { isProcessPositionPnLResult } from "./risk-types"

interface StatCardProps {
  label: string
  value: string | number
  color?: string
}

function StatCard({ label, value, color = "text-foreground" }: StatCardProps) {
  return (
    <Card className="p-3 bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-0.5 tabular-nums ${color}`}>{value}</p>
    </Card>
  )
}

function HeartbeatCards({ heartbeat }: { heartbeat: PositionPnLWorkerHeartbeat }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
      <StatCard label="SL auto-closed" value={heartbeat.stopLossAutoClosed ?? 0} color="text-red-400" />
      <StatCard label="Target auto-closed" value={heartbeat.targetAutoClosed ?? 0} color="text-green-400" />
      <StatCard label="Risk auto-closed" value={heartbeat.riskAutoClosed ?? 0} color="text-orange-400" />
      <StatCard label="Risk alerts" value={heartbeat.riskAlertsCreated ?? 0} color="text-yellow-400" />
    </div>
  )
}

interface MonitoringTabProps {
  refreshKey: number
}

export function MonitoringTab({ refreshKey }: MonitoringTabProps) {
  const [monitoring, setMonitoring] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [loadingThresholds, setLoadingThresholds] = useState(false)
  const [forceRun, setForceRun] = useState(false)
  const [lastRun, setLastRun] = useState<RiskBackstopApiResponse | null>(null)
  const [thresholdSource, setThresholdSource] = useState<RiskThresholdSource>("default")
  const [warningThreshold, setWarningThreshold] = useState(0.75)
  const [autoCloseThreshold, setAutoCloseThreshold] = useState(0.8)
  const [fullLiquidationOnAutoClose, setFullLiquidationOnAutoClose] = useState(false)
  const [squareOffOnWarningBand, setSquareOffOnWarningBand] = useState(false)
  const [enforcementSource, setEnforcementSource] = useState<RiskThresholdSource>("default")
  const [loadingEnforcement, setLoadingEnforcement] = useState(false)
  const [savingEnforcement, setSavingEnforcement] = useState(false)

  // Risk control master toggle + circuit breaker state
  const [riskAutoCloseEnabled, setRiskAutoCloseEnabled] = useState(true)
  const [circuitBreakerActive, setCircuitBreakerActive] = useState(false)
  const [circuitBreakerUntil, setCircuitBreakerUntil] = useState<number | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)

  // Today's auto-close stats
  const [slAutoClosedToday, setSlAutoClosedToday] = useState(0)
  const [targetAutoClosedToday, setTargetAutoClosedToday] = useState(0)
  const [riskAutoClosedToday, setRiskAutoClosedToday] = useState(0)
  const [riskAlertsToday, setRiskAlertsToday] = useState(0)
  const [lastEventTime, setLastEventTime] = useState<string | null>(null)

  const loadThresholds = async () => {
    setLoadingThresholds(true)
    try {
      const res = await fetch("/api/admin/risk/thresholds")
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to load thresholds")
      }
      const data = (await res.json()) as { success: boolean; thresholds?: RiskThresholds }
      if (!data?.thresholds) throw new Error("Invalid thresholds response")
      setWarningThreshold(data.thresholds.warningThreshold)
      setAutoCloseThreshold(data.thresholds.autoCloseThreshold)
      setThresholdSource(data.thresholds.source)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load risk thresholds"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoadingThresholds(false)
    }
  }

  const loadEnforcement = async () => {
    setLoadingEnforcement(true)
    try {
      const res = await fetch("/api/admin/risk/enforcement-settings")
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to load enforcement settings")
      }
      const data = (await res.json()) as {
        success: boolean
        settings?: {
          riskAutoCloseEnabled: boolean
          circuitBreakerPausedUntil: number | null
          fullLiquidationOnAutoClose: boolean
          squareOffOnWarningBand: boolean
          source: RiskThresholdSource
        }
      }
      if (!data?.settings) throw new Error("Invalid enforcement response")
      setFullLiquidationOnAutoClose(data.settings.fullLiquidationOnAutoClose)
      setSquareOffOnWarningBand(data.settings.squareOffOnWarningBand)
      setEnforcementSource(data.settings.source)
      setRiskAutoCloseEnabled(data.settings.riskAutoCloseEnabled)
      setCircuitBreakerActive(
        data.settings.circuitBreakerPausedUntil != null && Date.now() < data.settings.circuitBreakerPausedUntil,
      )
      setCircuitBreakerUntil(data.settings.circuitBreakerPausedUntil)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load enforcement settings"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoadingEnforcement(false)
    }
  }

  const loadRiskStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/admin/risk/status")
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to load risk status")
      }
      const data = (await res.json()) as {
        success: boolean
        status?: { riskEnabled: boolean; circuitBreakerActive: boolean; circuitBreakerUntil: number | null }
        stats?: {
          slAutoClosedToday: number
          targetAutoClosedToday: number
          riskAutoClosedToday: number
          riskAlertsToday: number
        }
        lastEventTime?: string | null
      }
      if (!data?.status) throw new Error("Invalid status response")
      setRiskAutoCloseEnabled(data.status.riskEnabled)
      setCircuitBreakerActive(data.status.circuitBreakerActive)
      setCircuitBreakerUntil(data.status.circuitBreakerUntil)
      if (data.stats) {
        setSlAutoClosedToday(data.stats.slAutoClosedToday)
        setTargetAutoClosedToday(data.stats.targetAutoClosedToday)
        setRiskAutoClosedToday(data.stats.riskAutoClosedToday)
        setRiskAlertsToday(data.stats.riskAlertsToday)
      }
      setLastEventTime(data.lastEventTime ?? null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load risk status"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoadingStatus(false)
    }
  }

  const saveRiskToggle = async (enabled: boolean) => {
    setSavingToggle(true)
    try {
      const res = await fetch("/api/admin/risk/enforcement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskAutoCloseEnabled: enabled }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to save risk toggle")
      }
      setRiskAutoCloseEnabled(enabled)
      toast({
        title: enabled ? "Risk controls enabled" : "Risk controls disabled",
        description: enabled
          ? "Auto-close and stop-loss are now active."
          : "Auto-close and stop-loss are paused. All positions will remain open.",
        variant: enabled ? "default" : "destructive",
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save risk toggle"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingToggle(false)
    }
  }

  const pauseCircuitBreaker = async (minutes: number) => {
    const until = Date.now() + minutes * 60_000
    setSavingToggle(true)
    try {
      const res = await fetch("/api/admin/risk/enforcement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circuitBreakerPausedUntil: until }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to pause circuit breaker")
      }
      setCircuitBreakerUntil(until)
      setCircuitBreakerActive(true)
      toast({
        title: `Risk paused for ${minutes} min`,
        description: `Circuit breaker active until ${new Date(until).toLocaleTimeString()}.`,
        variant: "destructive",
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to pause circuit breaker"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingToggle(false)
    }
  }

  const resumeCircuitBreaker = async () => {
    setSavingToggle(true)
    try {
      const res = await fetch("/api/admin/risk/enforcement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circuitBreakerPausedUntil: null }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to resume risk controls")
      }
      setCircuitBreakerUntil(null)
      setCircuitBreakerActive(false)
      toast({ title: "Risk controls resumed", description: "Auto-close and stop-loss are now active." })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to resume risk controls"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingToggle(false)
    }
  }

  const saveThresholds = async () => {
    setSavingThresholds(true)
    try {
      const res = await fetch("/api/admin/risk/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warningThreshold, autoCloseThreshold }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to update thresholds")
      }
      const data = (await res.json()) as { success: boolean; thresholds?: RiskThresholds }
      if (!data?.thresholds) throw new Error("Invalid thresholds response")
      setWarningThreshold(data.thresholds.warningThreshold)
      setAutoCloseThreshold(data.thresholds.autoCloseThreshold)
      setThresholdSource(data.thresholds.source)
      toast({ title: "Saved", description: "Risk thresholds updated in SystemSettings." })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update thresholds"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingThresholds(false)
    }
  }

  const saveEnforcement = async () => {
    setSavingEnforcement(true)
    try {
      const res = await fetch("/api/admin/risk/enforcement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullLiquidationOnAutoClose, squareOffOnWarningBand }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to save enforcement settings")
      }
      const data = (await res.json()) as { success: boolean; settings?: { source: RiskThresholdSource } }
      if (data?.settings?.source) setEnforcementSource(data.settings.source)
      toast({ title: "Saved", description: "Risk enforcement policy updated." })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingEnforcement(false)
    }
  }

  const runRiskBackstopNow = async () => {
    setMonitoring(true)
    try {
      const res = await fetch("/api/admin/risk/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRun }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error((error as { error?: string }).error ?? "Failed to run risk backstop")
      }
      const data = (await res.json()) as RiskBackstopApiResponse
      setLastRun(data)
      if (data?.thresholds) {
        setWarningThreshold(data.thresholds.warningThreshold)
        setAutoCloseThreshold(data.thresholds.autoCloseThreshold)
        setThresholdSource(data.thresholds.source)
      }
      if (data.result.skipped) {
        toast({
          title: "Skipped",
          description:
            data.result.skippedReason === "positions_worker_healthy"
              ? "Backstop skipped while the positions worker looks healthy. Turn on Force run to override."
              : data.result.skippedReason ?? "Backstop skipped.",
        })
        return
      }
      const inner = data.result.result
      const pnlResult = isProcessPositionPnLResult(inner) ? inner : null
      toast({
        title: "Backstop complete",
        description: pnlResult
          ? `Scanned ${pnlResult.scanned}, updated ${pnlResult.updated}, errors ${pnlResult.errors}.`
          : "Backstop ran successfully.",
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to run risk backstop"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setMonitoring(false)
    }
  }

  useEffect(() => {
    void loadThresholds()
    void loadEnforcement()
    void loadRiskStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const warningPct = Math.round(warningThreshold * 100)
  const autoClosePct = Math.round(autoCloseThreshold * 100)

  const isRiskActive = riskAutoCloseEnabled && !circuitBreakerActive
  const circuitBreakerTimeLeft =
    circuitBreakerActive && circuitBreakerUntil
      ? Math.max(0, Math.ceil((circuitBreakerUntil - Date.now()) / 60_000))
      : null

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Risk Control Status Card — Enterprise-grade master toggle */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {isRiskActive ? (
              <ShieldCheck className="w-4 h-4 text-green-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-400" />
            )}
            Risk Control Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* System status + toggle */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${isRiskActive ? "bg-green-400 animate-pulse" : "bg-red-500"}`}
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isRiskActive ? "ACTIVE — Auto-close & Stop-Loss enabled" : "DISABLED"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {circuitBreakerActive && circuitBreakerUntil
                    ? `Circuit breaker active — resumes ${new Date(circuitBreakerUntil).toLocaleTimeString()} (${circuitBreakerTimeLeft}m left)`
                    : !riskAutoCloseEnabled
                      ? "Master kill-switch is off — no auto-close will fire"
                      : "All risk controls are active and monitoring positions"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {circuitBreakerActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void resumeCircuitBreaker()}
                  disabled={savingToggle}
                >
                  {savingToggle ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                  Resume now
                </Button>
              )}
              <Switch
                checked={riskAutoCloseEnabled}
                onCheckedChange={(v) => void saveRiskToggle(v)}
                disabled={savingToggle}
              />
            </div>
          </div>

          {/* Circuit breaker quick controls */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground font-medium mr-1">Circuit breaker:</p>
            {[5, 15, 30].map((min) => (
              <Button
                key={min}
                size="sm"
                variant="outline"
                onClick={() => void pauseCircuitBreaker(min)}
                disabled={savingToggle || !riskAutoCloseEnabled || circuitBreakerActive}
                className="text-xs"
              >
                {savingToggle ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
                Pause {min}m
              </Button>
            ))}
            {circuitBreakerActive && circuitBreakerUntil && (
              <p className="text-xs text-amber-400 ml-2">
                Auto-resumes {new Date(circuitBreakerUntil).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Today's stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <StatCard label="SL auto-closed today" value={slAutoClosedToday} color="text-red-400" />
            <StatCard label="Target auto-closed today" value={targetAutoClosedToday} color="text-green-400" />
            <StatCard label="Risk auto-closed today" value={riskAutoClosedToday} color="text-orange-400" />
            <StatCard label="Risk alerts today" value={riskAlertsToday} color="text-yellow-400" />
          </div>

          {lastEventTime && (
            <p className="text-xs text-muted-foreground">
              Last worker run: {new Date(lastEventTime).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Info banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-1.5">
        <p className="text-sm font-medium text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Loss utilization formula
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">max(0, −net unrealized PnL) ÷ (balance + available margin)</span>
          {" "}— net profits do not count toward this ratio. Identical to the positions worker and risk cron formulas.
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-amber-400">Warning</span> creates alerts only.{" "}
          <span className="font-semibold text-red-400">Auto-close</span> tells the worker/cron to square off losing
          positions until utilization drops or safety caps apply.
        </p>
      </div>

      {/* Threshold + Enforcement card */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Thresholds &amp; Enforcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current values display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Warning threshold</p>
              <p className="text-3xl font-bold text-amber-400">{warningPct}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">alerts only</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Auto-close threshold</p>
              <p className="text-3xl font-bold text-red-400">{autoClosePct}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">square-off triggered</p>
            </div>
          </div>

          {/* Visual zone bar */}
          <div>
            <div className="h-3 rounded-full overflow-hidden bg-muted flex">
              <div className="bg-green-500/60 h-full" style={{ width: `${warningPct}%` }} />
              <div className="bg-amber-500/60 h-full" style={{ width: `${autoClosePct - warningPct}%` }} />
              <div className="bg-red-500/60 h-full flex-1" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0% Safe</span>
              <span className="text-amber-400">{warningPct}% Warn</span>
              <span className="text-red-400">{autoClosePct}% Close</span>
              <span>100%</span>
            </div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-sm">Warning Threshold (%)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Alert-only band. No automatic square-off until auto-close threshold is reached.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={warningThreshold * 100}
                onChange={(e) => {
                  const ratio = normalizeRiskManagementFractionThresholdInput(e.target.value, warningThreshold)
                  setWarningThreshold(ratio)
                  if (ratio > autoCloseThreshold) setAutoCloseThreshold(ratio)
                }}
                className="bg-background"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label className="text-sm">Auto-Close Threshold (%)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    When loss utilization is here or above, the worker closes worst losing positions (with valid live
                    prices) until utilization drops or safety caps apply.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={autoCloseThreshold * 100}
                onChange={(e) => {
                  const ratio = normalizeRiskManagementFractionThresholdInput(e.target.value, autoCloseThreshold)
                  setAutoCloseThreshold(ratio)
                  if (ratio < warningThreshold) setWarningThreshold(ratio)
                }}
                className="bg-background"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void saveThresholds()}
              disabled={savingThresholds || loadingThresholds}
              variant="outline"
              size="sm"
            >
              {savingThresholds ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save thresholds
            </Button>
            <Button
              onClick={() => void loadThresholds()}
              disabled={loadingThresholds || savingThresholds}
              variant="ghost"
              size="sm"
            >
              {loadingThresholds ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Refresh
            </Button>
            <span className="text-xs text-muted-foreground ml-1">
              Source: <Badge variant="secondary" className="ml-1">{thresholdSource}</Badge>
            </span>
          </div>

          {/* Enforcement policy section */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Enforcement policy</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm text-xs">
                  Full liquidation: on auto-close breach, every losing position is closed in each wave (not capped per batch).
                  Warning-band square-off: crossing the warning threshold also triggers automatic closes (aggressive mode).
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Full liquidation on auto-close</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Close all losing positions per wave at breach</p>
                </div>
                <Switch checked={fullLiquidationOnAutoClose} onCheckedChange={setFullLiquidationOnAutoClose} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Square off on warning band</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Warning threshold triggers closes, not only alerts</p>
                </div>
                <Switch checked={squareOffOnWarningBand} onCheckedChange={setSquareOffOnWarningBand} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void saveEnforcement()}
                disabled={savingEnforcement || loadingEnforcement}
                variant="outline"
              >
                {savingEnforcement ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Save policy
              </Button>
              <span className="text-xs text-muted-foreground">
                Source: <Badge variant="secondary" className="ml-1">{enforcementSource}</Badge>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backstop runner */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Risk Backstop (positions worker)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 flex-1">
              <div>
                <p className="text-xs font-medium text-foreground">Force run</p>
                <p className="text-xs text-muted-foreground mt-0.5">Run even if positions worker is healthy</p>
              </div>
              <Switch checked={forceRun} onCheckedChange={setForceRun} />
            </div>
            <Button
              onClick={() => void runRiskBackstopNow()}
              disabled={monitoring}
              className="bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {monitoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run backstop now
                </>
              )}
            </Button>
          </div>

          {/* Last run results */}
          {lastRun && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card className="p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Outcome</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {lastRun.result.skipped ? (
                      <XCircle className="w-4 h-4 text-yellow-400" />
                    ) : lastRun.result.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium">
                      {lastRun.result.skipped ? "Skipped" : lastRun.result.success ? "Success" : "Failed"}
                    </span>
                  </div>
                </Card>
                <Card className="p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Worker health</p>
                  <p className="text-sm font-bold mt-1">{lastRun.result.pnlWorkerHealth}</p>
                </Card>
                <Card className="p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                  <p className="text-sm font-bold mt-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    {Math.round(lastRun.result.elapsedMs)}ms
                  </p>
                </Card>
                {lastRun.result.skipped && (
                  <Card className="p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Skip reason</p>
                    <p className="text-xs font-mono text-foreground mt-1 break-all">
                      {lastRun.result.skippedReason ?? "—"}
                    </p>
                  </Card>
                )}
              </div>

              {!lastRun.result.skipped && isProcessPositionPnLResult(lastRun.result.result) && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Positions worker run summary</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <StatCard label="Scanned" value={lastRun.result.result.scanned} />
                    <StatCard label="Updated" value={lastRun.result.result.updated} color="text-green-400" />
                    <StatCard label="Skipped" value={lastRun.result.result.skipped} />
                    <StatCard label="Errors" value={lastRun.result.result.errors} color={lastRun.result.result.errors > 0 ? "text-red-400" : undefined} />
                    <StatCard label="Elapsed" value={`${Math.round(lastRun.result.result.elapsedMs)}ms`} />
                  </div>
                  {lastRun.result.result.heartbeat && (
                    <HeartbeatCards heartbeat={lastRun.result.result.heartbeat} />
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cron Setup */}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
            Cron Setup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            To run risk backstop automatically, set up a cron job to call:
          </p>
          <code className="block bg-muted/50 border border-border p-2 rounded text-xs break-all font-mono">
            GET /api/cron/risk-monitoring
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Recommended: Run every 60 seconds during market hours. Protect with{" "}
            <span className="font-mono text-foreground">CRON_SECRET</span> environment variable.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
