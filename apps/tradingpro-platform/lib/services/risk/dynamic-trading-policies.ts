/**
 * @file dynamic-trading-policies.ts
 * @module risk
 * @description Dynamic, SystemSettings-backed trading policy engine with admin CRUD and runtime policy evaluation.
 * @author StockTrade
 * @created 2026-02-17
 */

import { baseLogger } from "@/lib/observability/logger"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import { getLatestActiveGlobalSettings, upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import { getTradingPolicies as getLegacyTradingPolicies } from "@/lib/services/risk/trading-policies"
import { AppError } from "@/src/common/errors"

export const DYNAMIC_TRADING_POLICIES_KEY = "trading_policy_definitions_v1" as const

const LEGACY_NEGATIVE_PNL_POLICY_ID = "legacy-negative-pnl-close-delay"
const MAX_POLICY_NAME_LENGTH = 120
const MAX_POLICY_DESCRIPTION_LENGTH = 500
const MAX_POLICY_MESSAGE_LENGTH = 300
const MAX_POLICY_COUNT = 200
export { MAX_POLICY_CONDITIONS } from "@/lib/services/risk/policy-constants"
import { MAX_POLICY_CONDITIONS } from "@/lib/services/risk/policy-constants"
const MAX_POLICY_PRIORITY = 10_000
const DEFAULT_POLICY_CACHE_TTL_MS = 30_000

const log = baseLogger.child({ module: "dynamic-trading-policies" })

export type TradingPolicyContext = "POSITION_CLOSE" | "ORDER_PLACE"
export type TradingPolicyMatchType = "ALL" | "ANY"
export type TradingPolicyDataType = "number" | "string"
export type TradingPolicyOperator = "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ" | "IN" | "NOT_IN"
export type TradingPolicyActionType = "BLOCK"
export type TradingPolicySource = "dynamic" | "legacy"

export type TradingPolicyConditionValue = number | string | number[] | string[]

export interface TradingPolicyFieldCatalogEntry {
  field: string
  label: string
  dataType: TradingPolicyDataType
}

export interface TradingPolicyOperatorCatalogEntry {
  value: TradingPolicyOperator
  label: string
  supportedDataTypes: TradingPolicyDataType[]
}

export interface TradingPolicyCatalog {
  contexts: Array<{ value: TradingPolicyContext; label: string }>
  matchTypes: Array<{ value: TradingPolicyMatchType; label: string }>
  operators: TradingPolicyOperatorCatalogEntry[]
  fieldsByContext: Record<TradingPolicyContext, TradingPolicyFieldCatalogEntry[]>
  actions: Array<{ value: TradingPolicyActionType; label: string }>
}

export interface TradingPolicyCondition {
  id: string
  field: string
  operator: TradingPolicyOperator
  value: TradingPolicyConditionValue
}

export interface TradingPolicyAction {
  type: TradingPolicyActionType
  message: string
  retryAfterSeconds?: number | null
}

export interface TradingPolicyDefinition {
  id: string
  name: string
  description: string
  context: TradingPolicyContext
  enabled: boolean
  priority: number
  matchType: TradingPolicyMatchType
  conditions: TradingPolicyCondition[]
  action: TradingPolicyAction
  createdAt: string
  updatedAt: string
  source: TradingPolicySource
  readOnly: boolean
  metadata?: Record<string, string>
}

export interface TradingPolicyEvaluationSnapshot {
  position?: {
    unrealizedPnl?: unknown
    holdMinutes?: unknown
    quantity?: unknown
    lotSize?: unknown
    requestedCloseQuantity?: unknown
    requestedCloseLots?: unknown
    remainingQuantityAfterClose?: unknown
    segment?: unknown
    productType?: unknown
  }
  order?: {
    quantity?: unknown
    price?: unknown
    side?: unknown
    orderType?: unknown
    ltp?: unknown
    priceOffsetFromLtp?: unknown
    priceOffsetFromLtpPercent?: unknown
    turnover?: unknown
    segment?: unknown
    productType?: unknown
    minutesSinceOpen?: unknown
  }
  account?: {
    availableMargin?: unknown
    usedMargin?: unknown
    balance?: unknown
  }
  meta?: {
    userId?: unknown
    tradingAccountId?: unknown
  }
}

export interface TradingPolicyEvaluationResult {
  blocked: boolean
  message: string | null
  retryAfterSeconds: number
  policy: TradingPolicyDefinition | null
}

type TradingPoliciesCache = {
  fetchedAtMs: number
  policies: TradingPolicyDefinition[]
}

const POLICY_CONTEXT_CATALOG: Array<{ value: TradingPolicyContext; label: string }> = [
  { value: "POSITION_CLOSE", label: "Position Close" },
  { value: "ORDER_PLACE", label: "Order Placement" },
]

const POLICY_MATCH_TYPE_CATALOG: Array<{ value: TradingPolicyMatchType; label: string }> = [
  { value: "ALL", label: "All conditions (AND)" },
  { value: "ANY", label: "Any condition (OR)" },
]

const POLICY_OPERATOR_CATALOG: TradingPolicyOperatorCatalogEntry[] = [
  { value: "GT", label: "Greater than (>)", supportedDataTypes: ["number"] },
  { value: "GTE", label: "Greater than or equal (>=)", supportedDataTypes: ["number"] },
  { value: "LT", label: "Less than (<)", supportedDataTypes: ["number"] },
  { value: "LTE", label: "Less than or equal (<=)", supportedDataTypes: ["number"] },
  { value: "EQ", label: "Equal (=)", supportedDataTypes: ["number", "string"] },
  { value: "NEQ", label: "Not equal (!=)", supportedDataTypes: ["number", "string"] },
  { value: "IN", label: "In list", supportedDataTypes: ["number", "string"] },
  { value: "NOT_IN", label: "Not in list", supportedDataTypes: ["number", "string"] },
]

const POLICY_FIELDS_BY_CONTEXT: Record<TradingPolicyContext, TradingPolicyFieldCatalogEntry[]> = {
  POSITION_CLOSE: [
    { field: "position.unrealizedPnl", label: "Position Unrealized P&L", dataType: "number" },
    { field: "position.holdMinutes", label: "Position Hold Time (minutes)", dataType: "number" },
    { field: "position.quantity", label: "Position Quantity", dataType: "number" },
    { field: "position.lotSize", label: "Position Lot Size", dataType: "number" },
    { field: "position.requestedCloseQuantity", label: "Requested Close Quantity", dataType: "number" },
    { field: "position.requestedCloseLots", label: "Requested Close Lots", dataType: "number" },
    {
      field: "position.remainingQuantityAfterClose",
      label: "Remaining Quantity After Close",
      dataType: "number",
    },
    { field: "position.segment", label: "Position Segment", dataType: "string" },
    { field: "position.productType", label: "Position Product Type", dataType: "string" },
    { field: "position.isIntraday", label: "Position Intraday (1=yes, 0=no)", dataType: "number" },
    { field: "account.availableMargin", label: "Account Available Margin", dataType: "number" },
    { field: "account.usedMargin", label: "Account Used Margin", dataType: "number" },
    { field: "account.balance", label: "Account Balance", dataType: "number" },
    { field: "meta.userId", label: "User ID", dataType: "string" },
    { field: "meta.tradingAccountId", label: "Trading Account ID", dataType: "string" },
  ],
  ORDER_PLACE: [
    { field: "order.quantity", label: "Order Quantity", dataType: "number" },
    { field: "order.price", label: "Order Price", dataType: "number" },
    { field: "order.side", label: "Order Side (BUY/SELL)", dataType: "string" },
    { field: "order.orderType", label: "Order Type (MARKET/LIMIT)", dataType: "string" },
    { field: "order.ltp", label: "Order Reference LTP", dataType: "number" },
    { field: "order.priceOffsetFromLtp", label: "Order Price Offset From LTP", dataType: "number" },
    {
      field: "order.priceOffsetFromLtpPercent",
      label: "Order Price Offset From LTP (%)",
      dataType: "number",
    },
    { field: "order.turnover", label: "Order Turnover", dataType: "number" },
    { field: "order.segment", label: "Order Segment", dataType: "string" },
    { field: "order.productType", label: "Order Product Type", dataType: "string" },
    { field: "order.minutesSinceOpen", label: "Minutes Since Market Open", dataType: "number" },
    { field: "account.availableMargin", label: "Account Available Margin", dataType: "number" },
    { field: "account.usedMargin", label: "Account Used Margin", dataType: "number" },
    { field: "account.balance", label: "Account Balance", dataType: "number" },
    { field: "meta.userId", label: "User ID", dataType: "string" },
    { field: "meta.tradingAccountId", label: "Trading Account ID", dataType: "string" },
  ],
}

function getGlobalTradingPoliciesCache(): TradingPoliciesCache | null {
  const globalScope = globalThis as unknown as {
    __dynamicTradingPoliciesCache?: TradingPoliciesCache
  }
  return globalScope.__dynamicTradingPoliciesCache || null
}

function setGlobalTradingPoliciesCache(value: TradingPoliciesCache): void {
  const globalScope = globalThis as unknown as {
    __dynamicTradingPoliciesCache?: TradingPoliciesCache
  }
  globalScope.__dynamicTradingPoliciesCache = value
}

function generatePolicyId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `pol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeBoolean(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === "boolean") {
    return value
  }
  return fallbackValue
}

function normalizeBoundedInteger(
  value: unknown,
  fallbackValue: number,
  bounds: { min: number; max: number },
): number {
  const parsed = parseFiniteRiskNumber(value)
  if (parsed === null) {
    return fallbackValue
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(parsed)))
}

function normalizeIsoTimestamp(value: unknown, fallbackIsoTimestamp: string): string {
  if (typeof value !== "string") {
    return fallbackIsoTimestamp
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackIsoTimestamp
  }
  return new Date(parsed).toISOString()
}

function normalizePolicyContext(value: unknown): TradingPolicyContext | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim().toUpperCase()
  if (normalized === "POSITION_CLOSE" || normalized === "ORDER_PLACE") {
    return normalized
  }
  return null
}

function normalizePolicyMatchType(value: unknown, fallbackValue: TradingPolicyMatchType): TradingPolicyMatchType {
  if (typeof value !== "string") {
    return fallbackValue
  }
  const normalized = value.trim().toUpperCase()
  if (normalized === "ALL" || normalized === "ANY") {
    return normalized
  }
  return fallbackValue
}

function normalizePolicyOperator(value: unknown): TradingPolicyOperator | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim().toUpperCase()
  for (const operator of POLICY_OPERATOR_CATALOG) {
    if (operator.value === normalized) {
      return operator.value
    }
  }
  return null
}

function resolvePolicyFieldDefinition(
  context: TradingPolicyContext,
  field: string,
): TradingPolicyFieldCatalogEntry | null {
  const fields = POLICY_FIELDS_BY_CONTEXT[context] || []
  return fields.find((entry) => entry.field === field) || null
}

function isOperatorSupportedByDataType(operator: TradingPolicyOperator, dataType: TradingPolicyDataType): boolean {
  const definition = POLICY_OPERATOR_CATALOG.find((candidate) => candidate.value === operator)
  return Boolean(definition?.supportedDataTypes.includes(dataType))
}

function normalizeStringList(input: unknown): string[] {
  const sourceItems = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [input]

  const output: string[] = []
  for (const sourceItem of sourceItems) {
    const normalized = normalizeString(sourceItem)
    if (normalized) {
      output.push(normalized)
    }
  }
  return output
}

function normalizeNumberList(input: unknown): number[] {
  const sourceItems = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [input]

  const output: number[] = []
  for (const sourceItem of sourceItems) {
    const normalized = parseFiniteRiskNumber(sourceItem)
    if (normalized !== null) {
      output.push(normalized)
    }
  }
  return output
}

function normalizeConditionValue(
  rawValue: unknown,
  dataType: TradingPolicyDataType,
  operator: TradingPolicyOperator,
): TradingPolicyConditionValue | null {
  const expectsList = operator === "IN" || operator === "NOT_IN"
  if (dataType === "number") {
    if (expectsList) {
      const list = normalizeNumberList(rawValue)
      return list.length > 0 ? list : null
    }
    const parsed = parseFiniteRiskNumber(rawValue)
    return parsed !== null ? parsed : null
  }

  if (expectsList) {
    const list = normalizeStringList(rawValue)
    return list.length > 0 ? list : null
  }

  const normalized = normalizeString(rawValue)
  return normalized
}

function normalizeCondition(
  input: unknown,
  context: TradingPolicyContext,
  fallbackId?: string,
): TradingPolicyCondition | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null
  }

  const candidate = input as Record<string, unknown>
  const field = normalizeString(candidate.field)
  const operator = normalizePolicyOperator(candidate.operator)
  if (!field || !operator) {
    return null
  }

  const fieldDefinition = resolvePolicyFieldDefinition(context, field)
  if (!fieldDefinition) {
    return null
  }
  if (!isOperatorSupportedByDataType(operator, fieldDefinition.dataType)) {
    return null
  }

  const value = normalizeConditionValue(candidate.value, fieldDefinition.dataType, operator)
  if (value === null) {
    return null
  }

  const conditionId =
    normalizeString(candidate.id) ||
    fallbackId ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cond-${Math.random().toString(36).slice(2, 10)}`)

  return {
    id: conditionId,
    field,
    operator,
    value,
  }
}

function normalizeConditions(input: unknown, context: TradingPolicyContext): TradingPolicyCondition[] {
  if (!Array.isArray(input)) {
    return []
  }
  const out: TradingPolicyCondition[] = []
  for (const rawCondition of input) {
    const condition = normalizeCondition(rawCondition, context)
    if (condition) {
      out.push(condition)
    }
    if (out.length >= MAX_POLICY_CONDITIONS) {
      break
    }
  }
  return out
}

function normalizePolicyAction(input: unknown, fallback: TradingPolicyAction): TradingPolicyAction {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback
  }

  const candidate = input as Record<string, unknown>
  const normalizedType = normalizeString(candidate.type)?.toUpperCase()
  if (normalizedType !== "BLOCK") {
    return fallback
  }

  const messageCandidate = normalizeString(candidate.message)
  const fallbackMessage =
    fallback.message.length <= MAX_POLICY_MESSAGE_LENGTH
      ? fallback.message
      : fallback.message.slice(0, MAX_POLICY_MESSAGE_LENGTH)
  const message = messageCandidate ? messageCandidate.slice(0, MAX_POLICY_MESSAGE_LENGTH) : fallbackMessage
  const retryAfterSecondsRaw = parseFiniteRiskNumber(candidate.retryAfterSeconds)
  const retryAfterSeconds =
    retryAfterSecondsRaw === null ? fallback.retryAfterSeconds : Math.max(0, Math.trunc(retryAfterSecondsRaw))

  return {
    type: "BLOCK",
    message,
    retryAfterSeconds,
  }
}

function buildNormalizedPolicyDefinition(input: {
  payload: unknown
  existing?: TradingPolicyDefinition
  nowIsoTimestamp: string
  defaultSource?: TradingPolicySource
}): TradingPolicyDefinition | null {
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    return null
  }

  const existing = input.existing
  const candidate = input.payload as Record<string, unknown>
  const context = normalizePolicyContext(candidate.context ?? existing?.context)
  if (!context) {
    return null
  }

  const fallbackName = existing?.name || "Trading Policy"
  const normalizedName = normalizeString(candidate.name)
  const name = (normalizedName || fallbackName).slice(0, MAX_POLICY_NAME_LENGTH)
  if (!name) {
    return null
  }

  const fallbackDescription = existing?.description || ""
  const normalizedDescription = normalizeString(candidate.description)
  const description = (normalizedDescription ?? fallbackDescription).slice(0, MAX_POLICY_DESCRIPTION_LENGTH)

  const enabled = normalizeBoolean(candidate.enabled, existing?.enabled ?? true)
  const priority = normalizeBoundedInteger(candidate.priority, existing?.priority ?? 100, {
    min: 0,
    max: MAX_POLICY_PRIORITY,
  })
  const matchType = normalizePolicyMatchType(candidate.matchType, existing?.matchType ?? "ALL")
  const conditions = normalizeConditions(candidate.conditions ?? existing?.conditions, context)
  if (conditions.length === 0) {
    return null
  }

  const fallbackAction: TradingPolicyAction = existing?.action || {
    type: "BLOCK",
    message: "Action blocked by admin policy.",
    retryAfterSeconds: null,
  }
  const action = normalizePolicyAction(candidate.action, fallbackAction)
  if (!action.message) {
    return null
  }

  const sourceCandidate = normalizeString(candidate.source)?.toLowerCase()
  const source: TradingPolicySource =
    sourceCandidate === "legacy"
      ? "legacy"
      : existing?.source || input.defaultSource || "dynamic"
  const readOnly = normalizeBoolean(candidate.readOnly, existing?.readOnly ?? source === "legacy")

  const normalizedMetadata: Record<string, string> = {}
  const metadataInput = candidate.metadata ?? existing?.metadata
  if (metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput)) {
    for (const [metadataKey, metadataValue] of Object.entries(metadataInput)) {
      const normalizedMetadataKey = normalizeString(metadataKey)
      const normalizedMetadataValue = normalizeString(metadataValue)
      if (normalizedMetadataKey && normalizedMetadataValue) {
        normalizedMetadata[normalizedMetadataKey] = normalizedMetadataValue
      }
    }
  }

  const createdAt = normalizeIsoTimestamp(candidate.createdAt ?? existing?.createdAt, input.nowIsoTimestamp)
  const updatedAt = normalizeIsoTimestamp(candidate.updatedAt ?? existing?.updatedAt, input.nowIsoTimestamp)
  const id = normalizeString(candidate.id) || existing?.id || generatePolicyId()

  return {
    id,
    name,
    description,
    context,
    enabled,
    priority,
    matchType,
    conditions,
    action,
    createdAt,
    updatedAt,
    source,
    readOnly,
    metadata: Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : undefined,
  }
}

function sortPoliciesForEvaluation(a: TradingPolicyDefinition, b: TradingPolicyDefinition): number {
  if (a.priority !== b.priority) {
    return b.priority - a.priority
  }
  const aUpdatedAt = Date.parse(a.updatedAt)
  const bUpdatedAt = Date.parse(b.updatedAt)
  if (Number.isFinite(aUpdatedAt) && Number.isFinite(bUpdatedAt) && aUpdatedAt !== bUpdatedAt) {
    return bUpdatedAt - aUpdatedAt
  }
  return a.name.localeCompare(b.name)
}

function normalizePoliciesFromStorage(input: unknown): TradingPolicyDefinition[] {
  if (!Array.isArray(input)) {
    return []
  }
  const output: TradingPolicyDefinition[] = []
  const nowIsoTimestamp = new Date().toISOString()

  for (const rawPolicy of input) {
    const normalized = buildNormalizedPolicyDefinition({
      payload: rawPolicy,
      nowIsoTimestamp,
      defaultSource: "dynamic",
    })
    if (!normalized || normalized.source !== "dynamic") {
      continue
    }
    if (normalized.readOnly) {
      normalized.readOnly = false
    }
    output.push(normalized)
    if (output.length >= MAX_POLICY_COUNT) {
      break
    }
  }

  return output.sort(sortPoliciesForEvaluation)
}

async function readDynamicPolicies(input?: { maxAgeMs?: number }): Promise<TradingPolicyDefinition[]> {
  const maxAgeMs = Math.max(0, Math.trunc(parseFiniteRiskNumber(input?.maxAgeMs) ?? DEFAULT_POLICY_CACHE_TTL_MS))
  const cached = getGlobalTradingPoliciesCache()
  if (cached && Date.now() - cached.fetchedAtMs <= maxAgeMs) {
    return cached.policies
  }

  try {
    const rows = await getLatestActiveGlobalSettings([DYNAMIC_TRADING_POLICIES_KEY])
    const serialized = rows.get(DYNAMIC_TRADING_POLICIES_KEY)?.value
    const parsedValue = serialized ? JSON.parse(serialized) : []
    const normalizedPolicies = normalizePoliciesFromStorage(parsedValue)
    setGlobalTradingPoliciesCache({ fetchedAtMs: Date.now(), policies: normalizedPolicies })
    return normalizedPolicies
  } catch (error) {
    log.warn(
      { message: (error as any)?.message || String(error) },
      "failed to read dynamic policies; using empty fallback",
    )
    const fallback: TradingPolicyDefinition[] = []
    setGlobalTradingPoliciesCache({ fetchedAtMs: Date.now(), policies: fallback })
    return fallback
  }
}

async function writeDynamicPolicies(policies: TradingPolicyDefinition[]): Promise<TradingPolicyDefinition[]> {
  const sortedPolicies = [...policies]
    .filter((policy) => policy.source === "dynamic")
    .sort(sortPoliciesForEvaluation)
    .slice(0, MAX_POLICY_COUNT)

  await upsertGlobalSetting({
    key: DYNAMIC_TRADING_POLICIES_KEY,
    value: JSON.stringify(sortedPolicies),
    category: "RISK",
    description: "Dynamic admin trading policies used for runtime rule enforcement.",
  })

  setGlobalTradingPoliciesCache({
    fetchedAtMs: Date.now(),
    policies: sortedPolicies,
  })

  return sortedPolicies
}

async function resolveLegacyNegativePnlPolicy(): Promise<TradingPolicyDefinition | null> {
  try {
    const legacy = await getLegacyTradingPolicies()
    if (!legacy.negativePnlCloseDelayEnabled || legacy.negativePnlCloseDelayMinutes <= 0) {
      return null
    }

    const configuredMinutes = Math.max(0, Math.trunc(legacy.negativePnlCloseDelayMinutes))
    const nowIsoTimestamp = new Date().toISOString()
    return {
      id: LEGACY_NEGATIVE_PNL_POLICY_ID,
      name: "Legacy: Negative P&L Close Delay",
      description:
        "Migrated compatibility policy from previous single-policy configuration keys. This rule is read-only in dynamic mode.",
      context: "POSITION_CLOSE",
      enabled: true,
      priority: MAX_POLICY_PRIORITY,
      matchType: "ALL",
      conditions: [
        {
          id: `${LEGACY_NEGATIVE_PNL_POLICY_ID}-pnl`,
          field: "position.unrealizedPnl",
          operator: "LT",
          value: 0,
        },
        {
          id: `${LEGACY_NEGATIVE_PNL_POLICY_ID}-hold`,
          field: "position.holdMinutes",
          operator: "LT",
          value: configuredMinutes,
        },
      ],
      action: {
        type: "BLOCK",
        message: `Policy active: negative positions can be closed only after ${configuredMinutes} minute(s).`,
      },
      createdAt: nowIsoTimestamp,
      updatedAt: nowIsoTimestamp,
      source: "legacy",
      readOnly: true,
      metadata: {
        legacyRule: "negative_pnl_close_delay",
        configuredMinutes: String(configuredMinutes),
      },
    }
  } catch (error) {
    log.warn(
      { message: (error as any)?.message || String(error) },
      "failed to resolve legacy negative pnl close-delay policy",
    )
    return null
  }
}

function getSnapshotValue(snapshot: TradingPolicyEvaluationSnapshot, fieldPath: string): unknown {
  const segments = fieldPath.split(".")
  let cursor: any = snapshot
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
      return undefined
    }
    cursor = cursor[segment]
  }
  return cursor
}

function normalizeComparableString(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized ? normalized.toUpperCase() : null
}

function evaluateNumericCondition(
  actualRaw: unknown,
  operator: TradingPolicyOperator,
  expectedValue: TradingPolicyConditionValue,
): boolean {
  const actual = parseFiniteRiskNumber(actualRaw)
  if (actual === null) {
    return false
  }

  if (operator === "IN" || operator === "NOT_IN") {
    if (!Array.isArray(expectedValue)) {
      return false
    }
    const normalizedExpected = expectedValue
      .map((item) => parseFiniteRiskNumber(item))
      .filter((item): item is number => item !== null)
    if (normalizedExpected.length === 0) {
      return false
    }
    const included = normalizedExpected.includes(actual)
    return operator === "IN" ? included : !included
  }

  const expected = parseFiniteRiskNumber(expectedValue)
  if (expected === null) {
    return false
  }

  if (operator === "GT") return actual > expected
  if (operator === "GTE") return actual >= expected
  if (operator === "LT") return actual < expected
  if (operator === "LTE") return actual <= expected
  if (operator === "EQ") return actual === expected
  if (operator === "NEQ") return actual !== expected
  return false
}

function evaluateStringCondition(
  actualRaw: unknown,
  operator: TradingPolicyOperator,
  expectedValue: TradingPolicyConditionValue,
): boolean {
  const actual = normalizeComparableString(actualRaw)
  if (!actual) {
    return false
  }

  if (operator === "IN" || operator === "NOT_IN") {
    if (!Array.isArray(expectedValue)) {
      return false
    }
    const normalizedExpected = expectedValue
      .map((item) => normalizeComparableString(item))
      .filter((item): item is string => Boolean(item))
    if (normalizedExpected.length === 0) {
      return false
    }
    const included = normalizedExpected.includes(actual)
    return operator === "IN" ? included : !included
  }

  const expected = normalizeComparableString(expectedValue)
  if (!expected) {
    return false
  }
  if (operator === "EQ") return actual === expected
  if (operator === "NEQ") return actual !== expected
  return false
}

function evaluateCondition(
  context: TradingPolicyContext,
  condition: TradingPolicyCondition,
  snapshot: TradingPolicyEvaluationSnapshot,
): boolean {
  const fieldDefinition = resolvePolicyFieldDefinition(context, condition.field)
  if (!fieldDefinition) {
    return false
  }
  const actualValue = getSnapshotValue(snapshot, condition.field)
  if (fieldDefinition.dataType === "number") {
    return evaluateNumericCondition(actualValue, condition.operator, condition.value)
  }
  return evaluateStringCondition(actualValue, condition.operator, condition.value)
}

function resolvePolicyMessage(
  template: string,
  snapshot: TradingPolicyEvaluationSnapshot,
): string {
  if (!template.includes("{{")) {
    return template
  }
  return template.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_whole, expression) => {
    const value = getSnapshotValue(snapshot, String(expression).trim())
    if (value === null || value === undefined) {
      return "n/a"
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "n/a"
    }
    return String(value)
  })
}

function deriveRetryAfterSeconds(
  policy: TradingPolicyDefinition,
  snapshot: TradingPolicyEvaluationSnapshot,
): number {
  const explicitRetryAfter = parseFiniteRiskNumber(policy.action.retryAfterSeconds)
  if (explicitRetryAfter !== null) {
    return Math.max(0, Math.trunc(explicitRetryAfter))
  }

  // Best-effort retry hint: detect hold-time conditions and derive remaining seconds.
  for (const condition of policy.conditions) {
    const isHoldMinutesCondition =
      condition.field.endsWith(".holdMinutes") &&
      (condition.operator === "LT" || condition.operator === "LTE")
    if (!isHoldMinutesCondition) {
      continue
    }
    if (typeof condition.value !== "number") {
      continue
    }
    const actualHoldMinutes = parseFiniteRiskNumber(getSnapshotValue(snapshot, condition.field))
    if (actualHoldMinutes === null) {
      continue
    }
    const remainingMinutes = Math.max(0, condition.value - actualHoldMinutes)
    return Math.ceil(remainingMinutes * 60)
  }

  return 0
}

function policyMatchesSnapshot(
  policy: TradingPolicyDefinition,
  snapshot: TradingPolicyEvaluationSnapshot,
): boolean {
  if (!policy.enabled) {
    return false
  }
  if (policy.conditions.length === 0) {
    return false
  }

  const evaluations = policy.conditions.map((condition) =>
    evaluateCondition(policy.context, condition, snapshot),
  )
  if (policy.matchType === "ANY") {
    return evaluations.some(Boolean)
  }
  return evaluations.every(Boolean)
}

export function getTradingPolicyCatalog(): TradingPolicyCatalog {
  return {
    contexts: POLICY_CONTEXT_CATALOG,
    matchTypes: POLICY_MATCH_TYPE_CATALOG,
    operators: POLICY_OPERATOR_CATALOG,
    fieldsByContext: POLICY_FIELDS_BY_CONTEXT,
    actions: [{ value: "BLOCK", label: "Block Request" }],
  }
}

export async function listTradingPolicies(input?: {
  maxAgeMs?: number
  includeLegacy?: boolean
}): Promise<TradingPolicyDefinition[]> {
  const includeLegacy = input?.includeLegacy !== false
  const dynamicPolicies = await readDynamicPolicies({ maxAgeMs: input?.maxAgeMs })
  const output = [...dynamicPolicies]
  if (includeLegacy) {
    const legacyPolicy = await resolveLegacyNegativePnlPolicy()
    if (legacyPolicy) {
      output.push(legacyPolicy)
    }
  }
  return output.sort(sortPoliciesForEvaluation)
}

export async function createTradingPolicy(payload: unknown): Promise<TradingPolicyDefinition> {
  const dynamicPolicies = await readDynamicPolicies({ maxAgeMs: 0 })
  if (dynamicPolicies.length >= MAX_POLICY_COUNT) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: `Maximum ${MAX_POLICY_COUNT} dynamic policies allowed`,
      statusCode: 400,
    })
  }

  const nowIsoTimestamp = new Date().toISOString()
  const normalized = buildNormalizedPolicyDefinition({
    payload,
    nowIsoTimestamp,
    defaultSource: "dynamic",
  })
  if (!normalized) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid policy payload. Ensure context, name, conditions, and action are valid.",
      statusCode: 400,
    })
  }

  normalized.id = generatePolicyId()
  normalized.source = "dynamic"
  normalized.readOnly = false
  normalized.createdAt = nowIsoTimestamp
  normalized.updatedAt = nowIsoTimestamp

  const nextPolicies = [...dynamicPolicies, normalized]
  await writeDynamicPolicies(nextPolicies)
  return normalized
}

export async function updateTradingPolicy(payload: unknown): Promise<TradingPolicyDefinition> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid policy payload", statusCode: 400 })
  }

  const policyId = normalizeString((payload as Record<string, unknown>).id)
  if (!policyId) {
    throw new AppError({ code: "VALIDATION_ERROR", message: "Policy id is required", statusCode: 400 })
  }

  const dynamicPolicies = await readDynamicPolicies({ maxAgeMs: 0 })
  const existingPolicy = dynamicPolicies.find((policy) => policy.id === policyId)
  if (!existingPolicy) {
    throw new AppError({ code: "NOT_FOUND", message: "Policy not found", statusCode: 404 })
  }

  const nowIsoTimestamp = new Date().toISOString()
  const mergedPayload = {
    ...existingPolicy,
    ...(payload as Record<string, unknown>),
    id: existingPolicy.id,
    source: "dynamic",
    readOnly: false,
    createdAt: existingPolicy.createdAt,
    updatedAt: nowIsoTimestamp,
  }

  const normalized = buildNormalizedPolicyDefinition({
    payload: mergedPayload,
    existing: existingPolicy,
    nowIsoTimestamp,
    defaultSource: "dynamic",
  })
  if (!normalized) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid policy update payload",
      statusCode: 400,
    })
  }

  normalized.id = existingPolicy.id
  normalized.source = "dynamic"
  normalized.readOnly = false
  normalized.createdAt = existingPolicy.createdAt
  normalized.updatedAt = nowIsoTimestamp

  const nextPolicies = dynamicPolicies.map((policy) => (policy.id === policyId ? normalized : policy))
  await writeDynamicPolicies(nextPolicies)
  return normalized
}

export async function deleteTradingPolicy(policyIdInput: unknown): Promise<TradingPolicyDefinition> {
  const policyId = normalizeString(policyIdInput)
  if (!policyId) {
    throw new AppError({ code: "VALIDATION_ERROR", message: "Policy id is required", statusCode: 400 })
  }

  if (policyId === LEGACY_NEGATIVE_PNL_POLICY_ID) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Legacy compatibility policy is read-only and cannot be deleted here.",
      statusCode: 400,
    })
  }

  const dynamicPolicies = await readDynamicPolicies({ maxAgeMs: 0 })
  const existingPolicy = dynamicPolicies.find((policy) => policy.id === policyId)
  if (!existingPolicy) {
    throw new AppError({ code: "NOT_FOUND", message: "Policy not found", statusCode: 404 })
  }

  const nextPolicies = dynamicPolicies.filter((policy) => policy.id !== policyId)
  await writeDynamicPolicies(nextPolicies)
  return existingPolicy
}

export async function evaluateTradingPoliciesForContext(input: {
  context: TradingPolicyContext
  snapshot: TradingPolicyEvaluationSnapshot
  maxAgeMs?: number
}): Promise<TradingPolicyEvaluationResult> {
  try {
    const policies = await listTradingPolicies({ includeLegacy: true, maxAgeMs: input.maxAgeMs })
    const filtered = policies
      .filter((policy) => policy.enabled && policy.context === input.context)
      .sort(sortPoliciesForEvaluation)

    for (const policy of filtered) {
      if (!policyMatchesSnapshot(policy, input.snapshot)) {
        continue
      }
      if (policy.action.type !== "BLOCK") {
        continue
      }

      const message = resolvePolicyMessage(policy.action.message, input.snapshot)
      return {
        blocked: true,
        message,
        retryAfterSeconds: deriveRetryAfterSeconds(policy, input.snapshot),
        policy,
      }
    }

    return {
      blocked: false,
      message: null,
      retryAfterSeconds: 0,
      policy: null,
    }
  } catch (error) {
    log.warn(
      { context: input.context, message: (error as any)?.message || String(error) },
      "policy evaluation failed; allowing request to proceed",
    )
    return {
      blocked: false,
      message: null,
      retryAfterSeconds: 0,
      policy: null,
    }
  }
}
