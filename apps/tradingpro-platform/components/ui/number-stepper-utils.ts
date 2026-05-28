/**
 * @file number-stepper-utils.ts
 * @module components-ui
 * @description Strict numeric normalization helpers for number-stepper increment/decrement and direct input handling.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeNumberStepperRoundedValue(value: number): number {
  return Math.round(value * 100) / 100
}

export function normalizeNumberStepperInputValue(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}
