/**
 * @file worker-script-env.ts
 * @module scripts
 * @description Shared env-number parsing helpers for long-running worker scripts.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

type NumberBounds = {
  min?: number
  max?: number
}

export function parseFiniteEnvNumber(raw: unknown): number | null {
  return parseFiniteWorkerNumber(raw)
}

function clampNumberBounds(value: number, bounds?: NumberBounds): number {
  if (!bounds) {
    return value
  }
  if (typeof bounds.min === "number" && Number.isFinite(bounds.min)) {
    value = Math.max(bounds.min, value)
  }
  if (typeof bounds.max === "number" && Number.isFinite(bounds.max)) {
    value = Math.min(bounds.max, value)
  }
  return value
}

export function normalizeScriptIntEnv(raw: unknown, fallback: number, bounds?: NumberBounds): number {
  const parsedValue = parseFiniteEnvNumber(raw)
  const normalizedValue = parsedValue === null ? fallback : Math.trunc(parsedValue)
  return Math.trunc(clampNumberBounds(normalizedValue, bounds))
}

export function normalizeScriptFloatEnv(raw: unknown, fallback: number, bounds?: NumberBounds): number {
  const parsedValue = parseFiniteEnvNumber(raw)
  const normalizedValue = parsedValue === null ? fallback : parsedValue
  return clampNumberBounds(normalizedValue, bounds)
}
