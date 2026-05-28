/**
 * @file kyc-enforcement.ts
 * @module server-kyc-enforcement
 * @description Server-side KYC enforcement configuration with DB lookup and cache
 * @author StockTrade
 * @created 2026-02-16
 */

import { prisma } from "@/lib/prisma"

const KYC_ENFORCEMENT_KEY = "kyc_enforcement_enabled"
const CACHE_TTL_MS = 5000

let cachedValue: boolean | null = null
let cacheTimestamp = 0

/**
 * Parses a system setting value into a boolean flag.
 * Any non-"false" value is treated as enabled for secure-by-default behavior.
 */
export function parseKycEnforcementSettingValue(value: string | null | undefined): boolean {
  if (!value) return true
  return value !== "false"
}

/**
 * Reads KYC enforcement flag from DB (ownerId = null) with short-lived cache.
 * Falls back to true whenever DB is unavailable.
 */
export async function getKycEnforcementFromDB(): Promise<boolean> {
  const now = Date.now()
  if (cachedValue !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    console.log("[KYC-Enforcement-DB] Returning cached value", { enabled: cachedValue })
    return cachedValue
  }

  try {
    const setting = await prisma.systemSettings.findFirst({
      where: {
        key: KYC_ENFORCEMENT_KEY,
        ownerId: null,
        isActive: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    const enabled = parseKycEnforcementSettingValue(setting?.value)
    cachedValue = enabled
    cacheTimestamp = now
    console.log("[KYC-Enforcement-DB] Loaded value from database", { enabled })
    return enabled
  } catch (error: any) {
    console.error("[KYC-Enforcement-DB] Failed to load setting, defaulting to enabled", {
      error: error?.message || "Unknown error",
    })
    if (cachedValue !== null) {
      return cachedValue
    }
    return true
  }
}

export function invalidateKycEnforcementCache(): void {
  cachedValue = null
  cacheTimestamp = 0
}
