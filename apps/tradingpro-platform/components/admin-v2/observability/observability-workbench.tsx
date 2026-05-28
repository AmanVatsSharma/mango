/**
 * File:        components/admin-v2/observability/observability-workbench.tsx
 * Module:      admin-v2/observability
 * Purpose:     Phase 16 Observability Dashboard — live system health, service status grid,
 *              CPU/memory/event-loop gauges, market-data feed health, queue depth, and
 *              recent alert signals. Auto-refreshes every 10–15s per endpoint.
 *
 * Exports:
 *   - ObservabilityWorkbench  — no props (all data fetched via SWR hooks)
 *
 * Depends on:
 *   - @/components/admin-v2/primitives  — KpiTile, StatusPill, EmptyState
 *   - @/lib/admin-v2/api-client         — formatRelativeIst
 *   - ./hooks                           — useSystemHealth, useMarketDataHealth, useQueueStatus, useQuotesBatcherStatus
 *
 * Side-effects:
 *   - SWR polling on 4 endpoints (10s or 15s intervals, staggered)
 *
 * Key invariants:
 *   - Service status color: ONLINE=gain, DEGRADED=warn, OFFLINE=loss
 *   - Metric gauge: HEALTHY=gain, WARNING=warn, CRITICAL=loss
 *   - All timestamps formatted in IST via formatRelativeIst
 *
 * Read order:
 *   1. ObservabilityWorkbench — state + hook calls at the top
 *   2. KPI strip — traffic summary from system/health
 *   3. Service grid — per-service ONLINE/DEGRADED/OFFLINE cards
 *   4. System metrics gauges — CPU/memory/event-loop
 *   5. Market-data health — feed status + token freshness summary
 *   6. Queue + batcher — queue depth and quotes batcher state
 *   7. Signals timeline — recent alert signals
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers,
  Radio,
  RefreshCw,
  ServerCrash,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react"
import { KpiTile } from "@/components/admin-v2/primitives/kpi-tile"
import { StatusPill } from "@/components/admin-v2/primitives/status-pill"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import {
  useMarketDataHealth,
  useQuotesBatcherStatus,
  useQueueStatus,
  useSystemHealth,
} from "./hooks"
import type { MetricStatus, ServiceStatus, ServiceStatusKind, Signal, SignalSeverity } from "./types"

// ── Helpers ─────────────────────────────────────────────────────────────────

const SERVICE_TONE: Record<ServiceStatusKind, "success" | "warning" | "danger"> = {
  ONLINE: "success",
  DEGRADED: "warning",
  OFFLINE: "danger",
}

const METRIC_TONE: Record<MetricStatus, "success" | "warning" | "danger"> = {
  HEALTHY: "success",
  WARNING: "warning",
  CRITICAL: "danger",
}

const SIGNAL_TONE: Record<SignalSeverity, "info" | "neutral" | "warning" | "danger"> = {
  INFO: "info",
  LOW: "neutral",
  WARN: "warning",
  CRITICAL: "danger",
}

// ── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceStatus }) {
  const tone = SERVICE_TONE[svc.status]
  const isOnline = svc.status === "ONLINE"
  return (
    <div
      className={cn(
        "v2-card relative overflow-hidden p-4 transition-all duration-200",
        isOnline && "hover:border-[var(--v2-gain)]/30",
        svc.status === "DEGRADED" && "border-[var(--v2-warn)]/30",
        svc.status === "OFFLINE" && "border-[var(--v2-loss)]/40 bg-[var(--v2-loss-soft)]/20",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl opacity-30",
          isOnline && "bg-[var(--v2-gain)]",
          svc.status === "DEGRADED" && "bg-[var(--v2-warn)]",
          svc.status === "OFFLINE" && "bg-[var(--v2-loss)]",
        )}
      />
      <div className="relative">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-white">{svc.name}</span>
          <StatusPill
            tone={tone}
            label={svc.status}
            size="sm"
          />
        </div>
        <div className="space-y-1 text-[11px] text-[var(--v2-text-mute)]">
          <div className="flex items-center justify-between">
            <span>P99</span>
            <span className="v2-num font-medium text-white">{svc.p99Ms}ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Uptime</span>
            <span className="v2-num font-medium text-white">{svc.uptime.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Ready</span>
            <span className="truncate font-medium text-white">{svc.ready}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Metric gauge bar ─────────────────────────────────────────────────────────

function MetricGauge({ m }: { m: { name: string; value: number; max: number; unit: string; status: MetricStatus; subtitle?: string } }) {
  const pct = Math.min(100, (m.value / m.max) * 100)
  const tone = METRIC_TONE[m.status]
  return (
    <div className="v2-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--v2-text-faint)]">
          {m.name}
        </span>
        <StatusPill tone={tone} label={m.status} size="sm" />
      </div>
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="v2-num text-2xl font-bold text-white">
          {typeof m.value === "number" ? m.value.toFixed(1) : m.value}
        </span>
        <span className="text-xs text-[var(--v2-text-mute)]">{m.unit}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            tone === "success" && "bg-[var(--v2-gain)]",
            tone === "warning" && "bg-[var(--v2-warn)]",
            tone === "danger" && "bg-[var(--v2-loss)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {m.subtitle && (
        <div className="mt-1.5 text-[10px] text-[var(--v2-text-faint)]">{m.subtitle}</div>
      )}
    </div>
  )
}

// ── Main workbench ───────────────────────────────────────────────────────────

export function ObservabilityWorkbench() {
  const sys = useSystemHealth()
  const mkt = useMarketDataHealth()
  const queue = useQueueStatus()
  const batcher = useQuotesBatcherStatus()

  const health = sys.data?.data
  const traffic = health?.traffic
  const services: ServiceStatus[] = health?.services ?? []
  const metrics = health?.metrics ?? []
  const signals: Signal[] = health?.signals ?? []
  const db = health?.database

  const mktData = mkt.data?.data
  const mktSummary = mktData?.summary
  const freshCount = mktSummary?.fresh ?? 0
  const totalTokens = mktSummary?.total ?? 0
  const staleCount = mktSummary?.stale ?? 0

  const queueData = queue.data
  const batcherData = batcher.data?.data

  const servicesOnline = services.filter((s) => s.status === "ONLINE").length
  const servicesDegraded = services.filter((s) => s.status === "DEGRADED").length
  const servicesOffline = services.filter((s) => s.status === "OFFLINE").length
  const isRefreshing = sys.isLoading || mkt.isLoading

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Observability</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              live · refreshes every 10s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            System health
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--v2-text-mute)]">
            Live system health across all platform services — database, Redis, market-data feed,
            socket gateway, order queues, and the quotes batcher.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--v2-text-faint)]">
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          {health?.meta?.observedAt
            ? `Last ${formatRelativeIst(health.meta.observedAt)}`
            : "Loading…"}
        </div>
      </header>

      {/* Traffic KPI strip */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Services online"
          value={`${servicesOnline} / ${services.length}`}
          tone={servicesOffline > 0 ? "danger" : servicesDegraded > 0 ? "warning" : "success"}
          loading={sys.isLoading}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiTile
          label="Requests / sec"
          value={(traffic?.requestsPerSec ?? 0).toFixed(1)}
          tone="info"
          loading={sys.isLoading}
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Error rate"
          value={`${(traffic?.errorRatePct ?? 0).toFixed(2)}%`}
          tone={(traffic?.errorRatePct ?? 0) > 1 ? "danger" : (traffic?.errorRatePct ?? 0) > 0.1 ? "warning" : "success"}
          loading={sys.isLoading}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiTile
          label="P99 latency"
          value={`${traffic?.p99Ms ?? 0}ms`}
          tone={(traffic?.p99Ms ?? 0) > 500 ? "danger" : (traffic?.p99Ms ?? 0) > 200 ? "warning" : "success"}
          loading={sys.isLoading}
          icon={<Zap className="h-4 w-4" />}
        />
        <KpiTile
          label="DB probe"
          value={`${traffic?.edgeDbProbeMs ?? 0}ms`}
          tone={(traffic?.edgeDbProbeMs ?? 0) > 100 ? "warning" : "success"}
          loading={sys.isLoading}
          icon={<Database className="h-4 w-4" />}
        />
      </section>

      {/* Service status grid */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Services</h2>
        {sys.isLoading && services.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="v2-card h-28 animate-pulse bg-white/[0.04]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {services.map((svc) => (
              <ServiceCard key={svc.name} svc={svc} />
            ))}
          </div>
        )}
      </section>

      {/* System metrics + DB strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Metrics gauges */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-white">System metrics</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sys.isLoading && metrics.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="v2-card h-24 animate-pulse bg-white/[0.04]" />
                ))
              : metrics.map((m) => (
                  <MetricGauge key={m.name} m={m} />
                ))}
          </div>
        </div>

        {/* Database strip */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Database</h2>
          {db ? (
            <div className="v2-card space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--v2-text-mute)]">{db.label}</span>
                <StatusPill tone={SERVICE_TONE[db.status]} label={db.status} size="sm" />
              </div>
              <div className="space-y-2 text-[11px]">
                {[
                  { label: "Connections", value: `${db.connectionsActive} / ${db.connectionsMax}` },
                  { label: "Tx/sec", value: db.txPerSec.toFixed(1) },
                  { label: "Buffer hit", value: `${(db.bufferCacheHitRatio * 100).toFixed(1)}%` },
                  { label: "WAL lag", value: `${db.walLagMs}ms` },
                  { label: "Idle-in-tx", value: db.idleInTransactions },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-[var(--v2-text-mute)]">
                    <span>{label}</span>
                    <span className="v2-num font-medium text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="v2-card h-40 animate-pulse bg-white/[0.04]" />
          )}
        </div>
      </div>

      {/* Market data + Queue row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Market data health */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Radio className="h-4 w-4 text-[var(--v2-text-mute)]" />
            Market data feed
          </h2>
          <div className="v2-card p-4">
            {mkt.isLoading && !mktData ? (
              <div className="h-24 animate-pulse rounded bg-white/[0.04]" />
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  {mktData?.isConnected !== false ? (
                    <Wifi className="h-4 w-4 text-[var(--v2-gain)]" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-[var(--v2-loss)]" />
                  )}
                  <span className="text-xs font-semibold text-white">
                    {mktData?.isConnected !== false ? "Feed connected" : "Feed disconnected"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
                  <div className="rounded-lg bg-[var(--v2-gain-soft)] p-2">
                    <div className="v2-num text-lg font-bold text-[var(--v2-gain)]">{freshCount}</div>
                    <div className="text-[var(--v2-text-mute)]">Fresh</div>
                  </div>
                  <div className="rounded-lg bg-[var(--v2-warn-soft)] p-2">
                    <div className="v2-num text-lg font-bold text-[var(--v2-warn)]">{staleCount}</div>
                    <div className="text-[var(--v2-text-mute)]">Stale</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] p-2">
                    <div className="v2-num text-lg font-bold text-white">{totalTokens}</div>
                    <div className="text-[var(--v2-text-mute)]">Total</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Queue + Batcher */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Layers className="h-4 w-4 text-[var(--v2-text-mute)]" />
            Queues & batcher
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="v2-card p-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                Request queue
              </div>
              {queue.isLoading && !queueData ? (
                <div className="h-16 animate-pulse rounded bg-white/[0.04]" />
              ) : (
                <div className="space-y-1.5 text-[11px]">
                  {[
                    { label: "Pending", value: queueData?.pending ?? "—" },
                    { label: "Processing", value: queueData?.processing ?? "—" },
                    { label: "Concurrency", value: queueData?.maxConcurrency ?? "—" },
                    { label: "Failed", value: queueData?.failed ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-[var(--v2-text-mute)]">
                      <span>{label}</span>
                      <span className="v2-num font-medium text-white">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="v2-card p-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                Quotes batcher
              </div>
              {batcher.isLoading && !batcherData ? (
                <div className="h-16 animate-pulse rounded bg-white/[0.04]" />
              ) : (
                <div className="space-y-1.5 text-[11px]">
                  {[
                    { label: "Subscribed tokens", value: batcherData?.subscribedTokenCount ?? "—" },
                    { label: "Batch count", value: batcherData?.batchCount ?? "—" },
                    { label: "Interval", value: batcherData?.config?.batchIntervalMs ? `${batcherData.config.batchIntervalMs}ms` : "—" },
                    { label: "Max batch", value: batcherData?.config?.maxBatchSize ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-[var(--v2-text-mute)]">
                      <span>{label}</span>
                      <span className="v2-num font-medium text-white">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alert signals */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <ServerCrash className="h-4 w-4 text-[var(--v2-text-mute)]" />
          Recent signals
        </h2>
        <div className="v2-card overflow-hidden">
          {sys.isLoading && signals.length === 0 ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--v2-text-mute)]">
              No recent signals
            </div>
          ) : (
            <ol className="divide-y divide-white/[0.04]">
              {signals.map((sig, i) => {
                const tone = SIGNAL_TONE[sig.severity]
                return (
                  <li key={i} className="flex items-center gap-4 px-4 py-2.5">
                    <StatusPill tone={tone} label={sig.severity} size="sm" />
                    <span className="w-28 shrink-0 text-[11px] font-medium text-[var(--v2-text-mute)]">
                      {sig.source}
                    </span>
                    <span className="flex-1 truncate text-xs text-[var(--v2-text)]">
                      {sig.message}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--v2-text-faint)]">
                      {formatRelativeIst(sig.at)}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
