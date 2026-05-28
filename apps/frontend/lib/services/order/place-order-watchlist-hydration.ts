/**
 * @file place-order-watchlist-hydration.ts
 * @module services/order
 * @description Merge authenticated watchlist item fields into place-order input so F&O identity survives thin or stale client payloads.
 * @author StockTrade
 * @created 2026-04-01
 */

import type { OptionType } from "@prisma/client"
import { getWatchlistItemById } from "@/lib/watchlist-transactions"
import type { PlaceOrderInput } from "@/lib/services/order/place-order-input.types"

type WatchlistRow = NonNullable<Awaited<ReturnType<typeof getWatchlistItemById>>>

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function pickString(client: string | null | undefined, fallback: string | null | undefined): string | null | undefined {
  if (isNonEmptyString(client)) return client.trim()
  if (isNonEmptyString(fallback)) return String(fallback).trim()
  return client ?? fallback ?? undefined
}

function pickNumber(
  client: number | null | undefined,
  fallback: number | null | undefined,
): number | null | undefined {
  if (client !== null && client !== undefined && Number.isFinite(client)) return client
  if (fallback !== null && fallback !== undefined && Number.isFinite(fallback)) return fallback
  return client ?? fallback ?? undefined
}

/** Resolve option type for order input (CE/PE strings). */
function pickOptionType(
  client: string | null | undefined,
  fallback: OptionType | null | undefined,
): string | null | undefined {
  if (client === "CE" || client === "PE") return client
  if (fallback === "CE" || fallback === "PE") return fallback
  return client ?? undefined
}

function watchlistExpiryToInputString(expiry: Date | null | undefined): string | null | undefined {
  if (!expiry || Number.isNaN(expiry.getTime())) return undefined
  return expiry.toISOString().slice(0, 10)
}

export function mergeWatchlistRowIntoPlaceOrder(input: PlaceOrderInput, wl: WatchlistRow): PlaceOrderInput {
  const strikeFromWl = wl.strikePrice != null ? Number(wl.strikePrice) : null
  const instrumentTypeFromWl =
    typeof (wl as { instrumentType?: unknown }).instrumentType === "string"
      ? ((wl as { instrumentType: string }).instrumentType.trim() || undefined)
      : undefined

  return {
    ...input,
    stockId: pickString(input.stockId ?? undefined, wl.stockId) ?? input.stockId,
    symbol: pickString(input.symbol, wl.symbol) ?? input.symbol,
    exchange: pickString(input.exchange ?? undefined, wl.exchange ?? undefined) ?? input.exchange,
    segment: pickString(input.segment ?? undefined, wl.segment ?? undefined) ?? input.segment,
    name: pickString(input.name ?? undefined, wl.name ?? undefined) ?? input.name,
    token: pickNumber(input.token ?? undefined, wl.token ?? undefined) ?? input.token,
    uirId: pickNumber(input.uirId ?? undefined, wl.uirId ?? undefined) ?? input.uirId,
    canonicalSymbol: pickString(input.canonicalSymbol ?? undefined, wl.canonicalSymbol ?? undefined) ?? input.canonicalSymbol,
    instrumentType: pickString(input.instrumentType ?? undefined, instrumentTypeFromWl) ?? input.instrumentType,
    strikePrice: pickNumber(input.strikePrice ?? undefined, strikeFromWl ?? undefined) ?? input.strikePrice,
    optionType: pickOptionType(input.optionType ?? undefined, wl.optionType) ?? input.optionType,
    expiry: pickString(input.expiry ?? undefined, watchlistExpiryToInputString(wl.expiry)) ?? input.expiry,
    lotSize: pickNumber(input.lotSize ?? undefined, wl.lotSize ?? undefined) ?? input.lotSize,
    close: pickNumber(input.close ?? undefined, wl.close ?? undefined) ?? input.close,
    ltp: pickNumber(input.ltp ?? undefined, wl.ltp ?? undefined) ?? input.ltp,
  }
}

export type HydratePlaceOrderResult = {
  input: PlaceOrderInput
  /** True when a watchlist row was loaded and merged (may equal original if all fields already set). */
  merged: boolean
}

/**
 * When `watchlistItemId` is present, load the row for `userId` and merge missing instrument fields into `input`.
 */
export async function hydratePlaceOrderFromWatchlist(
  input: PlaceOrderInput,
  userId: string | null | undefined,
): Promise<HydratePlaceOrderResult> {
  const wlId = typeof input.watchlistItemId === "string" ? input.watchlistItemId.trim() : ""
  if (!wlId || !userId) {
    return { input, merged: false }
  }

  const wl = await getWatchlistItemById(wlId, userId)
  if (!wl) {
    return { input, merged: false }
  }

  return { input: mergeWatchlistRowIntoPlaceOrder(input, wl), merged: true }
}
