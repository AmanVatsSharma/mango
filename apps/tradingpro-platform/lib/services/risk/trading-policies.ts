/**
 * @file trading-policies.ts
 * @module risk
 * @description SystemSettings-backed admin trading policy helpers (close restrictions, defaults, and evaluation).
 * @author StockTrade
 * @created 2026-02-17
 */

import { parseBooleanSetting, getLatestActiveGlobalSettings, upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import { baseLogger } from "@/lib/observability/logger"

export const NEGATIVE_PNL_CLOSE_DELAY_ENABLED_KEY = "trading_policy_negative_pnl_close_delay_enabled" as const
export const NEGATIVE_PNL_CLOSE_DELAY_MINUTES_KEY = "trading_policy_negative_pnl_close_delay_minutes" as const

const MIN_POLICY_MINUTES = 0
const MAX_POLICY_MINUTES = 120

const log = baseLogger.child({ module: "trading-policies" })

export type TradingPolicies = {
  negativePnlCloseDelayEnabled: boolean
  negativePnlCloseDelayMinutes: number
  source: "system_settings" | "default"
}

type TradingPoliciesCache = {
  fetchedAtMs: number
  value: TradingPolicies
}

export type NegativePnlCloseDelayDecision = {
  blocked: boolean
  remainingMs: number
  remainingSeconds: number
}

const DEFAULT_TRADING_POLICIES: Omit<TradingPolicies, "source"> = {
  negativePnlCloseDelayEnabled: false,
  negativePnlCloseDelayMinutes: 0,
}

function getGlobalTradingPoliciesCache(): TradingPoliciesCache | null {
  const globalScope = globalThis as unknown as { __tradingPoliciesCache?: TradingPoliciesCache }
  return globalScope.__tradingPoliciesCache || null
}

function setGlobalTradingPoliciesCache(value: TradingPoliciesCache): void {
  const globalScope = globalThis as unknown as { __tradingPoliciesCache?: TradingPoliciesCache }
  globalScope.__tradingPoliciesCache = value
}

function normalizePolicyMinutes(value: unknown): number | null {
  const parsedValue = parseFiniteRiskNumber(value)
  if (parsedValue === null || parsedValue < MIN_POLICY_MINUTES) {
    return null
  }
  return Math.min(MAX_POLICY_MINUTES, Math.trunc(parsedValue))
}

function normalizePolicyBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    return parseBooleanSetting(value)
  }
  return null
}

function resolvePolicyEvaluationTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
  }
  if (typeof value === "string") {
    const parsedDate = Date.parse(value)
    return Number.isFinite(parsedDate) && parsedDate > 0 ? parsedDate : null
  }
  return null
}

export async function getTradingPolicies(input?: { maxAgeMs?: number }): Promise<TradingPolicies> {
  const maxAgeMs = Math.max(0, Math.trunc(parseFiniteRiskNumber(input?.maxAgeMs) ?? 60_000))
  const cachedPolicies = getGlobalTradingPoliciesCache()
  if (cachedPolicies && Date.now() - cachedPolicies.fetchedAtMs <= maxAgeMs) {
    return cachedPolicies.value
  }

  try {
    const rows = await getLatestActiveGlobalSettings([
      NEGATIVE_PNL_CLOSE_DELAY_ENABLED_KEY,
      NEGATIVE_PNL_CLOSE_DELAY_MINUTES_KEY,
    ])
    const enabledRaw = rows.get(NEGATIVE_PNL_CLOSE_DELAY_ENABLED_KEY)?.value ?? null
    const minutesRaw = rows.get(NEGATIVE_PNL_CLOSE_DELAY_MINUTES_KEY)?.value ?? null

    const enabled = enabledRaw !== null ? parseBooleanSetting(enabledRaw) : null
    const minutes = minutesRaw !== null ? normalizePolicyMinutes(minutesRaw) : null

    if (enabled !== null || minutes !== null) {
      const value: TradingPolicies = {
        negativePnlCloseDelayEnabled: enabled ?? DEFAULT_TRADING_POLICIES.negativePnlCloseDelayEnabled,
        negativePnlCloseDelayMinutes: minutes ?? DEFAULT_TRADING_POLICIES.negativePnlCloseDelayMinutes,
        source: "system_settings",
      }
      setGlobalTradingPoliciesCache({ fetchedAtMs: Date.now(), value })
      return value
    }
  } catch (error) {
    log.warn({ message: (error as any)?.message || String(error) }, "failed to read trading policies from SystemSettings")
  }

  const fallbackValue: TradingPolicies = { ...DEFAULT_TRADING_POLICIES, source: "default" }
  setGlobalTradingPoliciesCache({ fetchedAtMs: Date.now(), value: fallbackValue })
  return fallbackValue
}

export async function upsertTradingPolicies(input: {
  negativePnlCloseDelayEnabled: boolean
  negativePnlCloseDelayMinutes: number
}): Promise<TradingPolicies> {
  const normalizedEnabled = normalizePolicyBoolean(input.negativePnlCloseDelayEnabled)
  const normalizedMinutes = normalizePolicyMinutes(input.negativePnlCloseDelayMinutes)
  if (normalizedEnabled === null) {
    throw new Error("negativePnlCloseDelayEnabled must be a boolean")
  }
  if (normalizedMinutes === null) {
    throw new Error(`negativePnlCloseDelayMinutes must be an integer between ${MIN_POLICY_MINUTES} and ${MAX_POLICY_MINUTES}`)
  }

  await upsertGlobalSetting({
    key: NEGATIVE_PNL_CLOSE_DELAY_ENABLED_KEY,
    value: String(normalizedEnabled),
    category: "RISK",
    description: "If enabled, users cannot close negative-PnL positions before the configured delay window.",
  })

  await upsertGlobalSetting({
    key: NEGATIVE_PNL_CLOSE_DELAY_MINUTES_KEY,
    value: String(normalizedMinutes),
    category: "RISK",
    description: "Minimum minutes to hold a negative-PnL position before user-triggered close is allowed.",
  })

  const value: TradingPolicies = {
    negativePnlCloseDelayEnabled: normalizedEnabled,
    negativePnlCloseDelayMinutes: normalizedMinutes,
    source: "system_settings",
  }
  setGlobalTradingPoliciesCache({ fetchedAtMs: Date.now(), value })
  return value
}

export function evaluateNegativePnlCloseDelayPolicy(input: {
  policies: TradingPolicies
  positionCreatedAt: Date | string
  unrealizedPnl: number
  nowMs?: number
}): NegativePnlCloseDelayDecision {
  const policies = input.policies
  if (!policies.negativePnlCloseDelayEnabled || policies.negativePnlCloseDelayMinutes <= 0) {
    return { blocked: false, remainingMs: 0, remainingSeconds: 0 }
  }

  const unrealizedPnl = parseFiniteRiskNumber(input.unrealizedPnl) ?? 0
  if (unrealizedPnl >= 0) {
    return { blocked: false, remainingMs: 0, remainingSeconds: 0 }
  }

  const createdAtMs = resolvePolicyEvaluationTimestamp(input.positionCreatedAt)
  if (createdAtMs === null) {
    return { blocked: false, remainingMs: 0, remainingSeconds: 0 }
  }

  const nowMs = Math.max(createdAtMs, Math.trunc(input.nowMs ?? Date.now()))
  const holdWindowMs = policies.negativePnlCloseDelayMinutes * 60_000
  const elapsedMs = Math.max(0, nowMs - createdAtMs)
  const remainingMs = Math.max(0, holdWindowMs - elapsedMs)
  const blocked = remainingMs > 0
  return {
    blocked,
    remainingMs,
    remainingSeconds: blocked ? Math.ceil(remainingMs / 1_000) : 0,
  }
}
