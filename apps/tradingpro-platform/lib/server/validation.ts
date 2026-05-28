/**
 * @file validation.ts
 * @module server/validation
 * @description Zod schemas for trading order route payload validation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01
 */

import { z } from "zod"

const finitePositiveInt = z.number().finite().int().positive()
const finitePositiveNumber = z.number().finite().positive()
const finiteNonNegativeNumber = z.number().finite().nonnegative()

export const placeOrderSchema = z.object({
  tradingAccountId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().email().nullable().optional(),
  stockId: z.string().min(1).optional(),
  instrumentId: z.string().optional(),
  symbol: z.string(),
  quantity: finitePositiveInt,
  price: finitePositiveNumber.nullable().optional(),
  orderType: z.enum(["MARKET", "LIMIT"]),
  orderSide: z.enum(["BUY", "SELL"]),
  productType: z.string().optional(),
  segment: z.string().optional(),
  token: finitePositiveInt.optional(),
  /** Provider-agnostic UIR id from milli-search. Forwarded so Position rows carry the correct identity. */
  uirId: finitePositiveInt.optional(),
  /** UIR canonical symbol (e.g. "NSE:RELIANCE", "MCX:GOLD25JUNFUT"). Persisted on Position. */
  canonicalSymbol: z.string().max(128).optional(),
  /** Asset classification — EQ | FUT | CE | PE | IDX | ETF | SPOT | …  Used for product-type defaulting at execution. */
  instrumentType: z.string().max(16).optional(),
  exchange: z.string().optional(),
  name: z.string().optional(),
  ltp: finiteNonNegativeNumber.optional(),
  ltpTimestamp: finiteNonNegativeNumber.optional(),
  ltpSource: z.string().max(64).optional(),
  ltpAgeMs: finiteNonNegativeNumber.optional(),
  close: finiteNonNegativeNumber.optional(),
  strikePrice: finiteNonNegativeNumber.optional(),
  optionType: z.enum(["CE", "PE"]).optional(),
  expiry: z.string().optional(),
  lotSize: finitePositiveNumber.optional(),
  watchlistItemId: z.string().min(1).optional(),
  /** User's market-control group — forwarded so dynamic policies don't fall back to STANDARD when the client has explicit context. */
  userGroup: z.enum(["VIP", "STANDARD", "HIGH_RISK", "SCALPER"]).optional(),
  /** Pre-computed spread % locked at order-sheet open (forwarded to execution for UI/execution consistency). */
  spreadOverride: z.number().finite().positive().max(10).optional(),
})

export const modifyOrderSchema = z.object({
  orderId: z.string().uuid(),
  price: finitePositiveNumber.optional(),
  quantity: finitePositiveInt.optional(),
}).refine((v: { price?: number; quantity?: number }) => v.price !== undefined || v.quantity !== undefined, { message: "Provide price or quantity" })

export const cancelOrderSchema = z.object({
  orderId: z.string().uuid(),
})

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
export type ModifyOrderInput = z.infer<typeof modifyOrderSchema>
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>


