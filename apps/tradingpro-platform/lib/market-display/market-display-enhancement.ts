/**
 * @file market-display-enhancement.ts
 * @module market-display
 * @description Pure helpers for jitter, deviation, trend, easing, and clamps for market display.
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-24
 */

import type { InterpolationEasingMode, MarketDataConfig } from "@/lib/market-data/providers/types"

export function calculateJitter(
  basePrice: number,
  intensity: number,
  convergence: number,
  currentJitter: number,
): number {
  const maxJitter = basePrice * (intensity / 100) || intensity
  const randomJitter = (Math.random() - 0.5) * 2 * maxJitter
  return currentJitter * (1 - convergence) + randomJitter * convergence
}

/**
 * Clamp absolute jitter offset to a max % of LTP (percent points, e.g. 0.2 => 0.2%).
 */
export function clampJitterByPctOfLtp(jitter: number, ltp: number, maxAbsPctOfLtp: number): number {
  if (!Number.isFinite(ltp) || ltp <= 0 || !Number.isFinite(maxAbsPctOfLtp) || maxAbsPctOfLtp <= 0) {
    return jitter
  }
  const cap = (ltp * maxAbsPctOfLtp) / 100
  if (!Number.isFinite(cap) || cap <= 0) return jitter
  return Math.max(-cap, Math.min(cap, jitter))
}

export function applyInterpolationEasing(t: number, mode: InterpolationEasingMode): number {
  const x = Math.min(1, Math.max(0, t))
  if (mode === "easeOut") {
    return 1 - (1 - x) * (1 - x)
  }
  return x
}

/**
 * Quantize progress into `steps` discrete plateaus (0 .. 1).
 */
export function steppedProgress(rawProgress: number, steps: number): number {
  const n = Math.max(1, Math.trunc(steps))
  const p = Math.min(1, Math.max(0, rawProgress))
  if (n <= 1) return p
  const stepIndex = Math.min(n - 1, Math.floor(p * n))
  return stepIndex / (n - 1)
}

export function calculateDeviation(
  basePrice: number,
  config: MarketDataConfig["deviation"],
): number {
  if (!config.enabled) return 0
  const percentageDeviation = basePrice * (config.percentage / 100)
  return percentageDeviation + config.absolute
}

export function calculateTrend(
  currentPrice: number,
  previousPrice: number,
): "up" | "down" | "neutral" {
  const diff = currentPrice - previousPrice
  if (Math.abs(diff) < 0.01) return "neutral"
  return diff > 0 ? "up" : "down"
}

export function linearInterpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}
