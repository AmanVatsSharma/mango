/**
 * @file position-action-number-utils.ts
 * @module trading/positions
 * @description Numeric normalization helpers for position-action close flow calculations.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { toNumber } from "@/lib/utils/decimal"

export function resolveExitPriceFromQuoteCandidate(ltpCandidate: unknown, fallbackPrice: number): number {
  const normalizedFallbackPrice = toNumber(fallbackPrice)
  const parsedLtp = parseFiniteTradingNumber(ltpCandidate)
  if (parsedLtp === null || parsedLtp <= 0) {
    return normalizedFallbackPrice
  }
  return parsedLtp
}

export function computeFiniteRealizedPnl(input: {
  exitPrice: unknown
  averagePrice: unknown
  quantity: unknown
}): number {
  const normalizedExitPrice = toNumber(input.exitPrice)
  const normalizedAveragePrice = toNumber(input.averagePrice)
  const normalizedQuantity = toNumber(input.quantity)
  const realizedPnl = (normalizedExitPrice - normalizedAveragePrice) * normalizedQuantity
  return Number.isFinite(realizedPnl) ? realizedPnl : 0
}
