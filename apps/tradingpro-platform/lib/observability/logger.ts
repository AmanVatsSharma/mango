import pino from 'pino'
import { randomUUID } from 'crypto'

// Minimal pino wrapper producing structured JSON logs
// Includes helpers to bind request context (requestId, ip)

export interface RequestLogContext {
  requestId?: string
  ip?: string | null
  route?: string
}

export const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
  formatters: {
    level(label) {
      return { level: label }
    },
  },
})

export function withRequest(ctx: RequestLogContext) {
  return baseLogger.child({
    requestId: ctx.requestId || randomUUID(),
    ip: ctx.ip || undefined,
    route: ctx.route,
  })
}

export type QuoteLogFields = {
  cacheStatus?: 'hit' | 'miss' | 'stale' | 'bypass'
  cacheKey?: string
  upstreamLatencyMs?: number
  batchId?: string
  circuitState?: 'open' | 'half_open' | 'closed'
  statusCode?: number
}
