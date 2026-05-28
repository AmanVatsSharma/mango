/**
 * @file place-order-input.types.ts
 * @module services/order
 * @description Shared place-order payload shape for execution service, hydration, and API validation mapping.
 * @author StockTrade
 * @created 2026-04-01
 */

import type { OrderSide, OrderType } from "@prisma/client"

export interface PlaceOrderInput {
  tradingAccountId: string
  userId?: string
  stockId?: string | null
  instrumentId?: string | null
  symbol: string
  quantity: number
  price?: number | null
  orderType: OrderType
  orderSide: OrderSide
  productType?: string | null
  segment?: string | null
  token?: number | null
  uirId?: number | null
  canonicalSymbol?: string | null
  /** Asset classification — EQ | FUT | CE | PE | IDX | ETF | SPOT | … Drives product-type defaulting. */
  instrumentType?: string | null
  exchange?: string | null
  name?: string | null
  ltp?: number | null
  ltpTimestamp?: number | null
  ltpSource?: string | null
  ltpAgeMs?: number | null
  close?: number | null
  strikePrice?: number | null
  optionType?: string | null
  expiry?: string | null
  lotSize?: number | null
  watchlistItemId?: string | null
  /** UI-locked spread % forwarded from the order sheet so execution matches what the user saw. */
  spreadOverride?: number | null
  /** Optional: user's current market-control group (VIP/STANDARD/HIGH_RISK/SCALPER). Default STANDARD. */
  userGroup?: "VIP" | "STANDARD" | "HIGH_RISK" | "SCALPER" | null
}
