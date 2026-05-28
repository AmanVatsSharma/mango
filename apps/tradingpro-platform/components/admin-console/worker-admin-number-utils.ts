/**
 * @file worker-admin-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for workers admin dashboard formatting and run-once parameter shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

function normalizeInteger(value: unknown, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  return parsedValue === null ? fallback : Math.trunc(parsedValue)
}

export function formatWorkerAdminNumber(value: unknown): string {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return "—"
  }
  return String(parsedValue)
}

export function formatWorkerAdminDurationMs(value: unknown): string {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return "—"
  }
  if (parsedValue < 1000) {
    return `${Math.trunc(parsedValue)} ms`
  }
  return `${(parsedValue / 1000).toFixed(2)} s`
}

export function normalizeOrderWorkerRunOnceParams(input: {
  limit?: unknown
  maxAgeMs?: unknown
}): { limit: number; maxAgeMs: number } {
  return {
    limit: Math.max(1, Math.min(200, normalizeInteger(input.limit, 25))),
    maxAgeMs: Math.max(0, normalizeInteger(input.maxAgeMs, 0)),
  }
}

export function normalizePositionWorkerRunOnceParams(input: {
  limit?: unknown
  updateThreshold?: unknown
  dryRun?: unknown
}): { limit: number; updateThreshold: number; dryRun: boolean } {
  const parsedUpdateThreshold = parseFiniteWorkerNumber(input.updateThreshold)
  return {
    limit: Math.max(1, Math.min(2000, normalizeInteger(input.limit, 500))),
    updateThreshold: parsedUpdateThreshold === null ? 1 : Math.max(0, parsedUpdateThreshold),
    dryRun: Boolean(input.dryRun),
  }
}
