/**
 * @file client-logger.ts
 * @module lib/logging
 * @description Client-side structured console logger with namespaces, levels, and basic throttling/sampling.
 * @author StockTrade
 * @created 2026-01-24
 */

"use client"

export type ClientLogLevel = "debug" | "info" | "warn" | "error"

export type ClientLogger = {
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
  throttled: (key: string, intervalMs: number, level: ClientLogLevel, ...args: any[]) => void
}

type CreateClientLoggerOptions = {
  /**
   * If true, debug logs are enabled in production.
   * Default: controlled by NEXT_PUBLIC_DEBUG (or NODE_ENV !== 'production').
   */
  forceDebug?: boolean
}

const lastLogAt = new Map<string, number>()

function isDebugEnabled(force?: boolean) {
  if (force) return true
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEBUG === "true") return true
  return typeof process !== "undefined" ? process.env.NODE_ENV !== "production" : true
}

export function createClientLogger(namespace: string, opts: CreateClientLoggerOptions = {}): ClientLogger {
  const debugEnabled = isDebugEnabled(opts.forceDebug)

  const prefix = `[${namespace}]`
  const dbg = (...args: any[]) => {
    if (!debugEnabled) return
    console.debug(prefix, ...args)
  }

  return {
    debug: dbg,
    info: (...args: any[]) => console.info(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    throttled: (key: string, intervalMs: number, level: ClientLogLevel, ...args: any[]) => {
      const now = Date.now()
      const fullKey = `${namespace}:${key}`
      const last = lastLogAt.get(fullKey) ?? 0
      if (now - last < intervalMs) return
      lastLogAt.set(fullKey, now)
      const fn =
        level === "debug"
          ? dbg
          : level === "info"
            ? (...a: any[]) => console.info(prefix, ...a)
            : level === "warn"
              ? (...a: any[]) => console.warn(prefix, ...a)
              : (...a: any[]) => console.error(prefix, ...a)
      fn(...args)
    },
  }
}

// Pre-configured logger for client components (e.g. settings.tsx uses logger.info({ requestId }, msg))
export const logger = createClientLogger("app")

