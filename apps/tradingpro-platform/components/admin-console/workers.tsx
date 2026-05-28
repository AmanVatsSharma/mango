/**
 * @file workers.tsx
 * @module admin-console
 * @description Admin Console page to view and manage all background workers (status, enable flags, run-once actions).
 * @author StockTrade
 * @created 2026-02-04
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Cpu, Play } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PageHeader, RefreshButton, StatusBadge } from "@/components/admin-console/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClientLogger } from "@/lib/logging/client-logger"
import {
  formatWorkerAdminDurationMs,
  formatWorkerAdminNumber,
  normalizeOrderWorkerRunOnceParams,
  normalizePositionWorkerRunOnceParams,
} from "@/components/admin-console/worker-admin-number-utils"

type WorkerHealth = "healthy" | "stale" | "unknown" | "disabled"

type WorkerSnapshot = {
  id: "order_execution" | "position_pnl" | "risk_monitoring"
  label: string
  description: string
  enabled: boolean
  healthTtlMs: number
  health: WorkerHealth
  lastRunAtIso: string | null
  heartbeat: { lastRunAtIso: string; [k: string]: unknown } | null
  config: Record<string, unknown>
  ec2Command?: string
  cronEndpoint?: string
}

type WorkersApiGet = { success: true; timestamp: string; workers: WorkerSnapshot[] } | { success: false; error?: string }
type MarketDataHealthApiResponse =
  | {
      success: true
      data: {
        health: {
          isConnected: boolean
          lastMessageAgeMs: number | null
          lastConnectErrorAgeMs?: number | null
          lastConnectErrorMessage?: string | null
          lastSocketErrorAgeMs?: number | null
          lastSocketErrorCode?: string | null
          lastSocketErrorMessage?: string | null
          cachedQuotes: number
          wantedSubscriptions: number
          subscribedSubscriptions: number
          subscriptionErrorCount?: number
          subscriptionErrorSample?: Array<{ token: number; code: string; message: string; at: number }>
          usingDemoApiKey: boolean
        }
        probe:
          | {
              token: number
              status: "fresh"
              ageMs: number
              lastTradePrice: number
            }
          | {
              token: number
              status: "stale_or_missing" | "feed_disconnected"
              maxAgeMs: number
              timeoutMs: number
            }
          | null
        timestamp: string
      }
    }
  | { success: false; error?: string }

const log = createClientLogger("ADMIN-WORKERS")

function fmtIso(iso: string | null): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
}

function hbGet(hb: WorkerSnapshot["heartbeat"], key: string): unknown {
  if (!hb) return null
  return (hb as any)[key]
}

function hbBool(hb: WorkerSnapshot["heartbeat"], key: string): boolean | null {
  const v = hbGet(hb, key)
  if (typeof v === "boolean") return v
  if (v === "true") return true
  if (v === "false") return false
  return null
}

function healthToBadge(health: WorkerHealth): { label: string; status: string } {
  if (health === "healthy") return { label: "Active", status: "HEALTHY" }
  if (health === "stale") return { label: "Stale", status: "WARNING" }
  if (health === "disabled") return { label: "Disabled", status: "OFFLINE" }
  return { label: "Unknown", status: "PENDING" }
}

export function Workers() {
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [workers, setWorkers] = useState<WorkerSnapshot[]>([])
  const [marketDataHealth, setMarketDataHealth] = useState<{
    health: {
      isConnected: boolean
      lastMessageAgeMs: number | null
      lastConnectErrorAgeMs?: number | null
      lastConnectErrorMessage?: string | null
      lastSocketErrorAgeMs?: number | null
      lastSocketErrorCode?: string | null
      lastSocketErrorMessage?: string | null
      cachedQuotes: number
      wantedSubscriptions: number
      subscribedSubscriptions: number
      subscriptionErrorCount?: number
      subscriptionErrorSample?: Array<{ token: number; code: string; message: string; at: number }>
      usingDemoApiKey: boolean
    }
    probe:
      | {
          token: number
          status: "fresh"
          ageMs: number
          lastTradePrice: number
        }
      | {
          token: number
          status: "stale_or_missing" | "feed_disconnected"
          maxAgeMs: number
          timeoutMs: number
        }
      | null
    timestamp: string
  } | null>(null)

  // Config inputs (safe client-side only)
  const [orderLimit, setOrderLimit] = useState("25")
  const [orderMaxAgeMs, setOrderMaxAgeMs] = useState("0")
  const [pnlLimit, setPnlLimit] = useState("500")
  const [pnlUpdateThreshold, setPnlUpdateThreshold] = useState("1")
  const [pnlDryRun, setPnlDryRun] = useState(false)

  const workersById = useMemo(() => {
    const map = new Map<string, WorkerSnapshot>()
    for (const w of workers) map.set(w.id, w)
    return map
  }, [workers])

  const fetchMarketDataHealth = async () => {
    try {
      const res = await fetch(
        "/api/admin/market-data-health?token=26571&subscriptionKey=NSE_EQ-26571&timeoutMs=3500&maxAgeMs=5000",
        { method: "GET" },
      )
      const data = (await res.json().catch(() => null)) as MarketDataHealthApiResponse | null
      if (!res.ok || !data || data.success !== true) {
        throw new Error((data as any)?.error || `Failed to fetch market data health (${res.status})`)
      }
      setMarketDataHealth(data.data)
    } catch (e: any) {
      log.warn("failed to load market data health", { message: e?.message || String(e) })
      setMarketDataHealth(null)
    }
  }

  const fetchWorkers = async () => {
    setLoading(true)
    log.debug("fetching workers snapshot")
    try {
      const res = await fetch("/api/admin/workers", { method: "GET" })
      const data = (await res.json().catch(() => null)) as WorkersApiGet | null
      if (!res.ok || !data || data.success !== true) {
        throw new Error((data as any)?.error || `Failed to fetch workers (${res.status})`)
      }
      setWorkers(data.workers || [])
      await fetchMarketDataHealth()
      log.info("snapshot loaded", { count: data.workers?.length || 0 })
    } catch (e: any) {
      log.error("failed to load workers", { message: e?.message || String(e) })
      toast({
        title: "Failed to load workers",
        description: e?.message || "Unknown error",
        variant: "destructive",
      })
      setWorkers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkers()
    const interval = setInterval(fetchWorkers, 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const postAction = async (body: any, key: string) => {
    setActionLoading((s) => ({ ...s, [key]: true }))
    try {
      const res = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || `Request failed (${res.status})`)
      }
      if (Array.isArray(data.workers)) setWorkers(data.workers)
      return data
    } finally {
      setActionLoading((s) => ({ ...s, [key]: false }))
    }
  }

  const toggleWorker = async (workerId: "order_execution" | "risk_monitoring", enabled: boolean) => {
    log.info("toggling worker", { workerId, enabled })
    try {
      await postAction({ action: "toggle", workerId, enabled }, `toggle:${workerId}`)
      toast({ title: "Saved", description: `${workerId} is now ${enabled ? "enabled" : "disabled"}.` })
    } catch (e: any) {
      log.error("toggle failed", { workerId, message: e?.message || String(e) })
      toast({ title: "Toggle failed", description: e?.message || "Unknown error", variant: "destructive" })
    }
  }

  const setPnlMode = async (mode: "client" | "server") => {
    log.info("setting pnl mode", { mode })
    try {
      await postAction({ action: "set_mode", workerId: "position_pnl", mode }, "set_mode:position_pnl")
      toast({ title: "Saved", description: `Position PnL mode set to ${mode}.` })
    } catch (e: any) {
      log.error("set mode failed", { mode, message: e?.message || String(e) })
      toast({ title: "Failed", description: e?.message || "Unknown error", variant: "destructive" })
    }
  }

  const runOnce = async (workerId: WorkerSnapshot["id"]) => {
    log.info("run once", { workerId })
    const params: Record<string, unknown> = {}
    if (workerId === "order_execution") {
      const normalizedParams = normalizeOrderWorkerRunOnceParams({
        limit: orderLimit,
        maxAgeMs: orderMaxAgeMs,
      })
      params.limit = normalizedParams.limit
      params.maxAgeMs = normalizedParams.maxAgeMs
    }
    if (workerId === "position_pnl") {
      const normalizedParams = normalizePositionWorkerRunOnceParams({
        limit: pnlLimit,
        updateThreshold: pnlUpdateThreshold,
        dryRun: pnlDryRun,
      })
      params.limit = normalizedParams.limit
      params.updateThreshold = normalizedParams.updateThreshold
      params.dryRun = normalizedParams.dryRun
    }
    try {
      const data = await postAction({ action: "run_once", workerId, params }, `run_once:${workerId}`)
      const skipped = Boolean((data as any)?.result?.skipped)
      const skippedReason = (data as any)?.result?.skippedReason as string | undefined
      if (workerId === "risk_monitoring" && skipped) {
        toast({
          title: "Skipped",
          description: skippedReason || "Risk backstop skipped (positions worker healthy).",
        })
      } else {
        toast({ title: "Triggered", description: `${workerId} ran once successfully.` })
      }
    } catch (e: any) {
      log.error("run once failed", { workerId, message: e?.message || String(e) })
      toast({ title: "Run failed", description: e?.message || "Unknown error", variant: "destructive" })
    }
  }

  const order = workersById.get("order_execution") || null
  const pnl = workersById.get("position_pnl") || null
  const risk = workersById.get("risk_monitoring") || null

  const orderRedisEnabled = Boolean(hbBool(order?.heartbeat || null, "redisEnabled") ?? (order?.config as any)?.redisEnabled)
  const pnlRedisEnabled = Boolean(hbBool(pnl?.heartbeat || null, "redisEnabled") ?? (pnl?.config as any)?.redisEnabled)
  const riskRedisEnabled = Boolean(hbBool(risk?.heartbeat || null, "redisEnabled") ?? (risk?.config as any)?.redisEnabled)

  const pnlRedisTtlSeconds = (pnl?.config as any)?.redisPnlCacheTtlSeconds as unknown
  const pnlRedisMaxAgeMs = (pnl?.config as any)?.redisPnlMaxAgeMs as unknown
  const latestMarketDataSubscriptionError =
    (marketDataHealth?.health?.subscriptionErrorSample || []).slice(-1)[0] || null
  const lastConnectErrorMessage =
    typeof marketDataHealth?.health?.lastConnectErrorMessage === "string"
      ? marketDataHealth.health.lastConnectErrorMessage
      : null
  const lastSocketErrorCode =
    typeof marketDataHealth?.health?.lastSocketErrorCode === "string" ? marketDataHealth.health.lastSocketErrorCode : null
  const lastSocketErrorMessage =
    typeof marketDataHealth?.health?.lastSocketErrorMessage === "string" ? marketDataHealth.health.lastSocketErrorMessage : null

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      <PageHeader
        title="Workers"
        description="View, enable/disable, and trigger background workers"
        icon={<Cpu className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 flex-shrink-0" />}
        actions={<RefreshButton onClick={fetchWorkers} loading={loading} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {/* Order execution */}
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{order?.label || "Order Execution Worker"}</span>
              <StatusBadge status={healthToBadge(order?.health || "unknown").status} type="system">
                {healthToBadge(order?.health || "unknown").label}
              </StatusBadge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{order?.description || "Executes PENDING orders asynchronously."}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Enabled</div>
                <div className="text-xs text-muted-foreground">Soft-toggle (does not stop EC2 processes)</div>
              </div>
              <Switch
                checked={Boolean(order?.enabled)}
                onCheckedChange={(v) => toggleWorker("order_execution", Boolean(v))}
                disabled={Boolean(actionLoading["toggle:order_execution"])}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Last heartbeat</div>
              <div className="text-xs text-muted-foreground">{fmtIso(order?.lastRunAtIso || null)}</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Redis realtime bus</div>
                <div className="text-xs text-muted-foreground">Required for cross-process worker → dashboard updates</div>
              </div>
              <StatusBadge status={orderRedisEnabled ? "ONLINE" : "OFFLINE"} type="system">
                {orderRedisEnabled ? "Enabled" : "Disabled"}
              </StatusBadge>
            </div>

            {order?.heartbeat ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-2">Last run stats</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Scanned</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(order.heartbeat, "scanned"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Executed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(order.heartbeat, "executed"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Cancelled</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(order.heartbeat, "cancelled"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Errors</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(order.heartbeat, "errorCount"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Elapsed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminDurationMs(hbGet(order.heartbeat, "elapsedMs"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Host / PID</div>
                    <div className="text-xs font-mono text-foreground">
                      {String(hbGet(order.heartbeat, "host") || "—")} / {formatWorkerAdminNumber(hbGet(order.heartbeat, "pid"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Deferred (stale quote)</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminNumber(hbGet(order.heartbeat, "deferredDueToStaleQuote"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Feed connected</div>
                    <div className="text-xs font-mono text-foreground">
                      {String(hbBool(order.heartbeat, "feedConnected") ?? "—")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Feed message age</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminDurationMs(hbGet(order.heartbeat, "feedLastMessageAgeMs"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Feed cache/subs</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminNumber(hbGet(order.heartbeat, "feedCachedQuotes"))} / {formatWorkerAdminNumber(hbGet(order.heartbeat, "feedSubscribedSubscriptions"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Feed subscription errors</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminNumber(hbGet(order.heartbeat, "feedSubscriptionErrorCount"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Feed connect error</div>
                    <div
                      className="text-xs font-mono text-foreground"
                      title={String(hbGet(order.heartbeat, "feedLastConnectErrorMessage") || "")}
                    >
                      {formatWorkerAdminDurationMs(hbGet(order.heartbeat, "feedLastConnectErrorAgeMs"))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium text-foreground mb-2">Server market-data health (live probe)</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Feed status</div>
                  <div className="text-xs font-mono text-foreground">
                    <StatusBadge status={marketDataHealth?.health?.isConnected ? "ONLINE" : "OFFLINE"} type="system">
                      {marketDataHealth?.health?.isConnected ? "Connected" : "Disconnected"}
                    </StatusBadge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Last message age</div>
                  <div className="text-xs font-mono text-foreground">
                    {formatWorkerAdminDurationMs(marketDataHealth?.health?.lastMessageAgeMs ?? null)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Last connect error</div>
                  <div
                    className="text-xs font-mono text-foreground"
                    title={lastConnectErrorMessage || ""}
                  >
                    {lastConnectErrorMessage
                      ? `${formatWorkerAdminDurationMs(marketDataHealth?.health?.lastConnectErrorAgeMs ?? null)} ago`
                      : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Last socket error</div>
                  <div
                    className="text-xs font-mono text-foreground"
                    title={lastSocketErrorMessage || ""}
                  >
                    {lastSocketErrorCode
                      ? `${lastSocketErrorCode} · ${formatWorkerAdminDurationMs(marketDataHealth?.health?.lastSocketErrorAgeMs ?? null)} ago`
                      : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Cached quotes</div>
                  <div className="text-xs font-mono text-foreground">
                    {formatWorkerAdminNumber(marketDataHealth?.health?.cachedQuotes ?? null)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Wanted/Subscribed</div>
                  <div className="text-xs font-mono text-foreground">
                    {formatWorkerAdminNumber(marketDataHealth?.health?.wantedSubscriptions ?? null)} / {formatWorkerAdminNumber(marketDataHealth?.health?.subscribedSubscriptions ?? null)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Subscription errors</div>
                  <div className="text-xs font-mono text-foreground">
                    {formatWorkerAdminNumber(marketDataHealth?.health?.subscriptionErrorCount ?? 0)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Latest error</div>
                  <div
                    className="text-xs font-mono text-foreground"
                    title={typeof latestMarketDataSubscriptionError?.message === "string" ? latestMarketDataSubscriptionError.message : ""}
                  >
                    {latestMarketDataSubscriptionError
                      ? `${latestMarketDataSubscriptionError.code} @ ${latestMarketDataSubscriptionError.token}`
                      : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Probe token 26571</div>
                  <div className="text-xs font-mono text-foreground">
                    {marketDataHealth?.probe ? marketDataHealth.probe.status : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Probe age / price</div>
                  <div className="text-xs font-mono text-foreground">
                    {marketDataHealth?.probe?.status === "fresh"
                      ? `${formatWorkerAdminDurationMs(marketDataHealth.probe.ageMs)} / ${marketDataHealth.probe.lastTradePrice}`
                      : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">API key mode</div>
                  <div className="text-xs font-mono text-foreground">
                    {marketDataHealth?.health?.usingDemoApiKey ? "demo/default (warning)" : "configured"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Health timestamp</div>
                  <div className="text-xs font-mono text-foreground">
                    {fmtIso(marketDataHealth?.timestamp ?? null)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Run-once limit</Label>
                <Input value={orderLimit} onChange={(e) => setOrderLimit(e.target.value)} placeholder="25" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max age (ms)</Label>
                <Input value={orderMaxAgeMs} onChange={(e) => setOrderMaxAgeMs(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground truncate">
                {order?.cronEndpoint ? `Cron: ${order.cronEndpoint}` : "Cron: /api/cron/order-worker"}
              </div>
              <Button
                size="sm"
                onClick={() => runOnce("order_execution")}
                disabled={Boolean(actionLoading["run_once:order_execution"])}
              >
                <Play className="w-4 h-4 mr-2" />
                Run now
              </Button>
            </div>

            {order?.ec2Command ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-1">EC2 command</div>
                <div className="text-xs text-muted-foreground font-mono break-words">{order.ec2Command}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Position PnL */}
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{pnl?.label || "Positions PnL Worker"}</span>
              <StatusBadge status={healthToBadge(pnl?.health || "unknown").status} type="system">
                {healthToBadge(pnl?.health || "unknown").label}
              </StatusBadge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{pnl?.description || "Computes server-side PnL (optional)."}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">PnL mode</Label>
              <Select
                value={(pnl?.config?.mode as any) === "server" ? "server" : "client"}
                onValueChange={(v) => setPnlMode(v === "server" ? "server" : "client")}
                disabled={Boolean(actionLoading["set_mode:position_pnl"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client (quotes-driven)</SelectItem>
                  <SelectItem value="server">Server (worker-driven)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Server mode runs the snapshot worker. Positions tab MTM rendering and square-off price authority are
                configured separately under Admin → Settings → Market display (positions pricing).
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Last heartbeat</div>
              <div className="text-xs text-muted-foreground">{fmtIso(pnl?.lastRunAtIso || null)}</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Redis realtime bus</div>
                <div className="text-xs text-muted-foreground">Workers publish SSE payloads via Redis Pub/Sub</div>
              </div>
              <StatusBadge status={pnlRedisEnabled ? "ONLINE" : "OFFLINE"} type="system">
                {pnlRedisEnabled ? "Enabled" : "Disabled"}
              </StatusBadge>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">PnL Redis cache</div>
                <div className="text-xs text-muted-foreground">Used by `/api/trading/positions/list` overlay + UI patch events</div>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                TTL {formatWorkerAdminNumber(pnlRedisTtlSeconds)}s · MaxAge {formatWorkerAdminNumber(pnlRedisMaxAgeMs)}ms
              </div>
            </div>

            {pnl?.heartbeat ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-2">Last run stats</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Scanned</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "scanned"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Updated (DB)</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "updated"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Skipped (threshold)</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "skipped"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Errors</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "errors"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Redis cache writes</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "redisPnlCacheWrites"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">PnL updates / events</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminNumber(hbGet(pnl.heartbeat, "pnlUpdatesEmitted"))} / {formatWorkerAdminNumber(hbGet(pnl.heartbeat, "pnlEventsEmitted"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Elapsed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminDurationMs(hbGet(pnl.heartbeat, "elapsedMs"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Host / PID</div>
                    <div className="text-xs font-mono text-foreground">
                      {String(hbGet(pnl.heartbeat, "host") || "—")} / {formatWorkerAdminNumber(hbGet(pnl.heartbeat, "pid"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">SL auto-closed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "stopLossAutoClosed"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Target auto-closed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "targetAutoClosed"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Risk auto-closed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "riskAutoClosed"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Risk alerts</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(pnl.heartbeat, "riskAlertsCreated"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Risk thresholds</div>
                    <div className="text-xs font-mono text-foreground">
                      {formatWorkerAdminNumber(hbGet(pnl.heartbeat, "riskWarningThreshold"))} / {formatWorkerAdminNumber(hbGet(pnl.heartbeat, "riskAutoCloseThreshold"))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Threshold source</div>
                    <div className="text-xs font-mono text-foreground">{String(hbGet(pnl.heartbeat, "riskThresholdSource") || "—")}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Run-once limit</Label>
                <Input value={pnlLimit} onChange={(e) => setPnlLimit(e.target.value)} placeholder="500" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Update threshold</Label>
                <Input value={pnlUpdateThreshold} onChange={(e) => setPnlUpdateThreshold(e.target.value)} placeholder="1" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={pnlDryRun} onCheckedChange={(v) => setPnlDryRun(Boolean(v))} />
                <span className="text-xs text-muted-foreground">Dry run</span>
              </div>
              <Button
                size="sm"
                onClick={() => runOnce("position_pnl")}
                disabled={Boolean(actionLoading["run_once:position_pnl"])}
              >
                <Play className="w-4 h-4 mr-2" />
                Run now
              </Button>
            </div>

            {pnl?.ec2Command ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-1">EC2 command</div>
                <div className="text-xs text-muted-foreground font-mono break-words">{pnl.ec2Command}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Risk backstop (cron) */}
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="truncate">Risk Backstop (cron)</span>
              <StatusBadge status={healthToBadge(risk?.health || "unknown").status} type="system">
                {healthToBadge(risk?.health || "unknown").label}
              </StatusBadge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Backstop runner: triggers positions worker risk enforcement only when the positions worker is stale.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Enabled</div>
                <div className="text-xs text-muted-foreground">Cron must still be scheduled externally</div>
              </div>
              <Switch
                checked={Boolean(risk?.enabled)}
                onCheckedChange={(v) => toggleWorker("risk_monitoring", Boolean(v))}
                disabled={Boolean(actionLoading["toggle:risk_monitoring"])}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Last heartbeat</div>
              <div className="text-xs text-muted-foreground">{fmtIso(risk?.lastRunAtIso || null)}</div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Redis realtime bus</div>
                <div className="text-xs text-muted-foreground">Optional (required only for cross-process realtime events)</div>
              </div>
              <StatusBadge status={riskRedisEnabled ? "ONLINE" : "OFFLINE"} type="system">
                {riskRedisEnabled ? "Enabled" : "Disabled"}
              </StatusBadge>
            </div>

            {risk?.heartbeat ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-foreground mb-2">Last run stats</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Skipped</div>
                    <div className="text-xs font-mono text-foreground">{String(hbGet(risk.heartbeat, "skipped") ?? "—")}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Skip reason</div>
                    <div className="text-xs font-mono text-foreground">{String(hbGet(risk.heartbeat, "skippedReason") || "—")}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">PnL worker health</div>
                    <div className="text-xs font-mono text-foreground">{String(hbGet(risk.heartbeat, "pnlWorkerHealth") || "—")}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">PnL last run</div>
                    <div className="text-xs font-mono text-foreground">{fmtIso(String(hbGet(risk.heartbeat, "pnlWorkerLastRunAtIso") || ""))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Checked accounts</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(risk.heartbeat, "checkedAccounts"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Positions closed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(risk.heartbeat, "positionsClosed"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Alerts created</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(risk.heartbeat, "alertsCreated"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Errors</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminNumber(hbGet(risk.heartbeat, "errorCount"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Elapsed</div>
                    <div className="text-xs font-mono text-foreground">{formatWorkerAdminDurationMs(hbGet(risk.heartbeat, "elapsedMs"))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Host / PID</div>
                    <div className="text-xs font-mono text-foreground">
                      {String(hbGet(risk.heartbeat, "host") || "—")} / {formatWorkerAdminNumber(hbGet(risk.heartbeat, "pid"))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground truncate">
                {risk?.cronEndpoint ? `Cron: ${risk.cronEndpoint}` : "Cron: /api/cron/risk-monitoring"}
              </div>
              <Button
                size="sm"
                onClick={() => runOnce("risk_monitoring")}
                disabled={Boolean(actionLoading["run_once:risk_monitoring"])}
              >
                <Play className="w-4 h-4 mr-2" />
                Run now
              </Button>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium text-foreground mb-1">Scheduling</div>
              <div className="text-xs text-muted-foreground">
                Recommended: run every 60 seconds (Vercel Cron, EC2 cron, or external scheduler).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

