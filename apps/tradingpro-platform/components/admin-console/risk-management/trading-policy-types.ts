/**
 * @file trading-policy-types.ts
 * @module admin-console
 * @description UI-facing types and aliases for the trading policy studio, aligned with dynamic-trading-policies.
 * @author StockTrade
 * @created 2026-03-30
 */

import type {
  TradingPolicyAction,
  TradingPolicyCatalog,
  TradingPolicyCondition,
  TradingPolicyContext,
  TradingPolicyDefinition,
  TradingPolicyFieldCatalogEntry,
  TradingPolicyMatchType,
  TradingPolicyOperator,
  TradingPolicySource,
} from "@/lib/services/risk/dynamic-trading-policies"

export type PolicyContext = TradingPolicyContext
export type PolicyMatchType = TradingPolicyMatchType
export type PolicyOperator = TradingPolicyOperator
export type PolicySource = TradingPolicySource

export type {
  TradingPolicyCatalog,
  TradingPolicyFieldCatalogEntry,
  TradingPolicyDefinition,
  TradingPolicyCondition,
}

export interface TradingPolicyActionUI extends TradingPolicyAction {}

export interface TradingPolicyDraft {
  id?: string
  name: string
  description: string
  context: PolicyContext
  enabled: boolean
  priority: number
  matchType: PolicyMatchType
  conditions: TradingPolicyCondition[]
  action: TradingPolicyActionUI
  metadata?: Record<string, string>
}

export type PolicyAuthoringMode = "PRESET" | "CUSTOM"

export type PolicyStudioBlueprint =
  | "BUY_ABOVE_LTP_OFFSET"
  | "SELL_BELOW_LTP_OFFSET"
  | "NEGATIVE_PNL_CLOSE_DELAY"
  | "MIN_AVAILABLE_MARGIN"
  | "MAX_ORDER_TURNOVER"
  | "SEGMENT_DENYLIST"
  | "BUY_LIMIT_ONLY"
  | "SELL_LIMIT_ONLY"
  | "BLOCK_MARKET_ORDERS"
  | "BUY_SEGMENT_DENYLIST"
  | "SELL_SEGMENT_DENYLIST"
  | "PRODUCT_TYPE_DENYLIST"
  | "PRODUCT_TYPE_ALLOWLIST"
  | "LOW_MARGIN_BUY_GUARD"
  | "LOW_MARGIN_SELL_GUARD"
  | "HIGH_TURNOVER_AND_LOW_MARGIN"
  | "BUY_PRICE_BELOW_LTP"
  | "SELL_PRICE_ABOVE_LTP"
  | "PROFIT_CLOSE_DELAY"
  | "ANY_CLOSE_MIN_HOLD"
  | "POSITION_SEGMENT_DENYLIST"
  | "MAX_ORDER_QUANTITY_CAP"
  | "MIN_ORDER_QUANTITY_FLOOR"
  | "MIN_ACCOUNT_BALANCE_ORDER"
  | "MAX_USED_MARGIN_ORDER"
  | "BLOCK_BUY_MARKET_ORDERS"
  | "BLOCK_SELL_MARKET_ORDERS"
  | "ALL_ORDERS_LIMIT_ONLY"
  | "BLOCK_ALL_LIMIT_ORDERS"
  | "MIN_LIMIT_ORDER_PRICE"
  | "MAX_LIMIT_ORDER_PRICE"
  | "BUY_MAX_TURNOVER"
  | "SELL_MAX_TURNOVER"
  | "HIGH_TURNOVER_LOW_BALANCE"
  | "LOW_MARGIN_HIGH_USED_MARGIN"
  | "LOW_BALANCE_AND_LOW_MARGIN"
  | "ORDER_USER_DENYLIST"
  | "POSITION_PRODUCT_DENYLIST_CLOSE"
  | "BLOCK_PARTIAL_POSITION_CLOSE"
  | "BLOCK_FULL_POSITION_CLOSE"
  | "MIN_REQUESTED_CLOSE_QUANTITY"
  | "MAX_REQUESTED_CLOSE_QUANTITY"
  | "BLOCK_CLOSE_LARGE_POSITION"
  | "BLOCK_CLOSE_SMALL_POSITION"
  | "BLOCK_CLOSE_WHILE_PROFITABLE"
  | "BLOCK_CLOSE_DEEP_LOSS"
  | "MIN_REQUESTED_CLOSE_LOTS"
  | "MAX_REMAINING_QUANTITY_AFTER_CLOSE"
  | "POSITION_USER_DENYLIST"
  | "BLOCK_INTRADAY_POSITION_CLOSE"
  | "BLOCK_OVERNIGHT_POSITION_CLOSE"
  | "ORDER_COOLOFF_MINUTES"
  | "RAW_POLICY_LOCK"

export interface PolicyStudioCustomConditionDraft {
  id: string
  field: string
  operator: PolicyOperator
  valueInput: string
}

export interface PolicyStudioDraft {
  authoringMode: PolicyAuthoringMode
  blueprint: PolicyStudioBlueprint
  context: PolicyContext
  name: string
  description: string
  enabled: boolean
  priority: number
  matchType: PolicyMatchType
  actionMessage: string
  retryAfterSeconds: number | null
  segmentCsv: string
  productTypeCsv: string
  thresholdPercent: number
  holdMinutes: number
  minAvailableMargin: number
  maxOrderTurnover: number
  enforceLimitOnly: boolean
  /** Max order qty before block (`order.quantity` GT). */
  maxOrderQuantity: number
  /** Block when `order.quantity` LT this (dust / min size). */
  minOrderQuantity: number
  /** Block orders when `account.balance` LT this. */
  minAccountBalance: number
  /** Block orders when `account.usedMargin` GT this. */
  maxUsedMargin: number
  /** LIMIT orders with price below this are blocked. */
  minOrderPrice: number
  /** LIMIT orders with price above this are blocked. */
  maxOrderPrice: number
  /** Block close when `requestedCloseQuantity` LT this. */
  minCloseQuantity: number
  /** Block close when `requestedCloseQuantity` GT this. */
  maxCloseQuantity: number
  /** Block close when `position.quantity` LT this (absolute book). */
  minPositionQuantity: number
  /** Block close when abs(position.quantity) GT this. */
  maxPositionQuantity: number
  /** Profit lock: block close when unrealized PnL GT this; loss lock: use negative with BLOCK_CLOSE_DEEP_LOSS. */
  pnlAmountThreshold: number
  /** Block when `requestedCloseLots` LT this (lot products). */
  minCloseLots: number
  /** Block close when `remainingQuantityAfterClose` GT this. */
  maxRemainingAfterClose: number
  /** Comma-separated user IDs blocked for order placement (`meta.userId` IN). */
  userIdDenyCsv: string
  metadata: Record<string, string>
  rawConditions: TradingPolicyCondition[]
  customConditions: PolicyStudioCustomConditionDraft[]
}

export interface PolicyStudioBlueprintProfile {
  value: PolicyStudioBlueprint
  label: string
  complexity: string
  briefing: string
  context: PolicyContext
}
