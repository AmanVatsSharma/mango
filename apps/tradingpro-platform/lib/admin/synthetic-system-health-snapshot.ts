/**
 * @file synthetic-system-health-snapshot.ts
 * @module admin
 * @description Deterministic observability-style synthetic health snapshot for admin demo UX (replace with real telemetry in production).
 * @author StockTrade
 * @created 2026-03-20
 * @updated 2026-03-25
 *
 * Notes:
 * - No Math.random; IDs and jitter use 32-bit mixing + sin waves from `nowMs`.
 * - `meta.observedAt` and `traffic.edgeDbProbeMs` are intended to be set in the API route.
 */

const TAU = Math.PI * 2

function sinWave(nowMs: number, periodMs: number, phaseRad = 0): number {
  return Math.sin((nowMs / periodMs) * TAU + phaseRad)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function mix32(n: number): number {
  let x = (Math.floor(n) ^ 0xdeadbeef) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

/** Lowercase hex string of length `hexLen` (deterministic). */
function hexFromNow(nowMs: number, salt: number, hexLen: number): string {
  let out = ""
  let s = mix32(nowMs + salt) >>> 0
  while (out.length < hexLen) {
    s = mix32(s + 0x41457003 + salt) >>> 0
    out += s.toString(16).padStart(8, "0")
  }
  return out.slice(0, hexLen)
}

function metricStatusPct(value: number): "HEALTHY" | "WARNING" | "CRITICAL" {
  if (value < 72) return "HEALTHY"
  if (value < 88) return "WARNING"
  return "CRITICAL"
}

function trendFromDelta(nowMs: number, deltaMs: number, current: number, valueAt: (t: number) => number): "up" | "down" {
  const prev = valueAt(nowMs - deltaMs)
  if (current > prev) return "up"
  if (current < prev) return "down"
  return "up"
}

export type SyntheticSystemMetricStatus = "HEALTHY" | "WARNING" | "CRITICAL"
export type SyntheticServiceStatusKind = "ONLINE" | "OFFLINE" | "DEGRADED"
export type SyntheticSignalSeverity = "INFO" | "LOW" | "WARN" | "CRITICAL"

export interface SyntheticMeta {
  /** Set server-side in route for wall-clock truth. */
  observedAt?: string
  scrapeIntervalMs: number
  collectorVersion: string
  environment: string
  cluster: string
  region: string
  podName: string
  replicaSet: string
}

export interface SyntheticCorrelation {
  checkId: string
  traceId: string
  parentSpanId: string
}

export interface SyntheticTraffic {
  requestsPerSec: number
  errorRatePct: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  /** Filled in route with real Prisma ping ms when available. */
  edgeDbProbeMs?: number
}

export interface SyntheticRuntime {
  eventLoopLagMs: number
  gcPauseP99Ms: number
}

export interface SyntheticSystemMetric {
  name: string
  value: number
  max: number
  unit: string
  status: SyntheticSystemMetricStatus
  trend?: "up" | "down"
  subtitle?: string
}

export interface SyntheticServiceStatus {
  name: string
  status: SyntheticServiceStatusKind
  uptime: number
  lastCheck: Date
  responseTime: number
  version: string
  ready: string
  p99Ms: number
}

export interface SyntheticDatabaseStrip {
  label: string
  connectionsActive: number
  connectionsMax: number
  status: SyntheticServiceStatusKind
  walLagMs: number
  bufferCacheHitRatio: number
  txPerSec: number
  idleInTransactions: number
}

export interface SyntheticSignal {
  severity: SyntheticSignalSeverity
  source: string
  message: string
  at: string
}

export interface SyntheticDependency {
  name: string
  status: SyntheticServiceStatusKind
  latencyMs: number
  lastOkAt: Date
}

export interface SyntheticSystemHealthSnapshot {
  meta: SyntheticMeta
  correlation: SyntheticCorrelation
  traffic: SyntheticTraffic
  runtime: SyntheticRuntime
  metrics: SyntheticSystemMetric[]
  services: SyntheticServiceStatus[]
  database: SyntheticDatabaseStrip
  signals: SyntheticSignal[]
  dependencies: SyntheticDependency[]
}

function cpuFloat(nowMs: number): number {
  return (
    44 +
    16 * sinWave(nowMs, 95_000, 0.7) +
    3 * sinWave(nowMs, 8_200, 0.2) +
    2 * sinWave(nowMs, 31_000, 1.3)
  )
}

function memoryFloat(nowMs: number, cpu: number): number {
  return (
    56 +
    0.38 * (cpu - 44) +
    14 * sinWave(nowMs, 112_000, 1.1) +
    3 * sinWave(nowMs, 19_000, 0.5)
  )
}

function diskFloat(nowMs: number): number {
  return 50 + 9 * sinWave(nowMs, 420_000, 2.3) + 2 * sinWave(nowMs, 67_000, 0.9)
}

function networkFloat(nowMs: number): number {
  return (
    32 +
    28 * sinWave(nowMs, 76_000, 3.0) +
    5 * sinWave(nowMs, 14_000, 1.7) +
    4 * sinWave(nowMs, 41_000, 2.2)
  )
}

function roundUptime(n: number): number {
  return Math.round(n * 100) / 100
}

function semverCollector(nowMs: number): string {
  const m = mix32(nowMs + 11)
  const patch = m % 47
  const minor = 14 + ((m >>> 8) % 4)
  const tag = hexFromNow(nowMs, 3, 7)
  return `1.${minor}.${patch}+${tag}`
}

function buildMeta(nowMs: number): SyntheticMeta {
  const h = hexFromNow(nowMs, 1, 6)
  const r = mix32(nowMs + 99) % 3
  const regions = ["ap-south-1", "ap-south-1b", "ap-south-1c"]
  return {
    scrapeIntervalMs: 15_000,
    collectorVersion: semverCollector(nowMs),
    environment: "production",
    cluster: `trade-prod-${h.slice(0, 4)}`,
    region: regions[r] ?? "ap-south-1",
    podName: `api-gateway-${h}`,
    replicaSet: `api-gateway-${hexFromNow(nowMs, 2, 4)}`,
  }
}

function buildCorrelation(nowMs: number): SyntheticCorrelation {
  const slowPhase = Math.floor(nowMs / 90_000)
  const traceBase = hexFromNow(slowPhase * 90_000, 40, 32)
  const checkId = hexFromNow(nowMs, 7, 8)
  return {
    checkId,
    traceId: traceBase,
    parentSpanId: hexFromNow(nowMs, 8, 16),
  }
}

function buildSignals(nowMs: number): SyntheticSignal[] {
  const hour = Math.floor(nowMs / 3_600_000)
  const baseT = hour * 3_600_000
  const rot = hour % 4
  const catalog: Omit<SyntheticSignal, "at">[] = [
    { severity: "INFO", source: "otel-collector", message: "Export batch flushed; no dropped spans in window." },
    { severity: "LOW", source: "k8s-hpa", message: "Replicas within target; cooldown prevents scale oscillation." },
    {
      severity: "INFO",
      source: "circuit-breaker",
      message: "Upstream idp-broker half-open probe succeeded; breaker closed.",
    },
    { severity: "WARN", source: "redis-cluster", message: "Cross-AZ replica lag exceeded 25ms for 2 scrapes (auto-mitigating)." },
    { severity: "INFO", source: "pgbouncer", message: "Pool saturation below 72%; waiting clients stable." },
    { severity: "LOW", source: "cdn-edge", message: "Cache freshness SLO met; origin shield bytes reduced 4.1% WoW." },
  ]
  const picked = [catalog[rot % catalog.length]!, catalog[(rot + 2) % catalog.length]!, catalog[(rot + 4) % catalog.length]!, catalog[(rot + 1) % catalog.length]!]
  return picked.map((p, i) => ({
    ...p,
    at: new Date(baseT - (i + 1) * 47_000 + (hour % 13) * 1_100).toISOString(),
  }))
}

function buildDependencies(nowMs: number): SyntheticDependency[] {
  const lastOk = (offsetMs: number) => new Date(nowMs - offsetMs)
  const idpLat = Math.round(clamp(12 + 9 * sinWave(nowMs, 52_000, 0.1), 6, 38))
  const smtpLat = Math.round(clamp(45 + 20 * sinWave(nowMs, 88_000, 1.2), 28, 120))
  const mktLat = Math.round(clamp(3 + 4 * sinWave(nowMs, 19_000, 0.4), 2, 18))
  return [
    { name: "IdP / OAuth broker", status: "ONLINE", latencyMs: idpLat, lastOkAt: lastOk(4_200) },
    { name: "Transactional email relay", status: "ONLINE", latencyMs: smtpLat, lastOkAt: lastOk(19_000) },
    { name: "Market-data fanout bridge", status: "ONLINE", latencyMs: mktLat, lastOkAt: lastOk(1_100) },
  ]
}

/**
 * Builds a single health snapshot for `nowMs` (typically `Date.now()`).
 */
export function buildSyntheticSystemHealthSnapshot(nowMs: number): SyntheticSystemHealthSnapshot {
  const cpuF = cpuFloat(nowMs)
  const cpu = Math.round(clamp(cpuF, 29, 76))
  const mem = Math.round(clamp(memoryFloat(nowMs, cpuF), 51, 86))
  const disk = Math.round(clamp(diskFloat(nowMs), 41, 64))
  const net = Math.round(clamp(networkFloat(nowMs), 12, 82))

  const load1m = clamp(0.85 + 0.55 * sinWave(nowMs, 72_000, 0.4) + 0.15 * sinWave(nowMs, 11_000, 1.0), 0.4, 2.2)
  const steal = clamp(0.15 + 0.85 * sinWave(nowMs, 55_000, 1.1), 0.05, 1.4)
  const anon = clamp(38 + 0.22 * (mem - 58), 28, 58)
  const slab = clamp(12 + 0.08 * (mem - 55), 6, 22)
  const ioWait = clamp(0.4 + 1.2 * sinWave(nowMs, 48_000, 0.7), 0.05, 3.2)
  const softIrq = clamp(0.2 + 0.6 * sinWave(nowMs, 33_000, 0.2), 0.05, 1.8)

  const metrics: SyntheticSystemMetric[] = [
    {
      name: "CPU Usage",
      value: cpu,
      max: 100,
      unit: "%",
      status: metricStatusPct(cpu),
      trend: trendFromDelta(nowMs, 28_000, cpu, (t) => Math.round(clamp(cpuFloat(t), 29, 76))),
      subtitle: `load1m ${load1m.toFixed(2)} · steal ${steal.toFixed(1)}%`,
    },
    {
      name: "Memory Usage",
      value: mem,
      max: 100,
      unit: "%",
      status: metricStatusPct(mem),
      trend: trendFromDelta(nowMs, 28_000, mem, (t) =>
        Math.round(clamp(memoryFloat(t, cpuFloat(t)), 51, 86)),
      ),
      subtitle: `anon ${anon.toFixed(1)}% · slab ${slab.toFixed(1)}%`,
    },
    {
      name: "Disk Usage",
      value: disk,
      max: 100,
      unit: "%",
      status: metricStatusPct(disk),
      trend: trendFromDelta(nowMs, 28_000, disk, (t) => Math.round(clamp(diskFloat(t), 41, 64))),
      subtitle: `iowait ${ioWait.toFixed(2)}% · softirq ${softIrq.toFixed(2)}%`,
    },
    {
      name: "Network I/O",
      value: net,
      max: 100,
      unit: "%",
      status: metricStatusPct(net),
      trend: trendFromDelta(nowMs, 28_000, net, (t) => Math.round(clamp(networkFloat(t), 12, 82))),
      subtitle: `burst qdisc · BBR pacing on`,
    },
  ]

  const loadSpike = sinWave(nowMs, 195_000, 0.15) > 0.94
  const cacheDegraded = sinWave(nowMs, 178_000, 0.4) > 0.86

  const apiRt = Math.round(
    clamp(32 + 18 * sinWave(nowMs, 48_000, 0.2) + (loadSpike ? 22 : 0) + 4 * sinWave(nowMs, 11_000, 1.0), 18, 120),
  )
  const wsRt = Math.round(clamp(5 + 5 * sinWave(nowMs, 36_000, 1.4) + 2 * sinWave(nowMs, 9_000, 0.3), 3, 22))
  const cacheRt = cacheDegraded
    ? Math.round(clamp(18 + 8 * sinWave(nowMs, 25_000, 0.8), 14, 45))
    : Math.round(clamp(2 + 4 * sinWave(nowMs, 22_000, 1.1), 1, 12))

  const pScale = loadSpike ? 1.35 : 1
  const baseP50 = clamp(18 + 12 * sinWave(nowMs, 60_000, 0.3) + (loadSpike ? 8 : 0), 12, 55)
  const p50Ms = Math.round(baseP50 * pScale)
  const p95Ms = Math.round(clamp(p50Ms * 2.4 + 6 * sinWave(nowMs, 21_000, 0.5), 28, 180))
  const p99Ms = Math.round(clamp(p95Ms * 1.65 + (loadSpike ? 28 : 10), 45, 320))
  const rps = Math.round(clamp(420 + 190 * sinWave(nowMs, 100_000, 0.8) + (loadSpike ? 85 : 0), 220, 980))
  const errBump = loadSpike ? 0.04 : 0
  const errorRatePct = Math.round((0.018 + 0.07 * (1 + sinWave(nowMs, 130_000, 0.2)) * 0.5 + errBump) * 1000) / 1000

  const evLag = Math.round(clamp(2.2 + 4.5 * (cpu / 100) + 2 * sinWave(nowMs, 16_000, 0.3), 1.2, 18))
  const gcP99 = Math.round(clamp(8 + 0.35 * mem + 6 * sinWave(nowMs, 44_000, 1.0), 4, 42))

  const traffic: SyntheticTraffic = {
    requestsPerSec: rps,
    errorRatePct,
    p50Ms,
    p95Ms,
    p99Ms,
  }

  const runtime: SyntheticRuntime = {
    eventLoopLagMs: evLag,
    gcPauseP99Ms: gcP99,
  }

  const lastCheck = new Date(nowMs)

  const verApi = `v2.${8 + (mix32(nowMs) % 6)}.${(mix32(nowMs + 1) >>> 8) % 52}+${hexFromNow(nowMs, 5, 6)}`
  const verDb = `v15.${3 + (mix32(nowMs + 2) % 3)}.${(mix32(nowMs + 3) >>> 4) % 41}`
  const verWs = `v4.${1 + (mix32(nowMs + 4) % 5)}.${(mix32(nowMs + 5) >>> 12) % 88}+ws`
  const verCache = `v7.2.${(mix32(nowMs + 6) >>> 3) % 30}+redis`

  const p99Api = Math.round(clamp(apiRt * 1.8, 24, 200))
  const pWs = Math.round(clamp(wsRt * 2.1, 8, 55))
  const pCache = cacheDegraded ? Math.round(cacheRt * 3.2) : Math.round(cacheRt * 2.4)

  const services: SyntheticServiceStatus[] = [
    {
      name: "API Server",
      status: "ONLINE",
      uptime: roundUptime(clamp(99.88 + 0.06 * sinWave(nowMs, 200_000, 0.1), 99.72, 99.97)),
      lastCheck,
      responseTime: apiRt,
      version: verApi,
      ready: "3/3",
      p99Ms: p99Api,
    },
    {
      name: "Database",
      status: "ONLINE",
      uptime: roundUptime(clamp(99.82 + 0.05 * sinWave(nowMs, 240_000, 0.6), 99.65, 99.95)),
      lastCheck,
      responseTime: 10,
      version: verDb,
      ready: "3/3",
      p99Ms: Math.round(clamp(28 + 14 * sinWave(nowMs, 50_000, 0.2), 18, 95)),
    },
    {
      name: "WebSocket",
      status: "ONLINE",
      uptime: roundUptime(clamp(99.79 + 0.07 * sinWave(nowMs, 180_000, 1.2), 99.6, 99.94)),
      lastCheck,
      responseTime: wsRt,
      version: verWs,
      ready: "3/3",
      p99Ms: pWs,
    },
    {
      name: "Cache",
      status: cacheDegraded ? "DEGRADED" : "ONLINE",
      uptime: cacheDegraded
        ? roundUptime(clamp(98.35 + 0.4 * sinWave(nowMs, 90_000, 0.5), 97.9, 99.2))
        : roundUptime(clamp(99.71 + 0.05 * sinWave(nowMs, 220_000, 0.9), 99.55, 99.92)),
      lastCheck,
      responseTime: cacheRt,
      version: verCache,
      ready: cacheDegraded ? "2/3" : "3/3",
      p99Ms: pCache,
    },
  ]

  const connectionsActive = Math.round(
    clamp(30 + 12 * sinWave(nowMs, 88_000, 0.3) + 4 * sinWave(nowMs, 15_000, 1.0), 19, 49),
  )
  const walLag = Math.round(clamp(2 + 8 * sinWave(nowMs, 63_000, 0.5), 1, 34))
  const bufHit = Math.round((96.5 + 3 * (0.5 + 0.5 * sinWave(nowMs, 120_000, 0.6))) * 10) / 10
  const txPer = Math.round(clamp(1_200 + 480 * sinWave(nowMs, 90_000, 0.9), 650, 2_200))
  const idleTx = Math.floor(clamp(1 + 3 * (0.5 + 0.5 * sinWave(nowMs, 70_000, 1.2)), 0, 7))

  const database: SyntheticDatabaseStrip = {
    label: "PostgreSQL",
    connectionsActive,
    connectionsMax: 100,
    status: "ONLINE",
    walLagMs: walLag,
    bufferCacheHitRatio: bufHit,
    txPerSec: txPer,
    idleInTransactions: idleTx,
  }

  return {
    meta: buildMeta(nowMs),
    correlation: buildCorrelation(nowMs),
    traffic,
    runtime,
    metrics,
    services,
    database,
    signals: buildSignals(nowMs),
    dependencies: buildDependencies(nowMs),
  }
}
