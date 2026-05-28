/**
 * @file trading-policy-plain-summary.ts
 * @module admin-console
 * @description Plain-language summaries of trading policies for admins without technical condition jargon.
 * @author StockTrade
 * @created 2026-03-30
 */

import { getPolicyStudioBlueprintProfile, inferPolicyBlueprint } from "./trading-policy-studio-state"
import type { TradingPolicyDefinition, TradingPolicyDraft } from "./trading-policy-types"

/** Build a definition-shaped object for summary helpers (e.g. review step before save). */
export function previewPolicyFromDraft(draft: TradingPolicyDraft): TradingPolicyDefinition {
  return {
    id: "preview",
    name: draft.name,
    description: draft.description,
    context: draft.context,
    enabled: draft.enabled,
    priority: draft.priority,
    matchType: draft.matchType,
    conditions: draft.conditions,
    action: draft.action,
    createdAt: "",
    updatedAt: "",
    source: "dynamic",
    readOnly: false,
    metadata: draft.metadata,
  }
}

const CONTEXT_LABEL: Record<string, string> = {
  ORDER_PLACE: "when placing orders",
  POSITION_CLOSE: "when closing positions",
}

const MATCH_PLAIN: Record<string, string> = {
  ALL: "All of the following must be true.",
  ANY: "Any one of the following can trigger the block.",
}

/**
 * One-line summary for tables and headers.
 */
export function summarizePolicyPlainLine(policy: TradingPolicyDefinition): string {
  const blueprint = inferPolicyBlueprint(policy)
  const profile = getPolicyStudioBlueprintProfile(blueprint)
  const ctx = CONTEXT_LABEL[policy.context] || policy.context
  if (policy.metadata?.policyAuthoringMode === "CUSTOM" || blueprint === "RAW_POLICY_LOCK") {
    return `Custom rule ${ctx}: ${policy.name || "Unnamed policy"}.`
  }
  return `${profile.label} ${ctx}.`
}

/**
 * Short bullet list for review step and tooltips.
 */
export function summarizePolicyPlainBullets(policy: TradingPolicyDefinition): string[] {
  const lines: string[] = []
  const ctx = CONTEXT_LABEL[policy.context] || policy.context
  lines.push(`Applies: ${ctx}.`)
  if (policy.matchType) {
    lines.push(MATCH_PLAIN[policy.matchType] || `Match: ${policy.matchType}.`)
  }
  const blueprint = inferPolicyBlueprint(policy)
  const profile = getPolicyStudioBlueprintProfile(blueprint)
  if (policy.metadata?.policyAuthoringMode !== "CUSTOM" && blueprint !== "RAW_POLICY_LOCK") {
    lines.push(`Template: ${profile.label} (${profile.complexity} difficulty).`)
    lines.push(profile.briefing)
  } else if (policy.conditions.length > 0) {
    lines.push("Checks:")
    for (const c of policy.conditions) {
      lines.push(`• ${humanizeConditionLine(c.field, c.operator, c.value)}`)
    }
  }
  if (policy.action?.message) {
    lines.push(`Traders see: "${policy.action.message}"`)
  }
  lines.push(`Priority ${policy.priority} (higher numbers run before lower when policies overlap).`)
  return lines
}

function humanizeConditionLine(field: string, operator: string, value: unknown): string {
  const v = Array.isArray(value) ? value.join(", ") : String(value)
  const opWords: Record<string, string> = {
    GT: "is greater than",
    GTE: "is at least",
    LT: "is less than",
    LTE: "is at most",
    EQ: "is",
    NEQ: "is not",
    IN: "is one of",
    NOT_IN: "is not one of",
  }
  const op = opWords[operator] || operator.toLowerCase()
  const friendlyFields: Record<string, string> = {
    "order.side": "Order side",
    "order.orderType": "Order type",
    "order.segment": "Segment",
    "order.productType": "Product type",
    "order.quantity": "Order quantity",
    "order.price": "Order price",
    "order.turnover": "Order turnover",
    "order.priceOffsetFromLtpPercent": "Price vs LTP (%)",
    "position.unrealizedPnl": "Unrealized P&L",
    "position.holdMinutes": "Minutes held",
    "position.segment": "Position segment",
    "position.quantity": "Open quantity",
    "position.requestedCloseQuantity": "Requested close quantity",
    "position.requestedCloseLots": "Requested close lots",
    "position.remainingQuantityAfterClose": "Remaining quantity after close",
    "position.isIntraday": "Intraday flag (1=yes)",
    "position.productType": "Position product type",
    "account.availableMargin": "Available margin",
    "account.balance": "Account balance",
    "account.usedMargin": "Used margin",
    "meta.userId": "User ID",
  }
  const label = friendlyFields[field] || field
  return `${label} ${op} ${v}.`
}

/**
 * Friendly lines from compiled condition summaries (technical fallback).
 */
export function conditionSummariesToFriendly(policy: TradingPolicyDefinition): string[] {
  return policy.conditions.map((c) => humanizeConditionLine(c.field, c.operator, c.value))
}
