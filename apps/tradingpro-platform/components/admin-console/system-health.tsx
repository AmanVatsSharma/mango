/**
 * @file system-health.tsx
 * @module admin-console
 * @description Observability-style system health: synthetic telemetry + real Prisma DB merge; sparklines from poll history.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-25
 */

"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Activity,
  Server,
  Database,
  Cpu,
  HardDrive,
  Network,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Copy,
  Radio,
  GitBranch,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton, StatusBadge } from "./shared"

interface SystemMetric {
  name: string
  value: number
  max: number
  unit: string
  status: "HEALTHY" | "WARNING" | "CRITICAL"
  trend?: "up" | "down"
  subtitle?: string
}

interface ServiceStatus {
  name: string
  status: "ONLINE" | "OFFLINE" | "DEGRADED"
  uptime: number
  lastCheck: string | Date
  responseTime: number
  version?: string
  ready?: string
  p99Ms?: number
}

interface DatabaseStrip {
  label: string
  connectionsActive: number
  connectionsMax: number
  status: "ONLINE" | "OFFLINE" | "DEGRADED"
  lastCheck?: string | Date
  walLagMs?: number
  bufferCacheHitRatio?: number
  txPerSec?: number
  idleInTransactions?: number
}

interface HealthMeta {
  observedAt?: string
  scrapeIntervalMs?: number
  collectorVersion?: string
  environment?: string
  cluster?: string
  region?: string
  podName?: string
  replicaSet?: string
}

interface HealthCorrelation {
  checkId?: string
  traceId?: string
  parentSpanId?: string
}

interface HealthTraffic {
  requestsPerSec?: number
  errorRatePct?: number
  p50Ms?: number
  p95Ms?: number
  p99Ms?: number
  edgeDbProbeMs?: number
}

interface HealthRuntime {
  eventLoopLagMs?: number
  gcPauseP99Ms?: number
}

interface HealthSignal {
  severity: string
  source: string
  message: string
  at: string
}

interface HealthDependency {
  name: string
  status: "ONLINE" | "OFFLINE" | "DEGRADED"
  latencyMs: number
  lastOkAt: string | Date
}

const POLL_MS = 15_000
const SPARK_MAX = 24
const IST_TZ = "Asia/Kolkata"

function formatIst(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
  } catch {
    return iso
  }
}

function MetricSparkline({ series, accent }: { series: { i: number; v: number }[]; accent: string }) {
  if (series.length < 2) {
    return <div className="h-[44px] w-full rounded bg-muted/25 border border-border/50" aria-hidden />
  }
  return (
    <div className="h-[44px] w-full -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={accent}
            fill={accent}
            fillOpacity={0.12}
            strokeWidth={1.25}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SystemHealth() {
  const [metrics, setMetrics] = useState<SystemMetric[]>([])
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [database, setDatabase] = useState<DatabaseStrip | null>(null)
  const [meta, setMeta] = useState<HealthMeta | null>(null)
  const [correlation, setCorrelation] = useState<HealthCorrelation | null>(null)
  const [traffic, setTraffic] = useState<HealthTraffic | null>(null)
  const [runtime, setRuntime] = useState<HealthRuntime | null>(null)
  const [signals, setSignals] = useState<HealthSignal[]>([])
  const [dependencies, setDependencies] = useState<HealthDependency[]>([])
  const [metricHistory, setMetricHistory] = useState<Record<string, number[]>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchHealthData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/system/health").catch(() => null)

      if (response && response.ok) {
        const data = await response.json()
        setMetrics(data.metrics || [])
        setServices(data.services || [])
        setDatabase(data.database ?? null)
        setMeta(data.meta ?? null)
        setCorrelation(data.correlation ?? null)
        setTraffic(data.traffic ?? null)
        setRuntime(data.runtime ?? null)
        setSignals(Array.isArray(data.signals) ? data.signals : [])
        setDependencies(Array.isArray(data.dependencies) ? data.dependencies : [])
        setMetricHistory((prev) => {
          const next = { ...prev }
          for (const m of data.metrics || []) {
            const key = m.name as string
            next[key] = [...(next[key] ?? []), m.value as number].slice(-SPARK_MAX)
          }
          return next
        })
        setLastUpdatedAt(new Date())
      } else {
        setMetrics([])
        setServices([])
        setDatabase(null)
        setMeta(null)
        setCorrelation(null)
        setTraffic(null)
        setRuntime(null)
        setSignals([])
        setDependencies([])
      }
    } catch {
      setMetrics([])
      setServices([])
      setDatabase(null)
      setMeta(null)
      setCorrelation(null)
      setTraffic(null)
      setRuntime(null)
      setSignals([])
      setDependencies([])
      toast({
        title: "Error",
        description: "Failed to load system health data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchHealthData()
    const interval = setInterval(() => void fetchHealthData(), POLL_MS)
    return () => clearInterval(interval)
  }, [fetchHealthData])

  const copyTrace = useCallback(async () => {
    const tid = correlation?.traceId
    if (!tid) return
    try {
      await navigator.clipboard.writeText(`trace_id=${tid} check_id=${correlation?.checkId ?? ""}`)
      toast({ title: "Copied", description: "Correlation context copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", variant: "destructive" })
    }
  }, [correlation?.traceId, correlation?.checkId])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HEALTHY":
      case "ONLINE":
        return <CheckCircle2 className="w-5 h-5 text-green-400" />
      case "WARNING":
      case "DEGRADED":
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case "CRITICAL":
      case "OFFLINE":
        return <XCircle className="w-5 h-5 text-red-400" />
      default:
        return <Activity className="w-5 h-5 text-muted-foreground" />
    }
  }

  const signalBadgeClass = (severity: string) => {
    switch (severity.toUpperCase()) {
      case "CRITICAL":
        return "border-destructive/60 text-destructive"
      case "WARN":
        return "border-amber-500/60 text-amber-600 dark:text-amber-400"
      case "LOW":
        return "border-blue-500/50 text-blue-600 dark:text-blue-400"
      default:
        return "border-border text-muted-foreground"
    }
  }

  const sparkAccent = useMemo(() => "hsl(var(--primary))", [])

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="System Health"
        description="Real-time system monitoring and diagnostics"
        icon={<Activity className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {lastUpdatedAt && (
              <span className="text-xs text-muted-foreground tabular-nums order-2 sm:order-1">
                Updated{" "}
                {lastUpdatedAt.toLocaleTimeString("en-IN", {
                  timeZone: IST_TZ,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
            <RefreshButton onClick={() => void fetchHealthData()} loading={loading} className="order-1 sm:order-2" />
          </div>
        }
      />

      {(meta || correlation) && (
        <Card className="bg-card/80 border-border shadow-sm neon-border overflow-hidden">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
              <Badge variant="outline" className="font-mono gap-1">
                <Radio className="w-3 h-3" />
                {meta?.environment ?? "—"}
              </Badge>
              {meta?.cluster && (
                <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs">
                  {meta.cluster}
                </Badge>
              )}
              {meta?.region && (
                <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
                  {meta.region}
                </Badge>
              )}
              {meta?.podName && (
                <Badge variant="outline" className="font-mono max-w-[200px] truncate text-[10px] sm:text-xs">
                  pod/{meta.podName}
                </Badge>
              )}
              {meta?.collectorVersion && (
                <Badge variant="outline" className="gap-1 font-mono text-[10px] sm:text-xs">
                  <GitBranch className="w-3 h-3" />
                  coll {meta.collectorVersion}
                </Badge>
              )}
              {meta?.observedAt && (
                <span className="text-muted-foreground ml-auto tabular-nums">
                  scrape @ {formatIst(meta.observedAt)}
                </span>
              )}
            </div>
            {correlation?.traceId && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-2 font-mono text-[10px] sm:text-xs">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="truncate text-muted-foreground">
                    <span className="text-foreground/80">trace_id</span> {correlation.traceId}
                  </div>
                  {correlation.checkId && (
                    <div className="truncate text-muted-foreground">
                      <span className="text-foreground/80">check_id</span> {correlation.checkId}
                      {correlation.parentSpanId ? (
                        <span className="ml-2 hidden md:inline">
                          parent_span {correlation.parentSpanId}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 h-8 gap-1 font-sans text-xs" onClick={() => void copyTrace()}>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(traffic || runtime) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {traffic?.requestsPerSec != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">RPS</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.requestsPerSec}</p>
              </CardContent>
            </Card>
          )}
          {traffic?.errorRatePct != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Err rate</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.errorRatePct}%</p>
              </CardContent>
            </Card>
          )}
          {traffic?.p50Ms != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">p50</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.p50Ms}ms</p>
              </CardContent>
            </Card>
          )}
          {traffic?.p95Ms != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">p95</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.p95Ms}ms</p>
              </CardContent>
            </Card>
          )}
          {traffic?.p99Ms != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">p99</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.p99Ms}ms</p>
              </CardContent>
            </Card>
          )}
          {traffic?.edgeDbProbeMs != null && traffic.edgeDbProbeMs > 0 && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">DB probe</p>
                <p className="text-lg font-semibold tabular-nums">{traffic.edgeDbProbeMs}ms</p>
              </CardContent>
            </Card>
          )}
          {runtime?.eventLoopLagMs != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Evt loop</p>
                <p className="text-lg font-semibold tabular-nums">{runtime.eventLoopLagMs}ms</p>
              </CardContent>
            </Card>
          )}
          {runtime?.gcPauseP99Ms != null && (
            <Card className="border-border bg-muted/10">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">GC p99</p>
                <p className="text-lg font-semibold tabular-nums">{runtime.gcPauseP99Ms}ms</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-card border-border shadow-sm neon-border">
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {metric.name === "CPU Usage" && <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />}
                    {metric.name === "Memory Usage" && (
                      <Server className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                    )}
                    {metric.name === "Disk Usage" && (
                      <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                    )}
                    {metric.name === "Network I/O" && (
                      <Network className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm font-medium text-foreground truncate">{metric.name}</span>
                  </div>
                  <div className="flex-shrink-0">{getStatusIcon(metric.status)}</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl sm:text-2xl font-bold text-foreground truncate">
                      {metric.value}
                      {metric.unit}
                    </span>
                    {metric.trend &&
                      (metric.trend === "up" ? (
                        <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-400 flex-shrink-0" />
                      ))}
                  </div>
                  {metric.subtitle && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-mono leading-snug">{metric.subtitle}</p>
                  )}
                  <MetricSparkline
                    series={(metricHistory[metric.name] ?? []).map((v, i) => ({ i, v }))}
                    accent={sparkAccent}
                  />
                  <Progress
                    value={(metric.value / metric.max) * 100}
                    className={`h-2 ${
                      metric.status === "CRITICAL"
                        ? "bg-red-400/20"
                        : metric.status === "WARNING"
                          ? "bg-yellow-400/20"
                          : "bg-green-400/20"
                    }`}
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">
                      Max: {metric.max}
                      {metric.unit}
                    </span>
                    <StatusBadge status={metric.status} type="system" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-5 h-5 text-primary" />
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {services.map((service) => (
                <div key={service.name} className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIcon(service.status)}
                      <span className="font-medium text-foreground truncate">{service.name}</span>
                    </div>
                    <StatusBadge status={service.status} type="system" />
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs font-mono text-muted-foreground">
                    {service.version && <Badge variant="outline">{service.version}</Badge>}
                    {service.ready && <span>ready {service.ready}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-medium tabular-nums">{service.uptime}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">p99</span>
                      <span className="font-medium tabular-nums">{service.p99Ms ?? "—"}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RTT</span>
                      <span className="font-medium tabular-nums">{service.responseTime}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Check</span>
                      <span className="font-medium tabular-nums text-xs">
                        {new Date(service.lastCheck).toLocaleTimeString("en-IN", { timeZone: IST_TZ, hour12: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 md:space-y-4">
          <Card className="bg-card border-border shadow-sm neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-5 h-5 text-primary" />
                Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 max-h-[200px] overflow-y-auto text-sm">
                {signals.map((s, idx) => (
                  <li key={`${s.at}-${idx}`} className="rounded-md border border-border/80 bg-muted/15 p-2">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={signalBadgeClass(s.severity)}>
                        {s.severity}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{s.source}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{formatIst(s.at)} IST</span>
                    </div>
                    <p className="text-xs text-foreground/90 leading-snug">{s.message}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dependencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dependencies.map((d) => (
                <div key={d.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    {getStatusIcon(d.status)}
                    <span className="font-medium truncate">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                    <span>{d.latencyMs}ms</span>
                    <span className="tabular-nums">
                      ok{" "}
                      {new Date(d.lastOkAt).toLocaleTimeString("en-IN", {
                        timeZone: IST_TZ,
                        hour12: true,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Database Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">{database?.label ?? "PostgreSQL"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Connections</p>
                  <p className="font-medium text-foreground tabular-nums">
                    {database ? `${database.connectionsActive}/${database.connectionsMax}` : "—"}
                  </p>
                </div>
                <StatusBadge status={database?.status ?? "OFFLINE"} type="system" />
              </div>
            </div>
            {database && database.status === "ONLINE" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-md border border-border/80 bg-muted/10 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">WAL flush lag</p>
                  <p className="font-semibold tabular-nums">{database.walLagMs ?? "—"}ms</p>
                </div>
                <div className="rounded-md border border-border/80 bg-muted/10 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Buffer hit</p>
                  <p className="font-semibold tabular-nums">{database.bufferCacheHitRatio ?? "—"}%</p>
                </div>
                <div className="rounded-md border border-border/80 bg-muted/10 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Tx/s</p>
                  <p className="font-semibold tabular-nums">{database.txPerSec ?? "—"}</p>
                </div>
                <div className="rounded-md border border-border/80 bg-muted/10 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Idle in txn</p>
                  <p className="font-semibold tabular-nums">{database.idleInTransactions ?? "—"}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
