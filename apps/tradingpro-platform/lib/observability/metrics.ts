import client, { Registry, Histogram, Counter } from 'prom-client'
import { config } from '@/lib/config/runtime'

// Prometheus metrics registry and common metrics used across the API layer.
// Gated by feature flag for safe rollouts.

export const registry: Registry = new client.Registry()

if (config.feature.metrics) {
  client.collectDefaultMetrics({ register: registry })
}

const buckets = config.metrics.durationBuckets.map(n => n / 1000) // seconds

export const requestCount = new Counter({
  name: 'request_count',
  help: 'Total API requests',
  labelNames: ['route', 'method', 'status'],
})

export const requestDuration = new Histogram({
  name: 'request_duration_seconds',
  help: 'Request duration in seconds',
  buckets,
  labelNames: ['route', 'method', 'status'],
})

export const upstreamLatency = new Histogram({
  name: 'upstream_latency_seconds',
  help: 'Latency of upstream calls in seconds',
  buckets,
  labelNames: ['route', 'upstream'],
})

export const cacheHits = new Counter({
  name: 'cache_hits',
  help: 'Cache hit count',
  labelNames: ['route'],
})

export const cacheMiss = new Counter({
  name: 'cache_miss',
  help: 'Cache miss count',
  labelNames: ['route'],
})

export const upstreamErrors = new Counter({
  name: 'upstream_errors',
  help: 'Upstream errors count',
  labelNames: ['route', 'upstream'],
})

export const circuitBreakerOpen = new Counter({
  name: 'circuit_breaker_open',
  help: 'Circuit breaker opened events',
  labelNames: ['route'],
})

registry.registerMetric(requestCount)
registry.registerMetric(requestDuration)
registry.registerMetric(upstreamLatency)
registry.registerMetric(cacheHits)
registry.registerMetric(cacheMiss)
registry.registerMetric(upstreamErrors)
registry.registerMetric(circuitBreakerOpen)

export async function metricsText(): Promise<string> {
  return registry.metrics()
}
