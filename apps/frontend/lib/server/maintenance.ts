/**
 * @file maintenance.ts
 * @module server-maintenance
 * @description Server-side maintenance mode configuration utilities with database access
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-04 — Global MAINTENANCE settings scoped to ownerId null; stable orderBy.
 */

import { prisma } from "@/lib/prisma"
import type { MaintenanceConfig } from "@/lib/maintenance"

// Cache for maintenance config (5 second TTL)
let cachedConfig: MaintenanceConfig | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 5000 // 5 seconds

/**
 * Get maintenance mode configuration from database
 * Uses caching to avoid excessive DB queries
 * 
 * @returns Promise<MaintenanceConfig> - Current maintenance configuration
 */
export async function getMaintenanceConfigFromDB(): Promise<MaintenanceConfig> {
  const now = Date.now()
  
  // Return cached config if still valid
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[MaintenanceConfig-DB] Returning cached configuration')
    return cachedConfig
  }

  console.log('[MaintenanceConfig-DB] Fetching maintenance configuration from database')
  
  try {
    // Fetch all maintenance settings from database
    const settings = await prisma.systemSettings.findMany({
      where: {
        category: 'MAINTENANCE',
        isActive: true,
        ownerId: null,
      },
      orderBy: { updatedAt: 'desc' },
    })

    console.log(`[MaintenanceConfig-DB] Found ${settings.length} maintenance settings`)

    // Build config from settings
    const enabledSetting = settings.find(s => s.key === 'maintenance_mode_enabled')
    const messageSetting = settings.find(s => s.key === 'maintenance_message')
    const endTimeSetting = settings.find(s => s.key === 'maintenance_end_time')
    const bypassSetting = settings.find(s => s.key === 'maintenance_allow_admin_bypass')

    const config: MaintenanceConfig = {
      isEnabled: enabledSetting?.value === 'true',
      message: messageSetting?.value || 
        "We're performing scheduled maintenance to improve your experience. We'll be back shortly!",
      endTime: endTimeSetting?.value || '24Hrs',
      allowAdminBypass: bypassSetting?.value !== 'false' // Default to true if not set
    }

    // Update cache
    cachedConfig = config
    cacheTimestamp = now

    console.log('[MaintenanceConfig-DB] Configuration loaded from database:', {
      isEnabled: config.isEnabled,
      hasMessage: !!config.message,
      hasEndTime: !!config.endTime,
      allowAdminBypass: config.allowAdminBypass
    })

    return config
  } catch (error: any) {
    console.error('[MaintenanceConfig-DB] Error fetching from database:', error)
    
    // Return cached config if available, otherwise fallback to defaults
    if (cachedConfig) {
      console.log('[MaintenanceConfig-DB] Using cached config due to error')
      return cachedConfig
    }

    // Fallback to disabled maintenance mode
    return {
      isEnabled: false,
      message: "We're performing scheduled maintenance to improve your experience. We'll be back shortly!",
      endTime: '24Hrs',
      allowAdminBypass: true
    }
  }
}

/**
 * Invalidate the maintenance config cache
 * Call this after updating maintenance settings
 */
export function invalidateMaintenanceCache(): void {
  console.log('[MaintenanceConfig-DB] Invalidating cache')
  cachedConfig = null
  cacheTimestamp = 0
}

