/**
 * File: lib/server/console-statements.ts
 * Module: console
 * Purpose: Resolve statements feature availability (global + per-user override).
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - Global setting lives in SystemSettings(ownerId=null, key=console_statements_enabled_global).
 * - Per-user override lives in SystemSettings(ownerId=userId, key=console_statements_enabled_override).
 * - Override precedence: force_enable/force_disable beats global; missing global defaults to enabled.
 */

import { prisma } from "@/lib/prisma"

export const CONSOLE_STATEMENTS_GLOBAL_KEY = "console_statements_enabled_global" as const
export const CONSOLE_STATEMENTS_OVERRIDE_KEY = "console_statements_enabled_override" as const
export const CONSOLE_STATEMENTS_SETTINGS_CATEGORY = "CONSOLE" as const

export type ConsoleStatementsOverrideValue = "force_enable" | "force_disable"

export type ConsoleStatementsSource =
  | "override_force_enable"
  | "override_force_disable"
  | "global"
  | "default_enabled"
  | "error_fallback_enabled"

export type ConsoleStatementsResolution = {
  enabled: boolean
  source: ConsoleStatementsSource
  globalEnabled?: boolean
  override?: ConsoleStatementsOverrideValue | null
}

const GLOBAL_CACHE_TTL_MS = 5000
let cachedGlobal: { enabled: boolean; fetchedAt: number } | null = null

const USER_CACHE_TTL_MS = 5000
const cachedUser = new Map<string, { resolution: ConsoleStatementsResolution; fetchedAt: number }>()

function parseGlobalEnabled(v: string | null | undefined): boolean | null {
  if (v == null) return null
  if (v === "true") return true
  if (v === "false") return false
  return null
}

function parseOverride(v: string | null | undefined): ConsoleStatementsOverrideValue | null {
  if (v === "force_enable" || v === "force_disable") return v
  return null
}

export async function getConsoleStatementsGlobalEnabledFromDB(): Promise<{ enabled: boolean; source: "global" | "default_enabled" }> {
  const now = Date.now()
  if (cachedGlobal && now - cachedGlobal.fetchedAt < GLOBAL_CACHE_TTL_MS) {
    return { enabled: cachedGlobal.enabled, source: "global" }
  }

  try {
    const setting = await prisma.systemSettings.findFirst({
      where: {
        ownerId: null,
        key: CONSOLE_STATEMENTS_GLOBAL_KEY,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
      select: { value: true },
    })

    const parsed = parseGlobalEnabled(setting?.value)
    const enabled = parsed ?? true

    cachedGlobal = { enabled, fetchedAt: now }
    return { enabled, source: parsed == null ? "default_enabled" : "global" }
  } catch (error) {
    console.error("[ConsoleStatements] Failed to read global statements setting; defaulting to enabled", error)
    return { enabled: true, source: "default_enabled" }
  }
}

export async function getEffectiveStatementsEnabledForUser(userId: string): Promise<ConsoleStatementsResolution> {
  const now = Date.now()
  const cached = cachedUser.get(userId)
  if (cached && now - cached.fetchedAt < USER_CACHE_TTL_MS) {
    return cached.resolution
  }

  try {
    const overrideSetting = await prisma.systemSettings.findFirst({
      where: {
        ownerId: userId,
        key: CONSOLE_STATEMENTS_OVERRIDE_KEY,
        isActive: true,
      },
      orderBy: { updatedAt: "desc" },
      select: { value: true },
    })

    const override = parseOverride(overrideSetting?.value)
    if (override === "force_enable") {
      const resolution: ConsoleStatementsResolution = {
        enabled: true,
        source: "override_force_enable",
        override,
      }
      cachedUser.set(userId, { resolution, fetchedAt: now })
      return resolution
    }

    if (override === "force_disable") {
      const resolution: ConsoleStatementsResolution = {
        enabled: false,
        source: "override_force_disable",
        override,
      }
      cachedUser.set(userId, { resolution, fetchedAt: now })
      return resolution
    }

    const global = await getConsoleStatementsGlobalEnabledFromDB()
    const resolution: ConsoleStatementsResolution = {
      enabled: global.enabled,
      source: "global",
      globalEnabled: global.enabled,
      override: null,
    }
    cachedUser.set(userId, { resolution, fetchedAt: now })
    return resolution
  } catch (error) {
    console.error("[ConsoleStatements] Failed to resolve statements setting; defaulting to enabled", error)
    const resolution: ConsoleStatementsResolution = {
      enabled: true,
      source: "error_fallback_enabled",
      override: null,
    }
    cachedUser.set(userId, { resolution, fetchedAt: now })
    return resolution
  }
}

export function invalidateConsoleStatementsCache(): void {
  cachedGlobal = null
  cachedUser.clear()
}

