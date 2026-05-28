/**
 * @file quote-utils.ts
 * @module market-data
 * @description Backward-compatible re-exports for market quote utility helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

export type { MarketQuoteLike } from "@/lib/market-data/utils/quote-lookup"
export {
  parseFiniteMarketNumber,
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveDisplayPriceFromQuote,
} from "@/lib/market-data/utils/quote-lookup"

import {
  resolveQuoteFromMap as resolveQuoteFromMapInternal,
  type MarketQuoteLike,
} from "@/lib/market-data/utils/quote-lookup"

export function resolveQuoteFromMap(
  quotes: Record<string, MarketQuoteLike> | null | undefined,
  input: { token?: unknown; instrumentId?: unknown },
): MarketQuoteLike | null {
  return (
    resolveQuoteFromMapInternal(quotes, {
      token: input.token,
      instrumentId: typeof input.instrumentId === "string" ? input.instrumentId : null,
    }) ?? null
  )
}
