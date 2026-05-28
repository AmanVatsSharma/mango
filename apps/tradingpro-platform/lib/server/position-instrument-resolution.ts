/**
 * @file position-instrument-resolution.ts
 * @module server
 * @description Token-first instrument resolution for open positions (position row before stock row) + subscription identity for server market-data.
 * @author StockTrade
 * @created 2026-03-30
 *
 * Notes:
 * - Mirrors dashboard token authority: `position.token` overrides `stock.token` when both exist.
 * - Never uses symbol strings for subscription; only numeric token + instrumentId/segment/exchange.
 */

import {
  resolveSubscriptionIdentity,
  type SubscriptionIdentity,
} from "@/lib/market-data/utils/quote-lookup"
import { resolveInstrumentTokenBestEffort } from "@/lib/server/instrument-token-utils"
import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"

export type PositionRowInstrumentSlice = {
  token?: unknown
  uirId?: unknown
  instrumentId?: string | null
  segment?: string | null
  exchange?: string | null
  /**
   * Provider-agnostic canonical symbol e.g. "NSE:RELIANCE" — preferred subscription key for
   * the upstream WS gateway when no `uirId` is present. Mirrors the shape the frontend uses
   * via `WebSocketMarketDataProvider`, so backend and frontend produce the SAME key for the
   * same row and the gateway treats them as a single subscription.
   */
  canonicalSymbol?: string | null
}

export type StockRowInstrumentSlice = {
  token?: unknown
  uirId?: unknown
  instrumentId?: string | null
  segment?: string | null
  exchange?: string | null
  canonicalSymbol?: string | null
}

function toPositiveInstrumentToken(value: unknown): number | null {
  const parsedValue = parseFinitePositionNumber(value)
  if (parsedValue === null || parsedValue <= 0 || !Number.isFinite(parsedValue)) {
    return null
  }
  return Math.trunc(parsedValue)
}

function normalizeTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve numeric instrument token: position row first, then stock row, then instrumentId suffixes.
 */
export function resolvePositionRowInstrumentToken(
  position: PositionRowInstrumentSlice,
  stock: StockRowInstrumentSlice | null | undefined,
): number | null {
  const fromPosition = toPositiveInstrumentToken(position?.token)
  if (fromPosition !== null) {
    return fromPosition
  }
  const fromStock = toPositiveInstrumentToken(stock?.token)
  if (fromStock !== null) {
    return fromStock
  }
  const fromPositionInstrument = resolveInstrumentTokenBestEffort(
    normalizeTrimmedString(position?.instrumentId),
  )
  if (fromPositionInstrument !== null) {
    return fromPositionInstrument
  }
  return resolveInstrumentTokenBestEffort(normalizeTrimmedString(stock?.instrumentId))
}

/**
 * Prefer position-level instrument id for exchange-prefix resolution, else stock.
 */
export function resolvePositionRowInstrumentIdForSubscription(
  position: PositionRowInstrumentSlice,
  stock: StockRowInstrumentSlice | null | undefined,
): string | null {
  const fromPosition = normalizeTrimmedString(position?.instrumentId)
  if (fromPosition !== null) {
    return fromPosition
  }
  return normalizeTrimmedString(stock?.instrumentId)
}

export function resolvePositionRowSegment(
  position: PositionRowInstrumentSlice,
  stock: StockRowInstrumentSlice | null | undefined,
): string | null {
  const fromPosition = normalizeTrimmedString(position?.segment)
  if (fromPosition !== null) {
    return fromPosition
  }
  return normalizeTrimmedString(stock?.segment)
}

export function resolvePositionRowExchange(
  position: PositionRowInstrumentSlice,
  stock: StockRowInstrumentSlice | null | undefined,
): string | null {
  const fromPosition = normalizeTrimmedString(position?.exchange)
  if (fromPosition !== null) {
    return fromPosition
  }
  return normalizeTrimmedString(stock?.exchange)
}

/**
 * Exchange-qualified subscription key + token for `ServerMarketDataService` / upstream Socket.IO.
 */
export function resolvePositionRowSubscriptionIdentity(
  position: PositionRowInstrumentSlice,
  stock: StockRowInstrumentSlice | null | undefined,
): SubscriptionIdentity {
  const token = resolvePositionRowInstrumentToken(position, stock)
  const uirId = position?.uirId ?? stock?.uirId
  const instrumentId = resolvePositionRowInstrumentIdForSubscription(position, stock)
  const segment = resolvePositionRowSegment(position, stock)
  const exchange = resolvePositionRowExchange(position, stock)
  const canonicalSymbol =
    normalizeTrimmedString(position?.canonicalSymbol) ?? normalizeTrimmedString(stock?.canonicalSymbol)
  return resolveSubscriptionIdentity({
    token: token ?? undefined,
    uirId,
    instrumentId,
    exchange,
    segment,
    canonicalSymbol,
  })
}
