/**
 * @file market-data-config-number-utils.ts
 * @module components
 * @description Strict numeric normalization helpers for market-data configuration control inputs.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

function normalizeFiniteClampedNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsedValue = parseFiniteMarketNumber(value)
  const finiteValue = parsedValue === null ? fallback : parsedValue
  const lowerBounded = min === undefined ? finiteValue : Math.max(min, finiteValue)
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded)
}

function normalizeFiniteClampedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const normalizedValue = normalizeFiniteClampedNumber(value, fallback, min, max)
  return Math.trunc(normalizedValue)
}

export function normalizeJitterIntervalInput(value: unknown): number {
  return normalizeFiniteClampedInteger(value, 250, 100, 1000)
}

export function normalizeJitterIntensityInput(value: unknown): number {
  return normalizeFiniteClampedNumber(value, 0.15, 0, 1)
}

export function normalizeJitterConvergenceInput(value: unknown): number {
  return normalizeFiniteClampedNumber(value, 0.1, 0, 1)
}

export function normalizeDeviationPercentageInput(value: unknown): number {
  return normalizeFiniteClampedNumber(value, 0, 0, 100)
}

export function normalizeDeviationAbsoluteInput(value: unknown): number {
  return normalizeFiniteClampedNumber(value, 0, 0)
}

export function normalizeInterpolationDurationInput(value: unknown): number {
  return normalizeFiniteClampedInteger(value, 4500, 1000, 10000)
}

export function normalizeInterpolationStepsInput(value: unknown): number {
  return normalizeFiniteClampedInteger(value, 50, 10, 200)
}
