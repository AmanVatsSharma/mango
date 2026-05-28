import * as Sentry from '@sentry/node'
import { config } from '@/lib/config/runtime'

let initialized = false

export function initSentry() {
  if (initialized || !config.feature.sentry || !config.sentry.dsn) return
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      // PII safe filters
      if (event.request) {
        delete (event.request as any).headers
        delete (event.request as any).cookies
      }
      return event
    },
  })
  initialized = true
}

export function captureError(error: any, context?: Record<string, any>) {
  try {
    initSentry()
    if (!initialized) return
    Sentry.withScope(scope => {
      if (context) {
        Object.entries(context).forEach(([k, v]) => scope.setTag(k, String(v)))
      }
      Sentry.captureException(error)
    })
  } catch {}
}
