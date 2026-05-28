/**
 * @file instrument-token-utils.ts
 * @module server
 * @description Shared best-effort instrument-token parsing helpers for workers and trading flows.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseInstrumentId } from "@/lib/market-data/utils/instrumentMapper"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"

function parseStrictPositiveTokenSegment(value: unknown): number | null {
  if (typeof value !== "string") {
    const parsedValue = parseFiniteTradingNumber(value)
    if (parsedValue === null || parsedValue <= 0 || !Number.isInteger(parsedValue)) {
      return null
    }
    return parsedValue
  }
  const normalizedValue = value.trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return null
  }
  const parsedValue = Number(normalizedValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null
  }
  return Math.trunc(parsedValue)
}

export function resolveInstrumentTokenBestEffort(instrumentId: string | null | undefined): number | null {
  if (!instrumentId) {
    return null
  }

  const normalizedInstrumentId = instrumentId.trim()
  if (!normalizedInstrumentId) {
    return null
  }

  const directToken = parseStrictPositiveTokenSegment(parseInstrumentId(normalizedInstrumentId))
  if (directToken !== null) {
    return directToken
  }

  const parts = normalizedInstrumentId.split("-")
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const segmentToken = parseStrictPositiveTokenSegment(parts[index])
    if (segmentToken !== null) {
      return segmentToken
    }
  }

  return null
}
