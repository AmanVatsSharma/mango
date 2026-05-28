/**
 * @file types.ts
 * @module order-charges
 * @description Type definitions for versioned platform order charges (non-brokerage) configuration.
 * @author StockTrade
 * @created 2026-03-27
 */

export const ORDER_CHARGES_CONFIG_VERSION = 1 as const

export type OrderChargeMode = "turnover_rate" | "flat_per_order"

export type OrderChargeSource = "builtin" | "custom"

export type OrderSideFilter = "BUY" | "SELL"

/** Single charge line (statutory-style or custom). */
export type OrderChargeLineV1 = {
  id: string
  code: string
  source: OrderChargeSource
  /** Display label (required for custom; optional override for builtins). */
  label?: string
  enabled: boolean
  mode: OrderChargeMode
  /** Rate applies to turnover, or flat rupees per order depending on `mode`. */
  value: number
  /**
   * Comma-separated segment keys (uppercase). Empty/null = all segments.
   * Matching normalizes aliases (e.g. NSE_EQ → NSE).
   */
  segment: string | null
  /**
   * Comma-separated product types (uppercase). Empty/null = all products.
   */
  product: string | null
  /** When set, line applies only to this side; null = both. */
  side: OrderSideFilter | null
}

export type OrderChargesConfigV1 = {
  version: typeof ORDER_CHARGES_CONFIG_VERSION
  /** GST rate applied to the configured base (e.g. 0.18). */
  gstRate: number
  /**
   * Line `code` values (and the synthetic key `brokerage`) that form the GST taxable base.
   * Amounts use running totals per code after exclusive rules (STT uses first match).
   */
  gstBaseCodes: string[]
  /**
   * Charge lines evaluated in array order. For `code === "stt"`, the first enabled matching row wins.
   * Other codes sum all enabled matching rows.
   */
  lines: OrderChargeLineV1[]
}

export type OrderChargesComputeContext = {
  segment: string
  productType: string
  orderSide: string
  turnover: number
  brokerage: number
}

export type OrderChargeLineComputed = {
  id: string
  code: string
  label?: string
  amount: number
}

export type NonBrokerageChargesResult = {
  /** Per-code rolled-up amounts (before GST) for statutory-style codes. */
  byCode: Record<string, number>
  lineItems: OrderChargeLineComputed[]
  stt: number
  exchangeTransaction: number
  stampDuty: number
  gst: number
  /** Sum of amounts for lines whose code is not stt, exchange_transaction, stamp_duty, gst. */
  other: number
  /** Non-brokerage subtotal (exact); combine with brokerage then `Math.floor` for placement charges. */
  total: number
}
