/**
 * @file trading-policy-studio-state.ts
 * @module admin-console
 * @description Pure helpers for policy presets, draft lifecycle, and compiling studio state to API trading policy drafts.
 * @author StockTrade
 * @created 2026-03-30
 */

import { normalizeRiskLimitNonNegativeIntegerInput } from "@/components/admin-console/risk-management-number-utils"
import type {
  PolicyContext,
  PolicyOperator,
  PolicyStudioBlueprint,
  PolicyStudioBlueprintProfile,
  PolicyStudioCustomConditionDraft,
  PolicyStudioDraft,
  TradingPolicyCatalog,
  TradingPolicyCondition,
  TradingPolicyDefinition,
  TradingPolicyDraft,
  TradingPolicyFieldCatalogEntry,
} from "./trading-policy-types"

export const POLICY_STUDIO_BLUEPRINTS: PolicyStudioBlueprintProfile[] = [
  {
    value: "BUY_ABOVE_LTP_OFFSET",
    label: "Buy Above LTP by Offset",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block BUY orders unless the limit price is at least X% above LTP.",
  },
  {
    value: "SELL_BELOW_LTP_OFFSET",
    label: "Sell Below LTP by Offset",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block SELL orders unless the limit price is at least X% below LTP.",
  },
  {
    value: "NEGATIVE_PNL_CLOSE_DELAY",
    label: "Hold Losing Position Before Exit",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Prevent closing loss-making positions before the minimum hold time.",
  },
  {
    value: "MIN_AVAILABLE_MARGIN",
    label: "Minimum Available Margin",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block new orders when available margin drops below the threshold.",
  },
  {
    value: "MAX_ORDER_TURNOVER",
    label: "Maximum Order Turnover",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block oversized orders when turnover is above the configured cap.",
  },
  {
    value: "SEGMENT_DENYLIST",
    label: "Block Segments (All Orders)",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block order placement for selected segments.",
  },
  {
    value: "BUY_LIMIT_ONLY",
    label: "Allow Only BUY Limit Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block BUY orders that are not limit orders.",
  },
  {
    value: "SELL_LIMIT_ONLY",
    label: "Allow Only SELL Limit Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block SELL orders that are not limit orders.",
  },
  {
    value: "BLOCK_MARKET_ORDERS",
    label: "Block Market Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block all MARKET orders in selected scope.",
  },
  {
    value: "BUY_SEGMENT_DENYLIST",
    label: "Block BUY in Segments",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block BUY orders only in selected segments.",
  },
  {
    value: "SELL_SEGMENT_DENYLIST",
    label: "Block SELL in Segments",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block SELL orders only in selected segments.",
  },
  {
    value: "PRODUCT_TYPE_DENYLIST",
    label: "Block Product Types",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block orders when product type is in your blocked list.",
  },
  {
    value: "PRODUCT_TYPE_ALLOWLIST",
    label: "Allow Only Product Types",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block orders when product type is outside your allowed list.",
  },
  {
    value: "LOW_MARGIN_BUY_GUARD",
    label: "Block BUY on Low Margin",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block BUY orders when available margin is below threshold.",
  },
  {
    value: "LOW_MARGIN_SELL_GUARD",
    label: "Block SELL on Low Margin",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block SELL orders when available margin is below threshold.",
  },
  {
    value: "HIGH_TURNOVER_AND_LOW_MARGIN",
    label: "Block High Turnover with Low Margin",
    context: "ORDER_PLACE",
    complexity: "Advanced",
    briefing: "Block orders only when turnover is high and margin is low.",
  },
  {
    value: "BUY_PRICE_BELOW_LTP",
    label: "Block BUY Too Far Below LTP",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block BUY orders when price is more than X% below LTP.",
  },
  {
    value: "SELL_PRICE_ABOVE_LTP",
    label: "Block SELL Too Far Above LTP",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block SELL orders when price is more than X% above LTP.",
  },
  {
    value: "PROFIT_CLOSE_DELAY",
    label: "Hold Winning Position Before Exit",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Prevent closing profitable positions before minimum hold time.",
  },
  {
    value: "ANY_CLOSE_MIN_HOLD",
    label: "Minimum Hold Before Any Exit",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Prevent closing any position before minimum hold time.",
  },
  {
    value: "POSITION_SEGMENT_DENYLIST",
    label: "Block Position Close by Segment",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Block closing positions in selected segments.",
  },
  {
    value: "MAX_ORDER_QUANTITY_CAP",
    label: "Cap Max Order Quantity",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block orders when quantity is above your maximum per order.",
  },
  {
    value: "MIN_ORDER_QUANTITY_FLOOR",
    label: "Minimum Order Quantity (Block Tiny Orders)",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block orders when quantity is below your minimum (dust protection).",
  },
  {
    value: "MIN_ACCOUNT_BALANCE_ORDER",
    label: "Minimum Cash Balance for Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block new orders when account balance falls below a floor.",
  },
  {
    value: "MAX_USED_MARGIN_ORDER",
    label: "Max Used Margin Before Blocking Orders",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block orders when used margin exceeds a ceiling (risk utilization cap).",
  },
  {
    value: "BLOCK_BUY_MARKET_ORDERS",
    label: "Block BUY Market Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block MARKET buy orders only (limits still allowed unless restricted elsewhere).",
  },
  {
    value: "BLOCK_SELL_MARKET_ORDERS",
    label: "Block SELL Market Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block MARKET sell orders only.",
  },
  {
    value: "ALL_ORDERS_LIMIT_ONLY",
    label: "Only Limit Orders (All Sides)",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Allow only LIMIT orders; block MARKET and other non-limit types.",
  },
  {
    value: "BLOCK_ALL_LIMIT_ORDERS",
    label: "Block All Limit Orders",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Disallow LIMIT orders (e.g. force market-only workflow in scope).",
  },
  {
    value: "MIN_LIMIT_ORDER_PRICE",
    label: "Minimum Limit Order Price",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block LIMIT orders priced below a minimum (bad-tick / zero protection).",
  },
  {
    value: "MAX_LIMIT_ORDER_PRICE",
    label: "Maximum Limit Order Price",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Block LIMIT orders priced above a maximum.",
  },
  {
    value: "BUY_MAX_TURNOVER",
    label: "Cap BUY Order Turnover",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block BUY when order turnover exceeds the cap.",
  },
  {
    value: "SELL_MAX_TURNOVER",
    label: "Cap SELL Order Turnover",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block SELL when order turnover exceeds the cap.",
  },
  {
    value: "HIGH_TURNOVER_LOW_BALANCE",
    label: "Block High Turnover With Low Balance",
    context: "ORDER_PLACE",
    complexity: "Advanced",
    briefing: "Block when turnover is high and cash balance is below your floor.",
  },
  {
    value: "LOW_MARGIN_HIGH_USED_MARGIN",
    label: "Block When Margin Tight and Utilization High",
    context: "ORDER_PLACE",
    complexity: "Advanced",
    briefing: "Block when available margin is low while used margin is above a ceiling.",
  },
  {
    value: "LOW_BALANCE_AND_LOW_MARGIN",
    label: "Block When Both Balance and Margin Are Low",
    context: "ORDER_PLACE",
    complexity: "Advanced",
    briefing: "Double gate: balance and available margin both below thresholds.",
  },
  {
    value: "ORDER_USER_DENYLIST",
    label: "Block Listed Users From Placing Orders",
    context: "ORDER_PLACE",
    complexity: "Medium",
    briefing: "Deny order placement for specific user IDs (comma-separated, case-sensitive).",
  },
  {
    value: "POSITION_PRODUCT_DENYLIST_CLOSE",
    label: "Block Close by Product Type",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Block closing positions in listed product types (MIS, CNC, ...).",
  },
  {
    value: "BLOCK_PARTIAL_POSITION_CLOSE",
    label: "Block Partial Exits (Full Close Only)",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Block closes that leave remaining quantity (force full exit only).",
  },
  {
    value: "BLOCK_FULL_POSITION_CLOSE",
    label: "Block Full Exit (Partial Only)",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Block full square-off; partial reductions still allowed.",
  },
  {
    value: "MIN_REQUESTED_CLOSE_QUANTITY",
    label: "Minimum Exit Size (Quantity)",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Block closes smaller than your minimum exit chunk.",
  },
  {
    value: "MAX_REQUESTED_CLOSE_QUANTITY",
    label: "Maximum Exit Size (Quantity)",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Block single close requests larger than your maximum.",
  },
  {
    value: "BLOCK_CLOSE_LARGE_POSITION",
    label: "Block Closing Very Large Positions",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Block exit attempts when open quantity exceeds a size threshold.",
  },
  {
    value: "BLOCK_CLOSE_SMALL_POSITION",
    label: "Block Closing Very Small Positions",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Block exit attempts when position size is below a threshold.",
  },
  {
    value: "BLOCK_CLOSE_WHILE_PROFITABLE",
    label: "Hold Winners (Block Close While in Profit)",
    context: "POSITION_CLOSE",
    complexity: "Advanced",
    briefing: "Block closing while unrealized profit is above your threshold (strategy hold).",
  },
  {
    value: "BLOCK_CLOSE_DEEP_LOSS",
    label: "Freeze Deep Loss Exits",
    context: "POSITION_CLOSE",
    complexity: "Advanced",
    briefing: "Block closing while unrealized loss is beyond a negative threshold (cool-off).",
  },
  {
    value: "MIN_REQUESTED_CLOSE_LOTS",
    label: "Minimum Exit in Lots",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Block closes smaller than N lots (F&O style).",
  },
  {
    value: "MAX_REMAINING_QUANTITY_AFTER_CLOSE",
    label: "Cap Leftover After Partial Close",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Block if remaining quantity after the close would exceed a ceiling (odd-lot control).",
  },
  {
    value: "POSITION_USER_DENYLIST",
    label: "Block Listed Users From Closing Positions",
    context: "POSITION_CLOSE",
    complexity: "Medium",
    briefing: "Deny position closes for specific user IDs.",
  },
  {
    value: "BLOCK_INTRADAY_POSITION_CLOSE",
    label: "Block Closing Intraday (MIS) Positions",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Prevent manual exit on intraday-flagged positions (use square-off flow).",
  },
  {
    value: "BLOCK_OVERNIGHT_POSITION_CLOSE",
    label: "Block Closing Carryforward Positions",
    context: "POSITION_CLOSE",
    complexity: "Simple",
    briefing: "Prevent manual exit on overnight / non-intraday positions.",
  },
  {
    value: "ORDER_COOLOFF_MINUTES",
    label: "Block Orders in Opening Cooloff Window",
    context: "ORDER_PLACE",
    complexity: "Simple",
    briefing: "Block all order placement during the first N minutes after market session opens (volatility control).",
  },
  {
    value: "RAW_POLICY_LOCK",
    label: "Imported Rule (Preset Locked)",
    context: "ORDER_PLACE",
    complexity: "Locked",
    briefing: "This imported rule cannot be edited from preset controls.",
  },
]

export function getPolicyStudioBlueprintProfile(blueprint: PolicyStudioBlueprint): PolicyStudioBlueprintProfile {
  return POLICY_STUDIO_BLUEPRINTS.find((entry) => entry.value === blueprint) || POLICY_STUDIO_BLUEPRINTS[0]!
}

export function createPolicyConditionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function parseConditionNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== "string") {
    return null
  }
  const parsedValue = Number(value.trim())
  return Number.isFinite(parsedValue) ? parsedValue : null
}

export function normalizeCsvTokenList(raw: string): string[] {
  return raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean)
}

/** Preserves case for `meta.userId` allow/deny lists. */
export function normalizeUserIdTokenList(raw: string): string[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
}

function parseConditionCsv(value: TradingPolicyCondition["value"] | undefined): string {
  if (!value) {
    return ""
  }
  if (Array.isArray(value)) {
    return value.map((token) => String(token).toUpperCase()).join(",")
  }
  return String(value)
}

function cloneConditionValue(value: TradingPolicyCondition["value"]): TradingPolicyCondition["value"] {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "number")) {
      return [...value] as number[]
    }
    return value.map((item) => String(item)) as string[]
  }
  return value
}

function stringifyConditionValueForInput(value: TradingPolicyCondition["value"]): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ")
  }
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

export function createCustomConditionDraftFromCondition(
  condition: TradingPolicyCondition,
): PolicyStudioCustomConditionDraft {
  return {
    id: condition.id || createPolicyConditionId(),
    field: condition.field,
    operator: condition.operator,
    valueInput: stringifyConditionValueForInput(cloneConditionValue(condition.value)),
  }
}

export function getCatalogFieldsForContext(
  catalog: TradingPolicyCatalog | null,
  context: PolicyContext,
): TradingPolicyFieldCatalogEntry[] {
  if (!catalog) {
    return []
  }
  return catalog.fieldsByContext[context] || []
}

export function getCatalogOperatorsForDataType(
  catalog: TradingPolicyCatalog | null,
  dataType: "number" | "string" | undefined,
): Array<{ value: PolicyOperator; label: string; supportedDataTypes: Array<"number" | "string"> }> {
  if (!catalog || !dataType) {
    return []
  }
  return catalog.operators.filter((operator) => operator.supportedDataTypes.includes(dataType))
}

export function getDefaultOperatorForDataType(
  catalog: TradingPolicyCatalog | null,
  dataType: "number" | "string" | undefined,
): PolicyOperator {
  return getCatalogOperatorsForDataType(catalog, dataType)[0]?.value || "EQ"
}

export function createDefaultCustomConditionDraft(
  context: PolicyContext,
  catalog: TradingPolicyCatalog | null,
): PolicyStudioCustomConditionDraft {
  const contextFields = getCatalogFieldsForContext(catalog, context)
  const defaultField = contextFields[0]
  return {
    id: createPolicyConditionId(),
    field: defaultField?.field || "",
    operator: getDefaultOperatorForDataType(catalog, defaultField?.dataType),
    valueInput: "",
  }
}

export function getBlueprintDefaultMessage(blueprint: PolicyStudioBlueprint): string {
  if (blueprint === "BUY_ABOVE_LTP_OFFSET") {
    return "BUY blocked: price is not above LTP by the required offset."
  }
  if (blueprint === "SELL_BELOW_LTP_OFFSET") {
    return "SELL blocked: price is not below LTP by the required offset."
  }
  if (blueprint === "NEGATIVE_PNL_CLOSE_DELAY") {
    return "Close blocked: this losing position must be held for longer."
  }
  if (blueprint === "MIN_AVAILABLE_MARGIN") {
    return "Order blocked: available margin is below the minimum threshold."
  }
  if (blueprint === "MAX_ORDER_TURNOVER") {
    return "Order blocked: order turnover exceeds the maximum limit."
  }
  if (blueprint === "SEGMENT_DENYLIST") {
    return "Order blocked: this segment is not allowed."
  }
  if (blueprint === "BUY_LIMIT_ONLY") {
    return "BUY blocked: only LIMIT BUY orders are allowed."
  }
  if (blueprint === "SELL_LIMIT_ONLY") {
    return "SELL blocked: only LIMIT SELL orders are allowed."
  }
  if (blueprint === "BLOCK_MARKET_ORDERS") {
    return "Order blocked: MARKET orders are not allowed."
  }
  if (blueprint === "BUY_SEGMENT_DENYLIST") {
    return "BUY blocked: this segment is blocked for BUY orders."
  }
  if (blueprint === "SELL_SEGMENT_DENYLIST") {
    return "SELL blocked: this segment is blocked for SELL orders."
  }
  if (blueprint === "PRODUCT_TYPE_DENYLIST") {
    return "Order blocked: this product type is blocked by policy."
  }
  if (blueprint === "PRODUCT_TYPE_ALLOWLIST") {
    return "Order blocked: only selected product types are allowed."
  }
  if (blueprint === "LOW_MARGIN_BUY_GUARD") {
    return "BUY blocked: available margin is too low."
  }
  if (blueprint === "LOW_MARGIN_SELL_GUARD") {
    return "SELL blocked: available margin is too low."
  }
  if (blueprint === "HIGH_TURNOVER_AND_LOW_MARGIN") {
    return "Order blocked: turnover is high while available margin is low."
  }
  if (blueprint === "BUY_PRICE_BELOW_LTP") {
    return "BUY blocked: price is too far below LTP."
  }
  if (blueprint === "SELL_PRICE_ABOVE_LTP") {
    return "SELL blocked: price is too far above LTP."
  }
  if (blueprint === "PROFIT_CLOSE_DELAY") {
    return "Close blocked: this winning position must be held for longer."
  }
  if (blueprint === "ANY_CLOSE_MIN_HOLD") {
    return "Close blocked: minimum hold time is not complete."
  }
  if (blueprint === "POSITION_SEGMENT_DENYLIST") {
    return "Close blocked: this segment is not allowed for position close."
  }
  if (blueprint === "MAX_ORDER_QUANTITY_CAP") {
    return "Order blocked: quantity exceeds the maximum allowed per order."
  }
  if (blueprint === "MIN_ORDER_QUANTITY_FLOOR") {
    return "Order blocked: quantity is below the minimum order size."
  }
  if (blueprint === "MIN_ACCOUNT_BALANCE_ORDER") {
    return "Order blocked: account balance is below the required floor."
  }
  if (blueprint === "MAX_USED_MARGIN_ORDER") {
    return "Order blocked: used margin is above the allowed limit."
  }
  if (blueprint === "BLOCK_BUY_MARKET_ORDERS") {
    return "BUY blocked: MARKET orders are not allowed."
  }
  if (blueprint === "BLOCK_SELL_MARKET_ORDERS") {
    return "SELL blocked: MARKET orders are not allowed."
  }
  if (blueprint === "ALL_ORDERS_LIMIT_ONLY") {
    return "Order blocked: only LIMIT orders are allowed."
  }
  if (blueprint === "BLOCK_ALL_LIMIT_ORDERS") {
    return "Order blocked: LIMIT orders are not allowed."
  }
  if (blueprint === "MIN_LIMIT_ORDER_PRICE") {
    return "Order blocked: limit price is below the minimum."
  }
  if (blueprint === "MAX_LIMIT_ORDER_PRICE") {
    return "Order blocked: limit price is above the maximum."
  }
  if (blueprint === "BUY_MAX_TURNOVER") {
    return "BUY blocked: turnover exceeds the cap."
  }
  if (blueprint === "SELL_MAX_TURNOVER") {
    return "SELL blocked: turnover exceeds the cap."
  }
  if (blueprint === "HIGH_TURNOVER_LOW_BALANCE") {
    return "Order blocked: turnover is high while balance is too low."
  }
  if (blueprint === "LOW_MARGIN_HIGH_USED_MARGIN") {
    return "Order blocked: margin is tight and utilization is too high."
  }
  if (blueprint === "LOW_BALANCE_AND_LOW_MARGIN") {
    return "Order blocked: both balance and available margin are too low."
  }
  if (blueprint === "ORDER_USER_DENYLIST") {
    return "Order blocked: your account is not permitted to place orders."
  }
  if (blueprint === "POSITION_PRODUCT_DENYLIST_CLOSE") {
    return "Close blocked: this product type cannot be exited under policy."
  }
  if (blueprint === "BLOCK_PARTIAL_POSITION_CLOSE") {
    return "Close blocked: partial exits are not allowed; close the full position."
  }
  if (blueprint === "BLOCK_FULL_POSITION_CLOSE") {
    return "Close blocked: full exit is not allowed; reduce position partially."
  }
  if (blueprint === "MIN_REQUESTED_CLOSE_QUANTITY") {
    return "Close blocked: exit size is below the minimum."
  }
  if (blueprint === "MAX_REQUESTED_CLOSE_QUANTITY") {
    return "Close blocked: exit size exceeds the maximum."
  }
  if (blueprint === "BLOCK_CLOSE_LARGE_POSITION") {
    return "Close blocked: position size is above the allowed close threshold."
  }
  if (blueprint === "BLOCK_CLOSE_SMALL_POSITION") {
    return "Close blocked: position size is below the minimum for exit."
  }
  if (blueprint === "BLOCK_CLOSE_WHILE_PROFITABLE") {
    return "Close blocked: take-profit / winner hold policy is active."
  }
  if (blueprint === "BLOCK_CLOSE_DEEP_LOSS") {
    return "Close blocked: loss is beyond the allowed range (cool-off)."
  }
  if (blueprint === "MIN_REQUESTED_CLOSE_LOTS") {
    return "Close blocked: exit must be at least the minimum lot count."
  }
  if (blueprint === "MAX_REMAINING_QUANTITY_AFTER_CLOSE") {
    return "Close blocked: remaining position after exit would violate policy."
  }
  if (blueprint === "POSITION_USER_DENYLIST") {
    return "Close blocked: your account is not permitted to exit positions."
  }
  if (blueprint === "BLOCK_INTRADAY_POSITION_CLOSE") {
    return "Close blocked: intraday positions cannot be manually closed."
  }
  if (blueprint === "BLOCK_OVERNIGHT_POSITION_CLOSE") {
    return "Close blocked: carryforward positions cannot be manually closed."
  }
  if (blueprint === "ORDER_COOLOFF_MINUTES") {
    return "Order blocked: trading is restricted during the market opening cooloff window."
  }
  return "Action blocked by imported policy."
}

export function createDefaultPolicyStudioDraft(blueprint: PolicyStudioBlueprint = "BUY_ABOVE_LTP_OFFSET"): PolicyStudioDraft {
  const profile = getPolicyStudioBlueprintProfile(blueprint)
  const defaultPnlAmountThreshold = blueprint === "BLOCK_CLOSE_DEEP_LOSS" ? -5000 : 1000
  return {
    authoringMode: "PRESET",
    blueprint,
    context: profile.context,
    name: profile.label,
    description: profile.briefing,
    enabled: true,
    priority: 300,
    matchType: "ALL",
    actionMessage: getBlueprintDefaultMessage(blueprint),
    retryAfterSeconds: null,
    segmentCsv: "NSE,NFO,MCX",
    productTypeCsv: "",
    thresholdPercent: 0.5,
    holdMinutes: 5,
    minAvailableMargin: 10000,
    maxOrderTurnover: 1000000,
    enforceLimitOnly: true,
    maxOrderQuantity: 1_000_000,
    minOrderQuantity: 1,
    minAccountBalance: 1_000,
    maxUsedMargin: 100_000_000,
    minOrderPrice: 0.01,
    maxOrderPrice: 10_000_000,
    minCloseQuantity: 1,
    maxCloseQuantity: 5_000_000,
    minPositionQuantity: 1,
    maxPositionQuantity: 5_000_000,
    pnlAmountThreshold: defaultPnlAmountThreshold,
    minCloseLots: 1,
    maxRemainingAfterClose: 0,
    userIdDenyCsv: "",
    metadata: {},
    rawConditions: [],
    customConditions: [],
  }
}

function findCondition(
  conditions: TradingPolicyCondition[],
  field: string,
  operators?: PolicyOperator[],
): TradingPolicyCondition | undefined {
  return conditions.find((condition) => {
    if (condition.field !== field) {
      return false
    }
    if (!operators || operators.length === 0) {
      return true
    }
    return operators.includes(condition.operator)
  })
}

export function inferPolicyBlueprint(policy: TradingPolicyDefinition): PolicyStudioBlueprint {
  const metadataBlueprint = policy.metadata?.policyBlueprint as PolicyStudioBlueprint | undefined
  if (metadataBlueprint && POLICY_STUDIO_BLUEPRINTS.some((entry) => entry.value === metadataBlueprint)) {
    return metadataBlueprint
  }
  const hasNegativePnlLock =
    policy.context === "POSITION_CLOSE" &&
    Boolean(findCondition(policy.conditions, "position.unrealizedPnl", ["LT"])) &&
    Boolean(findCondition(policy.conditions, "position.holdMinutes", ["LT", "LTE"]))
  if (hasNegativePnlLock) {
    return "NEGATIVE_PNL_CLOSE_DELAY"
  }
  const buyLtpOffset =
    policy.context === "ORDER_PLACE" &&
    String(findCondition(policy.conditions, "order.side", ["EQ"])?.value || "").toUpperCase() === "BUY" &&
    Boolean(findCondition(policy.conditions, "order.priceOffsetFromLtpPercent", ["GTE"]))
  if (buyLtpOffset) {
    return "BUY_ABOVE_LTP_OFFSET"
  }
  const sellLtpOffset =
    policy.context === "ORDER_PLACE" &&
    String(findCondition(policy.conditions, "order.side", ["EQ"])?.value || "").toUpperCase() === "SELL" &&
    Boolean(findCondition(policy.conditions, "order.priceOffsetFromLtpPercent", ["LTE"]))
  if (sellLtpOffset) {
    return "SELL_BELOW_LTP_OFFSET"
  }
  const highTurnoverLowBal =
    policy.context === "ORDER_PLACE" &&
    Boolean(findCondition(policy.conditions, "order.turnover", ["GT"])) &&
    Boolean(findCondition(policy.conditions, "account.balance", ["LT"]))
  if (highTurnoverLowBal) {
    return "HIGH_TURNOVER_LOW_BALANCE"
  }
  const lowMarginHighUsed =
    policy.context === "ORDER_PLACE" &&
    Boolean(findCondition(policy.conditions, "account.availableMargin", ["LT"])) &&
    Boolean(findCondition(policy.conditions, "account.usedMargin", ["GT"]))
  if (lowMarginHighUsed) {
    return "LOW_MARGIN_HIGH_USED_MARGIN"
  }
  const lowBalLowMargin =
    policy.context === "ORDER_PLACE" &&
    Boolean(findCondition(policy.conditions, "account.balance", ["LT"])) &&
    Boolean(findCondition(policy.conditions, "account.availableMargin", ["LT"]))
  if (lowBalLowMargin) {
    return "LOW_BALANCE_AND_LOW_MARGIN"
  }
  const highTurnLowMargin =
    policy.context === "ORDER_PLACE" &&
    Boolean(findCondition(policy.conditions, "order.turnover", ["GT"])) &&
    Boolean(findCondition(policy.conditions, "account.availableMargin", ["LT"]))
  if (highTurnLowMargin) {
    return "HIGH_TURNOVER_AND_LOW_MARGIN"
  }
  if (
    policy.context === "ORDER_PLACE" &&
    policy.conditions.length === 1 &&
    findCondition(policy.conditions, "account.availableMargin", ["LT"])
  ) {
    return "MIN_AVAILABLE_MARGIN"
  }
  if (
    policy.context === "ORDER_PLACE" &&
    policy.conditions.length === 1 &&
    findCondition(policy.conditions, "order.turnover", ["GT"])
  ) {
    return "MAX_ORDER_TURNOVER"
  }
  const denyBySegment =
    policy.context === "ORDER_PLACE" &&
    policy.conditions.length === 1 &&
    Boolean(findCondition(policy.conditions, "order.segment", ["IN"]))
  if (denyBySegment) {
    return "SEGMENT_DENYLIST"
  }
  if (
    policy.context === "ORDER_PLACE" &&
    policy.conditions.length === 1 &&
    Boolean(findCondition(policy.conditions, "order.minutesSinceOpen", ["LT"]))
  ) {
    return "ORDER_COOLOFF_MINUTES"
  }
  return "RAW_POLICY_LOCK"
}

function hydratePresetDraftFromSavedPolicy(
  policy: TradingPolicyDefinition,
  blueprint: PolicyStudioBlueprint,
): Partial<PolicyStudioDraft> {
  const c = policy.conditions
  const out: Partial<PolicyStudioDraft> = {}
  const num = parseConditionNumber
  const pickGt = (field: string) => {
    const x = findCondition(c, field, ["GT"])
    return x && num(x.value) !== null ? num(x.value)! : null
  }
  const pickLt = (field: string) => {
    const x = findCondition(c, field, ["LT"])
    return x && num(x.value) !== null ? num(x.value)! : null
  }

  if (blueprint === "MAX_ORDER_QUANTITY_CAP") {
    const v = pickGt("order.quantity")
    if (v !== null) {
      out.maxOrderQuantity = Math.max(1, v)
    }
  }
  if (blueprint === "MIN_ORDER_QUANTITY_FLOOR") {
    const v = pickLt("order.quantity")
    if (v !== null) {
      out.minOrderQuantity = Math.max(1, v)
    }
  }
  if (blueprint === "MIN_ACCOUNT_BALANCE_ORDER" || blueprint === "HIGH_TURNOVER_LOW_BALANCE") {
    const v = pickLt("account.balance")
    if (v !== null) {
      out.minAccountBalance = Math.max(0, v)
    }
  }
  if (blueprint === "MAX_USED_MARGIN_ORDER" || blueprint === "LOW_MARGIN_HIGH_USED_MARGIN") {
    const v = pickGt("account.usedMargin")
    if (v !== null) {
      out.maxUsedMargin = Math.max(0, v)
    }
  }
  if (blueprint === "MIN_LIMIT_ORDER_PRICE") {
    const v = pickLt("order.price")
    if (v !== null) {
      out.minOrderPrice = Math.max(0, v)
    }
  }
  if (blueprint === "MAX_LIMIT_ORDER_PRICE") {
    const v = pickGt("order.price")
    if (v !== null) {
      out.maxOrderPrice = Math.max(0, v)
    }
  }
  if (
    blueprint === "BUY_MAX_TURNOVER" ||
    blueprint === "SELL_MAX_TURNOVER" ||
    blueprint === "HIGH_TURNOVER_LOW_BALANCE"
  ) {
    const v = pickGt("order.turnover")
    if (v !== null) {
      out.maxOrderTurnover = Math.max(1, v)
    }
  }
  if (blueprint === "LOW_BALANCE_AND_LOW_MARGIN") {
    const b = pickLt("account.balance")
    const m = pickLt("account.availableMargin")
    if (b !== null) {
      out.minAccountBalance = Math.max(0, b)
    }
    if (m !== null) {
      out.minAvailableMargin = Math.max(0, m)
    }
  }
  if (
    blueprint === "LOW_MARGIN_HIGH_USED_MARGIN" ||
    blueprint === "HIGH_TURNOVER_AND_LOW_MARGIN" ||
    blueprint === "LOW_BALANCE_AND_LOW_MARGIN"
  ) {
    const m = pickLt("account.availableMargin")
    if (m !== null) {
      out.minAvailableMargin = Math.max(0, m)
    }
  }
  if (blueprint === "MIN_REQUESTED_CLOSE_QUANTITY") {
    const v = pickLt("position.requestedCloseQuantity")
    if (v !== null) {
      out.minCloseQuantity = Math.max(1, v)
    }
  }
  if (blueprint === "MAX_REQUESTED_CLOSE_QUANTITY") {
    const v = pickGt("position.requestedCloseQuantity")
    if (v !== null) {
      out.maxCloseQuantity = Math.max(1, v)
    }
  }
  if (blueprint === "BLOCK_CLOSE_SMALL_POSITION") {
    const v = pickLt("position.quantity")
    if (v !== null) {
      out.minPositionQuantity = v
    }
  }
  if (blueprint === "BLOCK_CLOSE_LARGE_POSITION") {
    const v = pickGt("position.quantity")
    if (v !== null) {
      out.maxPositionQuantity = Math.max(1, v)
    }
  }
  if (blueprint === "BLOCK_CLOSE_WHILE_PROFITABLE") {
    const x = findCondition(c, "position.unrealizedPnl", ["GT"])
    if (x && num(x.value) !== null) {
      out.pnlAmountThreshold = num(x.value)!
    }
  }
  if (blueprint === "BLOCK_CLOSE_DEEP_LOSS") {
    const x = findCondition(c, "position.unrealizedPnl", ["LT"])
    if (x && num(x.value) !== null) {
      out.pnlAmountThreshold = num(x.value)!
    }
  }
  if (blueprint === "MIN_REQUESTED_CLOSE_LOTS") {
    const x = findCondition(c, "position.requestedCloseLots", ["LT"])
    if (x && num(x.value) !== null) {
      out.minCloseLots = Math.max(0, num(x.value)!)
    }
  }
  if (blueprint === "MAX_REMAINING_QUANTITY_AFTER_CLOSE") {
    const x = findCondition(c, "position.remainingQuantityAfterClose", ["GT"])
    if (x && num(x.value) !== null) {
      out.maxRemainingAfterClose = Math.max(0, num(x.value)!)
    }
  }
  if (blueprint === "ORDER_COOLOFF_MINUTES") {
    const x = findCondition(c, "order.minutesSinceOpen", ["LT"])
    if (x && num(x.value) !== null) {
      out.holdMinutes = Math.max(1, num(x.value)!)
    }
  }
  const userIn = findCondition(c, "meta.userId", ["IN"])
  if (blueprint === "ORDER_USER_DENYLIST" || blueprint === "POSITION_USER_DENYLIST") {
    const v = userIn?.value
    if (Array.isArray(v)) {
      out.userIdDenyCsv = v.map((x) => String(x).trim()).filter(Boolean).join(", ")
    }
  }
  const posProd = findCondition(c, "position.productType", ["IN"])
  if (blueprint === "POSITION_PRODUCT_DENYLIST_CLOSE" && posProd?.value) {
    out.productTypeCsv = parseConditionCsv(posProd.value)
  }
  return out
}

export function createPolicyStudioDraftFromDefinition(policy: TradingPolicyDefinition): PolicyStudioDraft {
  const inferredBlueprint = inferPolicyBlueprint(policy)
  const mb = policy.metadata?.policyBlueprint as PolicyStudioBlueprint | undefined
  const mbValid = Boolean(mb && POLICY_STUDIO_BLUEPRINTS.some((entry) => entry.value === mb))
  const presetBlueprint = mbValid ? mb! : inferredBlueprint
  const baseDraft = createDefaultPolicyStudioDraft(presetBlueprint)
  const isCustomAuthoring =
    String(policy.metadata?.policyAuthoringMode || "").toUpperCase() === "CUSTOM" ||
    inferredBlueprint === "RAW_POLICY_LOCK"
  const offsetCondition = findCondition(policy.conditions, "order.priceOffsetFromLtpPercent", ["GTE", "LTE"])
  const holdCondition = findCondition(policy.conditions, "position.holdMinutes", ["LT", "LTE"])
  const minMarginCondition = findCondition(policy.conditions, "account.availableMargin", ["LT"])
  const turnoverCondition = findCondition(policy.conditions, "order.turnover", ["GT"])
  const enforceLimitOnly = Boolean(
    findCondition(policy.conditions, "order.orderType", ["EQ"]) &&
      String(findCondition(policy.conditions, "order.orderType", ["EQ"])?.value || "").toUpperCase() === "LIMIT",
  )
  const segmentCondition = findCondition(
    policy.conditions,
    policy.context === "POSITION_CLOSE" ? "position.segment" : "order.segment",
    ["IN"],
  )
  const productCondition = findCondition(policy.conditions, "order.productType", ["IN"])
  const numericHydration =
    !isCustomAuthoring && presetBlueprint !== "RAW_POLICY_LOCK"
      ? hydratePresetDraftFromSavedPolicy(policy, presetBlueprint)
      : {}

  return {
    ...baseDraft,
    authoringMode: isCustomAuthoring ? "CUSTOM" : "PRESET",
    blueprint: presetBlueprint,
    context: policy.context,
    name: policy.name,
    description: policy.description || "",
    enabled: policy.enabled,
    priority: policy.priority,
    matchType: policy.matchType,
    actionMessage: policy.action?.message || baseDraft.actionMessage,
    retryAfterSeconds:
      policy.action?.retryAfterSeconds === undefined
        ? null
        : normalizeRiskLimitNonNegativeIntegerInput(policy.action.retryAfterSeconds, 0),
    segmentCsv: parseConditionCsv(segmentCondition?.value) || baseDraft.segmentCsv,
    productTypeCsv: parseConditionCsv(productCondition?.value) || baseDraft.productTypeCsv,
    thresholdPercent:
      offsetCondition && parseConditionNumber(offsetCondition.value) !== null
        ? Math.abs(parseConditionNumber(offsetCondition.value)!)
        : baseDraft.thresholdPercent,
    holdMinutes:
      holdCondition && parseConditionNumber(holdCondition.value) !== null
        ? Math.max(1, Math.trunc(parseConditionNumber(holdCondition.value)!))
        : baseDraft.holdMinutes,
    minAvailableMargin:
      minMarginCondition && parseConditionNumber(minMarginCondition.value) !== null
        ? Math.max(0, parseConditionNumber(minMarginCondition.value)!)
        : baseDraft.minAvailableMargin,
    maxOrderTurnover:
      turnoverCondition && parseConditionNumber(turnoverCondition.value) !== null
        ? Math.max(1, parseConditionNumber(turnoverCondition.value)!)
        : baseDraft.maxOrderTurnover,
    enforceLimitOnly,
    metadata: policy.metadata || {},
    rawConditions: policy.conditions.map((condition) => ({
      ...condition,
      value: cloneConditionValue(condition.value),
    })),
    customConditions: policy.conditions.map((condition) => createCustomConditionDraftFromCondition(condition)),
    ...numericHydration,
  }
}

function buildCondition(
  field: string,
  operator: PolicyOperator,
  value: TradingPolicyCondition["value"],
): TradingPolicyCondition {
  return {
    id: createPolicyConditionId(),
    field,
    operator,
    value,
  }
}

export function buildPolicyDraftFromStudioDraft(studio: PolicyStudioDraft): TradingPolicyDraft {
  const profile = getPolicyStudioBlueprintProfile(studio.blueprint)
  const normalizedName = studio.name.trim() || profile.label
  const normalizedDescription = studio.description.trim()
  const actionMessage = studio.actionMessage.trim() || getBlueprintDefaultMessage(studio.blueprint)
  const segmentTokens = normalizeCsvTokenList(studio.segmentCsv)
  const productTypeTokens = normalizeCsvTokenList(studio.productTypeCsv)
  const conditions: TradingPolicyCondition[] = []
  const addOrderSegmentScope = () => {
    if (segmentTokens.length > 0) {
      conditions.push(buildCondition("order.segment", "IN", segmentTokens))
    }
  }
  const addPositionSegmentScope = () => {
    if (segmentTokens.length > 0) {
      conditions.push(buildCondition("position.segment", "IN", segmentTokens))
    }
  }
  const addOrderProductScope = () => {
    if (productTypeTokens.length > 0) {
      conditions.push(buildCondition("order.productType", "IN", productTypeTokens))
    }
  }
  const requireSegmentTokens = (message: string): string[] => {
    if (segmentTokens.length === 0) {
      throw new Error(message)
    }
    return segmentTokens
  }
  const requireProductTypeTokens = (message: string): string[] => {
    if (productTypeTokens.length === 0) {
      throw new Error(message)
    }
    return productTypeTokens
  }
  const requireUserIdTokens = (message: string): string[] => {
    const tokens = normalizeUserIdTokenList(studio.userIdDenyCsv)
    if (tokens.length === 0) {
      throw new Error(message)
    }
    return tokens
  }

  let compiledMatchType = studio.matchType

  if (studio.blueprint === "NEGATIVE_PNL_CLOSE_DELAY") {
    const holdMinutes = Math.max(1, Math.trunc(studio.holdMinutes))
    conditions.push(buildCondition("position.unrealizedPnl", "LT", 0))
    conditions.push(buildCondition("position.holdMinutes", "LT", holdMinutes))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "PROFIT_CLOSE_DELAY") {
    const holdMinutes = Math.max(1, Math.trunc(studio.holdMinutes))
    conditions.push(buildCondition("position.unrealizedPnl", "GT", 0))
    conditions.push(buildCondition("position.holdMinutes", "LT", holdMinutes))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "ANY_CLOSE_MIN_HOLD") {
    const holdMinutes = Math.max(1, Math.trunc(studio.holdMinutes))
    conditions.push(buildCondition("position.holdMinutes", "LT", holdMinutes))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "POSITION_SEGMENT_DENYLIST") {
    conditions.push(
      buildCondition(
        "position.segment",
        "IN",
        requireSegmentTokens("Add at least one segment for this preset."),
      ),
    )
  }

  if (studio.blueprint === "BUY_ABOVE_LTP_OFFSET") {
    const thresholdPercent = Math.abs(studio.thresholdPercent)
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    if (studio.enforceLimitOnly) {
      conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    }
    addOrderSegmentScope()
    addOrderProductScope()
    conditions.push(buildCondition("order.priceOffsetFromLtpPercent", "GTE", thresholdPercent))
  }

  if (studio.blueprint === "SELL_BELOW_LTP_OFFSET") {
    const thresholdPercent = Math.abs(studio.thresholdPercent)
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    if (studio.enforceLimitOnly) {
      conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    }
    addOrderSegmentScope()
    addOrderProductScope()
    conditions.push(buildCondition("order.priceOffsetFromLtpPercent", "LTE", -thresholdPercent))
  }

  if (studio.blueprint === "BUY_PRICE_BELOW_LTP") {
    const thresholdPercent = Math.abs(studio.thresholdPercent)
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    if (studio.enforceLimitOnly) {
      conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    }
    addOrderSegmentScope()
    addOrderProductScope()
    conditions.push(buildCondition("order.priceOffsetFromLtpPercent", "LTE", -thresholdPercent))
  }

  if (studio.blueprint === "SELL_PRICE_ABOVE_LTP") {
    const thresholdPercent = Math.abs(studio.thresholdPercent)
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    if (studio.enforceLimitOnly) {
      conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    }
    addOrderSegmentScope()
    addOrderProductScope()
    conditions.push(buildCondition("order.priceOffsetFromLtpPercent", "GTE", thresholdPercent))
  }

  if (studio.blueprint === "MIN_AVAILABLE_MARGIN") {
    const minMargin = Math.max(0, studio.minAvailableMargin)
    conditions.push(buildCondition("account.availableMargin", "LT", minMargin))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "LOW_MARGIN_BUY_GUARD") {
    const minMargin = Math.max(0, studio.minAvailableMargin)
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    conditions.push(buildCondition("account.availableMargin", "LT", minMargin))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "LOW_MARGIN_SELL_GUARD") {
    const minMargin = Math.max(0, studio.minAvailableMargin)
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    conditions.push(buildCondition("account.availableMargin", "LT", minMargin))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MAX_ORDER_TURNOVER") {
    const maxTurnover = Math.max(1, studio.maxOrderTurnover)
    conditions.push(buildCondition("order.turnover", "GT", maxTurnover))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "HIGH_TURNOVER_AND_LOW_MARGIN") {
    const maxTurnover = Math.max(1, studio.maxOrderTurnover)
    const minMargin = Math.max(0, studio.minAvailableMargin)
    conditions.push(buildCondition("order.turnover", "GT", maxTurnover))
    conditions.push(buildCondition("account.availableMargin", "LT", minMargin))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "SEGMENT_DENYLIST") {
    conditions.push(
      buildCondition(
        "order.segment",
        "IN",
        requireSegmentTokens("Add at least one segment for this preset."),
      ),
    )
  }

  if (studio.blueprint === "BUY_SEGMENT_DENYLIST") {
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    conditions.push(
      buildCondition(
        "order.segment",
        "IN",
        requireSegmentTokens("Add at least one segment for this preset."),
      ),
    )
  }

  if (studio.blueprint === "SELL_SEGMENT_DENYLIST") {
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    conditions.push(
      buildCondition(
        "order.segment",
        "IN",
        requireSegmentTokens("Add at least one segment for this preset."),
      ),
    )
  }

  if (studio.blueprint === "BUY_LIMIT_ONLY") {
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    conditions.push(buildCondition("order.orderType", "NEQ", "LIMIT"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "SELL_LIMIT_ONLY") {
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    conditions.push(buildCondition("order.orderType", "NEQ", "LIMIT"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "BLOCK_MARKET_ORDERS") {
    conditions.push(buildCondition("order.orderType", "EQ", "MARKET"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "PRODUCT_TYPE_DENYLIST") {
    conditions.push(
      buildCondition(
        "order.productType",
        "IN",
        requireProductTypeTokens("Add at least one product type for this preset."),
      ),
    )
    addOrderSegmentScope()
  }

  if (studio.blueprint === "PRODUCT_TYPE_ALLOWLIST") {
    conditions.push(
      buildCondition(
        "order.productType",
        "NOT_IN",
        requireProductTypeTokens("Add at least one allowed product type for this preset."),
      ),
    )
    addOrderSegmentScope()
  }

  if (studio.blueprint === "MAX_ORDER_QUANTITY_CAP") {
    const maxQty = Math.max(1, Math.trunc(studio.maxOrderQuantity))
    conditions.push(buildCondition("order.quantity", "GT", maxQty))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MIN_ORDER_QUANTITY_FLOOR") {
    const minQty = Math.max(1, Math.trunc(studio.minOrderQuantity))
    conditions.push(buildCondition("order.quantity", "LT", minQty))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MIN_ACCOUNT_BALANCE_ORDER") {
    const floor = Math.max(0, studio.minAccountBalance)
    conditions.push(buildCondition("account.balance", "LT", floor))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MAX_USED_MARGIN_ORDER") {
    const cap = Math.max(0, studio.maxUsedMargin)
    conditions.push(buildCondition("account.usedMargin", "GT", cap))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "BLOCK_BUY_MARKET_ORDERS") {
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    conditions.push(buildCondition("order.orderType", "EQ", "MARKET"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "BLOCK_SELL_MARKET_ORDERS") {
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    conditions.push(buildCondition("order.orderType", "EQ", "MARKET"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "ALL_ORDERS_LIMIT_ONLY") {
    conditions.push(buildCondition("order.orderType", "NEQ", "LIMIT"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "BLOCK_ALL_LIMIT_ORDERS") {
    conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MIN_LIMIT_ORDER_PRICE") {
    const minPx = Math.max(0, studio.minOrderPrice)
    conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    conditions.push(buildCondition("order.price", "LT", minPx))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "MAX_LIMIT_ORDER_PRICE") {
    const maxPx = Math.max(0, studio.maxOrderPrice)
    conditions.push(buildCondition("order.orderType", "EQ", "LIMIT"))
    conditions.push(buildCondition("order.price", "GT", maxPx))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "BUY_MAX_TURNOVER") {
    const cap = Math.max(1, studio.maxOrderTurnover)
    conditions.push(buildCondition("order.side", "EQ", "BUY"))
    conditions.push(buildCondition("order.turnover", "GT", cap))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "SELL_MAX_TURNOVER") {
    const cap = Math.max(1, studio.maxOrderTurnover)
    conditions.push(buildCondition("order.side", "EQ", "SELL"))
    conditions.push(buildCondition("order.turnover", "GT", cap))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "HIGH_TURNOVER_LOW_BALANCE") {
    const cap = Math.max(1, studio.maxOrderTurnover)
    const floor = Math.max(0, studio.minAccountBalance)
    conditions.push(buildCondition("order.turnover", "GT", cap))
    conditions.push(buildCondition("account.balance", "LT", floor))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "LOW_MARGIN_HIGH_USED_MARGIN") {
    const minMar = Math.max(0, studio.minAvailableMargin)
    const capUsed = Math.max(0, studio.maxUsedMargin)
    conditions.push(buildCondition("account.availableMargin", "LT", minMar))
    conditions.push(buildCondition("account.usedMargin", "GT", capUsed))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "LOW_BALANCE_AND_LOW_MARGIN") {
    const floor = Math.max(0, studio.minAccountBalance)
    const minMar = Math.max(0, studio.minAvailableMargin)
    conditions.push(buildCondition("account.balance", "LT", floor))
    conditions.push(buildCondition("account.availableMargin", "LT", minMar))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "ORDER_USER_DENYLIST") {
    conditions.push(buildCondition("meta.userId", "IN", requireUserIdTokens("Add at least one user ID to block.")))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "POSITION_PRODUCT_DENYLIST_CLOSE") {
    conditions.push(
      buildCondition(
        "position.productType",
        "IN",
        requireProductTypeTokens("Add at least one product type to block on close."),
      ),
    )
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_PARTIAL_POSITION_CLOSE") {
    conditions.push(buildCondition("position.remainingQuantityAfterClose", "GT", 0))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_FULL_POSITION_CLOSE") {
    conditions.push(buildCondition("position.remainingQuantityAfterClose", "EQ", 0))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "MIN_REQUESTED_CLOSE_QUANTITY") {
    const minQ = Math.max(1, Math.trunc(studio.minCloseQuantity))
    conditions.push(buildCondition("position.requestedCloseQuantity", "LT", minQ))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "MAX_REQUESTED_CLOSE_QUANTITY") {
    const maxQ = Math.max(1, Math.trunc(studio.maxCloseQuantity))
    conditions.push(buildCondition("position.requestedCloseQuantity", "GT", maxQ))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_CLOSE_LARGE_POSITION") {
    const maxPos = Math.max(1, Math.trunc(studio.maxPositionQuantity))
    conditions.push(buildCondition("position.quantity", "GT", maxPos))
    conditions.push(buildCondition("position.quantity", "LT", -maxPos))
    addPositionSegmentScope()
    compiledMatchType = "ANY"
  }

  if (studio.blueprint === "BLOCK_CLOSE_SMALL_POSITION") {
    const minPos = Math.max(0, studio.minPositionQuantity)
    conditions.push(buildCondition("position.quantity", "LT", minPos))
    conditions.push(buildCondition("position.quantity", "GT", 0))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_CLOSE_WHILE_PROFITABLE") {
    const thresh = studio.pnlAmountThreshold
    conditions.push(buildCondition("position.unrealizedPnl", "GT", thresh))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_CLOSE_DEEP_LOSS") {
    const thresh = studio.pnlAmountThreshold
    conditions.push(buildCondition("position.unrealizedPnl", "LT", thresh))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "MIN_REQUESTED_CLOSE_LOTS") {
    const minLots = Math.max(0, studio.minCloseLots)
    conditions.push(buildCondition("position.requestedCloseLots", "LT", minLots))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "MAX_REMAINING_QUANTITY_AFTER_CLOSE") {
    const maxRem = Math.max(0, Math.trunc(studio.maxRemainingAfterClose))
    conditions.push(buildCondition("position.remainingQuantityAfterClose", "GT", maxRem))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "POSITION_USER_DENYLIST") {
    conditions.push(buildCondition("meta.userId", "IN", requireUserIdTokens("Add at least one user ID to block.")))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_INTRADAY_POSITION_CLOSE") {
    conditions.push(buildCondition("position.isIntraday", "EQ", 1))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "BLOCK_OVERNIGHT_POSITION_CLOSE") {
    conditions.push(buildCondition("position.isIntraday", "EQ", 0))
    addPositionSegmentScope()
  }

  if (studio.blueprint === "ORDER_COOLOFF_MINUTES") {
    const cooloffMinutes = Math.max(1, Math.trunc(studio.holdMinutes))
    conditions.push(buildCondition("order.minutesSinceOpen", "LT", cooloffMinutes))
    addOrderSegmentScope()
    addOrderProductScope()
  }

  if (studio.blueprint === "RAW_POLICY_LOCK") {
    conditions.push(
      ...studio.rawConditions.map((condition) => ({
        ...condition,
        value: cloneConditionValue(condition.value),
      })),
    )
  }

  if (conditions.length === 0) {
    throw new Error("Policy blueprint parameters are incomplete. Configure at least one effective rule condition.")
  }

  return {
    name: normalizedName,
    description: normalizedDescription,
    context: studio.blueprint === "RAW_POLICY_LOCK" ? studio.context : profile.context,
    enabled: studio.enabled,
    priority: Math.max(0, Math.trunc(studio.priority)),
    matchType: compiledMatchType,
    conditions,
    action: {
      type: "BLOCK",
      message: actionMessage,
      retryAfterSeconds:
        studio.retryAfterSeconds === null
          ? null
          : normalizeRiskLimitNonNegativeIntegerInput(studio.retryAfterSeconds, 0),
    },
    metadata: {
      ...studio.metadata,
      policyBlueprint: studio.blueprint,
      policyStudioVersion: "v2",
      policyAuthoringMode: "PRESET",
    },
  }
}

export function buildCustomPolicyDraftFromStudioDraft(
  studio: PolicyStudioDraft,
  catalog: TradingPolicyCatalog | null,
): TradingPolicyDraft {
  if (!catalog) {
    throw new Error("Policy catalog is unavailable. Please refresh and try again.")
  }
  const contextFields = getCatalogFieldsForContext(catalog, studio.context)
  if (contextFields.length === 0) {
    throw new Error("No fields are available for the selected context.")
  }
  if (studio.customConditions.length === 0) {
    throw new Error("Add at least one condition in Custom mode.")
  }

  const normalizedName = studio.name.trim() || "Custom Policy"
  const normalizedDescription = studio.description.trim()
  const actionMessage = studio.actionMessage.trim() || "Action blocked by custom policy."
  const conditions: TradingPolicyCondition[] = studio.customConditions.map((condition, index) => {
    const rowNumber = index + 1
    if (!condition.field) {
      throw new Error(`Condition ${rowNumber}: select a field.`)
    }
    const fieldEntry = contextFields.find((field) => field.field === condition.field)
    if (!fieldEntry) {
      throw new Error(`Condition ${rowNumber}: field is not valid for ${studio.context}.`)
    }
    const operatorEntry = catalog.operators.find((operator) => operator.value === condition.operator)
    if (!operatorEntry) {
      throw new Error(`Condition ${rowNumber}: select a valid operator.`)
    }
    if (!operatorEntry.supportedDataTypes.includes(fieldEntry.dataType)) {
      throw new Error(`Condition ${rowNumber}: operator "${operatorEntry.label}" does not support ${fieldEntry.label}.`)
    }

    const isListOperator = condition.operator === "IN" || condition.operator === "NOT_IN"
    let parsedValue: TradingPolicyCondition["value"]

    if (isListOperator) {
      const tokens = condition.valueInput
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
      if (tokens.length === 0) {
        throw new Error(`Condition ${rowNumber}: provide one or more comma-separated values for ${fieldEntry.label}.`)
      }
      if (fieldEntry.dataType === "number") {
        const parsedNumbers = tokens.map((token) => Number(token))
        if (parsedNumbers.some((token) => !Number.isFinite(token))) {
          throw new Error(`Condition ${rowNumber}: all values for ${fieldEntry.label} must be valid numbers.`)
        }
        parsedValue = parsedNumbers
      } else {
        parsedValue = tokens
      }
    } else {
      const normalizedValue = condition.valueInput.trim()
      if (!normalizedValue) {
        throw new Error(`Condition ${rowNumber}: value is required for ${fieldEntry.label}.`)
      }
      if (fieldEntry.dataType === "number") {
        const parsedNumber = Number(normalizedValue)
        if (!Number.isFinite(parsedNumber)) {
          throw new Error(`Condition ${rowNumber}: value for ${fieldEntry.label} must be a valid number.`)
        }
        parsedValue = parsedNumber
      } else {
        parsedValue = normalizedValue
      }
    }

    return buildCondition(condition.field, condition.operator, parsedValue)
  })

  return {
    name: normalizedName,
    description: normalizedDescription,
    context: studio.context,
    enabled: studio.enabled,
    priority: Math.max(0, Math.trunc(studio.priority)),
    matchType: studio.matchType,
    conditions,
    action: {
      type: "BLOCK",
      message: actionMessage,
      retryAfterSeconds:
        studio.retryAfterSeconds === null
          ? null
          : normalizeRiskLimitNonNegativeIntegerInput(studio.retryAfterSeconds, 0),
    },
    metadata: {
      ...studio.metadata,
      policyBlueprint: "RAW_POLICY_LOCK",
      policyStudioVersion: "v3",
      policyAuthoringMode: "CUSTOM",
    },
  }
}

export function compilePolicyDraftFromStudioDraft(
  studio: PolicyStudioDraft,
  catalog: TradingPolicyCatalog | null,
): TradingPolicyDraft {
  if (studio.authoringMode === "CUSTOM") {
    return buildCustomPolicyDraftFromStudioDraft(studio, catalog)
  }
  return buildPolicyDraftFromStudioDraft(studio)
}

export function stringifyConditionValue(value: TradingPolicyCondition["value"]): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ")
  }
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

export function formatConditionSummary(condition: TradingPolicyCondition): string {
  return `${condition.field} ${condition.operator} ${stringifyConditionValue(condition.value)}`
}
