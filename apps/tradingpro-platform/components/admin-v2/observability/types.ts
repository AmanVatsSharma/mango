/**
 * File:        components/admin-v2/observability/types.ts
 * Module:      admin-v2/observability
 * Purpose:     UI-side DTOs for the Phase 16 Observability Dashboard. Mirrors the response
 *              shapes of /api/admin/system/health, /api/admin/market-data-health,
 *              /api/admin/queue-status, and /api/admin/quotes-batcher-status.
 *
 * Exports:
 *   - ServiceStatusKind         — "ONLINE" | "OFFLINE" | "DEGRADED"
 *   - MetricStatus              — "HEALTHY" | "WARNING" | "CRITICAL"
 *   - SignalSeverity            — alert signal severity
 *   - ServiceStatus             — individual service health record
 *   - SystemMetric              — CPU/memory/event-loop gauge
 *   - DatabaseStrip             — PostgreSQL connection pool summary
 *   - Signal                    — recent alert signal
 *   - Dependency                — external dependency health record
 *   - SystemHealthResp          — /api/admin/system/health response
 *   - MarketDataHealthResp      — /api/admin/market-data-health response
 *   - QueueStatusResp           — /api/admin/queue-status response
 *   - QuotesBatcherStatusResp   — /api/admin/quotes-batcher-status response
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export type ServiceStatusKind = "ONLINE" | "OFFLINE" | "DEGRADED"
export type MetricStatus = "HEALTHY" | "WARNING" | "CRITICAL"
export type SignalSeverity = "INFO" | "LOW" | "WARN" | "CRITICAL"

export interface ServiceStatus {
  name: string
  status: ServiceStatusKind
  uptime: number
  lastCheck: string
  responseTime: number
  version: string
  ready: string
  p99Ms: number
}

export interface SystemMetric {
  name: string
  value: number
  max: number
  unit: string
  status: MetricStatus
  trend?: "up" | "down"
  subtitle?: string
}

export interface DatabaseStrip {
  label: string
  connectionsActive: number
  connectionsMax: number
  status: ServiceStatusKind
  walLagMs: number
  bufferCacheHitRatio: number
  txPerSec: number
  idleInTransactions: number
}

export interface Signal {
  severity: SignalSeverity
  source: string
  message: string
  at: string
}

export interface Dependency {
  name: string
  status: ServiceStatusKind
  latencyMs: number
  lastOkAt: string
}

export interface SystemTraffic {
  requestsPerSec: number
  errorRatePct: number
  p50Ms: number
  p99Ms: number
  edgeDbProbeMs: number
}

export interface SystemHealthResp {
  success: boolean
  data: {
    meta: {
      observedAt: string
      scrapeIntervalMs: number
      environment: string
      cluster: string
    }
    traffic: SystemTraffic
    metrics: SystemMetric[]
    services: ServiceStatus[]
    database: DatabaseStrip
    signals: Signal[]
    dependencies: Dependency[]
  }
}

export interface MarketDataHealthResp {
  success: boolean
  data: {
    health: Array<{
      token: string
      symbol?: string
      status: "fresh" | "stale_or_missing" | "feed_disconnected"
      ageMs?: number
      lastTradePrice?: number
    }>
    summary?: {
      total: number
      fresh: number
      stale: number
      disconnected: number
    }
    isConnected?: boolean
  }
}

export interface QueueStatusResp {
  pending?: number
  processing?: number
  completed?: number
  failed?: number
  maxConcurrency?: number
  [key: string]: unknown
}

export interface QuotesBatcherStatusResp {
  success: boolean
  data: {
    batchCount?: number
    lastBatchAt?: string
    subscribedTokenCount?: number
    config?: {
      batchIntervalMs?: number
      maxBatchSize?: number
    }
    [key: string]: unknown
  }
}
