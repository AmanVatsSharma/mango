import { z } from 'zod'

// Centralized runtime configuration with env validation and safe defaults.
// All toggles are environment-driven to keep changes reversible.

const Bool = z
  .string()
  .transform(v => v === '1' || v?.toLowerCase?.() === 'true')
  .optional()

const ConfigSchema = z.object({
  // Feature flags
  FEATURE_ENABLE_METRICS: Bool,
  FEATURE_ENABLE_SENTRY: Bool,
  FEATURE_ENABLE_CACHE: Bool,
  FEATURE_ENABLE_SWR: Bool,
  FEATURE_ENABLE_RATE_LIMIT: Bool,
  FEATURE_ENABLE_BATCHING: Bool,
  FEATURE_ENABLE_CIRCUIT_BREAKER: Bool,
  FEATURE_ALLOW_ADMIN_LOADTEST: Bool,

  // API cache controls (server-side)
  API_CACHE_TTL_MS: z.coerce.number().min(0).max(60_000).optional(),
  API_CACHE_STALE_MS: z.coerce.number().min(0).max(120_000).optional(),

  // Batching / upstream queue
  REQUEST_QUEUE_MIN_INTERVAL_MS: z.coerce.number().min(100).max(10_000).optional(),
  REQUEST_QUEUE_MAX_REQUESTS_PER_MINUTE: z.coerce.number().min(1).max(600).optional(),

  // Per-IP rate limit (quotes)
  QUOTES_RATELIMIT_WINDOW_MS: z.coerce.number().min(200).max(60_000).optional(),
  QUOTES_RATELIMIT_MAX: z.coerce.number().min(1).max(1000).optional(),

  // Metrics histogram buckets (comma-separated numbers in ms)
  METRICS_DURATION_BUCKETS_MS: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
})

export type RuntimeConfig = ReturnType<typeof loadConfig>

let cached: ReturnType<typeof loadConfig> | null = null

function parseBuckets(input?: string): number[] | undefined {
  if (!input) return undefined
  const arr = input
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

export function loadConfig() {
  if (cached) return cached

  const parsed = ConfigSchema.safeParse(process.env)
  if (!parsed.success) {
    // Fail-open with defaults but log error
    // eslint-disable-next-line no-console
    console.error('[config] Invalid environment configuration', parsed.error?.flatten())
  }

  const env = parsed.success ? parsed.data : ({} as any)

  const durationBuckets = parseBuckets(env.METRICS_DURATION_BUCKETS_MS) || [
    50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000
  ]

  cached = {
    feature: {
      metrics: env.FEATURE_ENABLE_METRICS ?? true,
      sentry: env.FEATURE_ENABLE_SENTRY ?? false,
      cache: env.FEATURE_ENABLE_CACHE ?? true,
      swr: env.FEATURE_ENABLE_SWR ?? true,
      rateLimit: env.FEATURE_ENABLE_RATE_LIMIT ?? true,
      batching: env.FEATURE_ENABLE_BATCHING ?? true,
      circuitBreaker: env.FEATURE_ENABLE_CIRCUIT_BREAKER ?? true,
      allowAdminLoadtest: env.FEATURE_ALLOW_ADMIN_LOADTEST ?? true,
    },
    cache: {
      apiTtlMs: env.API_CACHE_TTL_MS ?? 2000,
      apiStaleMs: env.API_CACHE_STALE_MS ?? 5000,
    },
    queue: {
      minIntervalMs: env.REQUEST_QUEUE_MIN_INTERVAL_MS ?? 1000,
      maxRequestsPerMinute: env.REQUEST_QUEUE_MAX_REQUESTS_PER_MINUTE ?? 60,
    },
    rateLimit: {
      quotesWindowMs: env.QUOTES_RATELIMIT_WINDOW_MS ?? 1000,
      quotesMax: env.QUOTES_RATELIMIT_MAX ?? 1,
    },
    metrics: {
      durationBuckets,
    },
    sentry: {
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    },
  }

  return cached
}

export const config = loadConfig()
