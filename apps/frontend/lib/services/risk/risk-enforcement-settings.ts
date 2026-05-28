/**
 * @file risk-enforcement-settings.ts
 * @module risk
 * @description Admin-configurable risk enforcement policy (SystemSettings): full liquidation on breach, optional warning-band square-off.
 * @author StockTrade
 * @created 2026-04-01
 *
 * Notes:
 * - Boolean values stored as lowercase "true" / "false" strings in SystemSettings.
 * - Cached like risk-thresholds to limit DB reads in hot workers.
 */

import { baseLogger } from "@/lib/observability/logger"
import { getLatestActiveGlobalSettings, upsertGlobalSetting } from "@/lib/server/workers/system-settings"

export const RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE_KEY = "risk_full_liquidation_on_auto_close" as const
export const RISK_SQUARE_OFF_ON_WARNING_KEY = "risk_square_off_on_warning" as const
export const RISK_AUTO_CLOSE_ENABLED_KEY = "risk_auto_close_enabled" as const
export const RISK_CIRCUIT_BREAKER_UNTIL_KEY = "risk_circuit_breaker_until" as const

export type RiskEnforcementSettings = {
  riskAutoCloseEnabled: boolean
  circuitBreakerPausedUntil: number | null
  fullLiquidationOnAutoClose: boolean
  squareOffOnWarningBand: boolean
  source: "system_settings" | "env" | "default"
}

type CacheState = {
  fetchedAtMs: number
  value: RiskEnforcementSettings
}

const log = baseLogger.child({ module: "risk-enforcement-settings" })

function parseBooleanSetting(raw: string | null | undefined): boolean | null {
  if (raw == null || typeof raw !== "string") return null
  const t = raw.trim().toLowerCase()
  if (t === "true" || t === "1" || t === "yes" || t === "on") return true
  if (t === "false" || t === "0" || t === "no" || t === "off" || t === "") return false
  return null
}

function envBool(key: string): boolean | null {
  const raw = process.env[key]
  if (raw == null) return null
  return parseBooleanSetting(raw)
}

function getGlobalCache(): CacheState | null {
  const g = globalThis as unknown as { __riskEnforcementSettingsCache?: CacheState }
  return g.__riskEnforcementSettingsCache || null
}

function setGlobalCache(value: CacheState): void {
  const g = globalThis as unknown as { __riskEnforcementSettingsCache?: CacheState }
  g.__riskEnforcementSettingsCache = value
}

const DEFAULTS: Omit<RiskEnforcementSettings, "source"> = {
  riskAutoCloseEnabled: true,
  circuitBreakerPausedUntil: null,
  fullLiquidationOnAutoClose: false,
  squareOffOnWarningBand: false,
}

export async function getRiskEnforcementSettings(input?: { maxAgeMs?: number }): Promise<RiskEnforcementSettings> {
  const maxAgeMs = Math.max(0, input?.maxAgeMs ?? 60_000)
  const cached = getGlobalCache()
  if (cached && Date.now() - cached.fetchedAtMs <= maxAgeMs) return cached.value

  try {
    const rows = await getLatestActiveGlobalSettings([
      RISK_AUTO_CLOSE_ENABLED_KEY,
      RISK_CIRCUIT_BREAKER_UNTIL_KEY,
      RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE_KEY,
      RISK_SQUARE_OFF_ON_WARNING_KEY,
    ])
    const enabledRaw = rows.get(RISK_AUTO_CLOSE_ENABLED_KEY)?.value ?? null
    const circuitRaw = rows.get(RISK_CIRCUIT_BREAKER_UNTIL_KEY)?.value ?? null
    const fullRaw = rows.get(RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE_KEY)?.value ?? null
    const warnRaw = rows.get(RISK_SQUARE_OFF_ON_WARNING_KEY)?.value ?? null

    const enabledParsed = parseBooleanSetting(enabledRaw ?? undefined)
    const fullParsed = parseBooleanSetting(fullRaw ?? undefined)
    const warnParsed = parseBooleanSetting(warnRaw ?? undefined)

    let circuitBreakerParsed: number | null = null
    if (circuitRaw != null && circuitRaw.trim() !== "") {
      const parsed = Number(circuitRaw)
      if (Number.isFinite(parsed) && parsed > 0) circuitBreakerParsed = parsed
    }

    if (enabledParsed !== null || fullParsed !== null || warnParsed !== null || circuitBreakerParsed !== null) {
      const value: RiskEnforcementSettings = {
        riskAutoCloseEnabled: enabledParsed ?? DEFAULTS.riskAutoCloseEnabled,
        circuitBreakerPausedUntil: circuitBreakerParsed ?? DEFAULTS.circuitBreakerPausedUntil,
        fullLiquidationOnAutoClose: fullParsed ?? DEFAULTS.fullLiquidationOnAutoClose,
        squareOffOnWarningBand: warnParsed ?? DEFAULTS.squareOffOnWarningBand,
        source: "system_settings",
      }
      setGlobalCache({ fetchedAtMs: Date.now(), value })
      return value
    }
  } catch (e) {
    log.warn(
      { message: (e as { message?: string })?.message || String(e) },
      "failed to read risk enforcement settings; falling back to env/default",
    )
  }

  const envEnabled = envBool("RISK_AUTO_CLOSE_ENABLED")
  const envFull = envBool("RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE")
  const envWarn = envBool("RISK_SQUARE_OFF_ON_WARNING")
  const envCircuit = process.env["RISK_CIRCUIT_BREAKER_UNTIL"]
  let envCircuitParsed: number | null = null
  if (envCircuit != null && envCircuit.trim() !== "") {
    const parsed = Number(envCircuit)
    if (Number.isFinite(parsed) && parsed > 0) envCircuitParsed = parsed
  }

  if (envEnabled !== null || envFull !== null || envWarn !== null || envCircuitParsed !== null) {
    const value: RiskEnforcementSettings = {
      riskAutoCloseEnabled: envEnabled ?? DEFAULTS.riskAutoCloseEnabled,
      circuitBreakerPausedUntil: envCircuitParsed ?? DEFAULTS.circuitBreakerPausedUntil,
      fullLiquidationOnAutoClose: envFull ?? DEFAULTS.fullLiquidationOnAutoClose,
      squareOffOnWarningBand: envWarn ?? DEFAULTS.squareOffOnWarningBand,
      source: "env",
    }
    setGlobalCache({ fetchedAtMs: Date.now(), value })
    return value
  }

  const value: RiskEnforcementSettings = { ...DEFAULTS, source: "default" }
  setGlobalCache({ fetchedAtMs: Date.now(), value })
  return value
}

export async function upsertRiskEnforcementSettings(input: {
  riskAutoCloseEnabled?: boolean
  circuitBreakerPausedUntil?: number | null
  fullLiquidationOnAutoClose?: boolean
  squareOffOnWarningBand?: boolean
}): Promise<RiskEnforcementSettings> {
  const writeEnabled = input.riskAutoCloseEnabled !== undefined
  const writeCircuit = "circuitBreakerPausedUntil" in input
  const writeFull = input.fullLiquidationOnAutoClose !== undefined
  const writeWarn = input.squareOffOnWarningBand !== undefined

  if (writeEnabled) {
    await upsertGlobalSetting({
      key: RISK_AUTO_CLOSE_ENABLED_KEY,
      value: input.riskAutoCloseEnabled ? "true" : "false",
      category: "RISK",
      description: "Master kill-switch for all auto-close and risk square-off behaviour.",
    })
  }

  if (writeCircuit) {
    await upsertGlobalSetting({
      key: RISK_CIRCUIT_BREAKER_UNTIL_KEY,
      value: input.circuitBreakerPausedUntil != null ? String(input.circuitBreakerPausedUntil) : "",
      category: "RISK",
      description: "Epoch ms until which risk auto-close is paused (0/empty = not paused).",
    })
  }

  if (writeFull) {
    await upsertGlobalSetting({
      key: RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE_KEY,
      value: input.fullLiquidationOnAutoClose ? "true" : "false",
      category: "RISK",
      description:
        "When true, auto-close breach liquidates all losing positions per wave (enterprise full flatten).",
    })
  }

  if (writeWarn) {
    await upsertGlobalSetting({
      key: RISK_SQUARE_OFF_ON_WARNING_KEY,
      value: input.squareOffOnWarningBand ? "true" : "false",
      category: "RISK",
      description:
        "When true, warning threshold also triggers automatic square-off of losing positions (aggressive).",
    })
  }

  const current = await getRiskEnforcementSettings({ maxAgeMs: 0 })
  const value: RiskEnforcementSettings = {
    riskAutoCloseEnabled: writeEnabled ? !!input.riskAutoCloseEnabled : current.riskAutoCloseEnabled,
    circuitBreakerPausedUntil: writeCircuit ? input.circuitBreakerPausedUntil ?? null : current.circuitBreakerPausedUntil,
    fullLiquidationOnAutoClose: writeFull ? !!input.fullLiquidationOnAutoClose : current.fullLiquidationOnAutoClose,
    squareOffOnWarningBand: writeWarn ? !!input.squareOffOnWarningBand : current.squareOffOnWarningBand,
    source: "system_settings",
  }
  setGlobalCache({ fetchedAtMs: Date.now(), value })
  return value
}

export function isRiskEnabled(settings: RiskEnforcementSettings): boolean {
  if (!settings.riskAutoCloseEnabled) return false
  if (settings.circuitBreakerPausedUntil != null && Date.now() < settings.circuitBreakerPausedUntil) return false
  return true
}
