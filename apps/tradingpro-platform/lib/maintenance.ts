/**
 * @file maintenance.ts
 * @module maintenance
 * @description Maintenance mode utilities with database-backed configuration
 * Supports both edge runtime (middleware) and server runtime
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-04 — Explicit MAINTENANCE_MODE=true|false overrides DB isEnabled; cache stores base config.
 */

// In-memory cache for maintenance config (works in both edge and server runtime)
let cachedConfig: MaintenanceConfig | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 5000 // 5 seconds

export interface MaintenanceConfig {
  isEnabled: boolean;
  message?: string;
  endTime?: string;
  allowAdminBypass?: boolean;
}

export interface MaintenanceStatus {
  isMaintenanceMode: boolean;
  message: string;
  endTime?: string;
  /** When false, ADMIN/SUPER_ADMIN cannot bypass the maintenance landing page. */
  allowAdminBypass: boolean;
  lastChecked: Date;
}

/**
 * Get maintenance config from environment variables (fallback)
 * 
 * @returns MaintenanceConfig - Configuration from environment variables
 */
function getMaintenanceConfigFromEnv(): MaintenanceConfig {
  console.log('[MaintenanceConfig] Reading from environment variables (fallback)');
  
  const isEnabled = process.env.MAINTENANCE_MODE === 'true';
  const message = process.env.MAINTENANCE_MESSAGE || 
    "We're performing scheduled maintenance to improve your experience. We'll be back shortly!";
  const endTime = process.env.MAINTENANCE_END_TIME ?? '24Hrs';
  const allowAdminBypass = process.env.MAINTENANCE_ALLOW_ADMIN_BYPASS !== 'false';

  return {
    isEnabled,
    message,
    endTime,
    allowAdminBypass
  };
}

/**
 * When MAINTENANCE_MODE is exactly "true" or "false", forces maintenance on/off over DB (or env fallback).
 * Unset or any other value leaves isEnabled unchanged (DB-controlled when using server path).
 */
export function applyMaintenanceModeEnvOverride(config: MaintenanceConfig): MaintenanceConfig {
  const flag = process.env.MAINTENANCE_MODE;
  if (flag === 'true') {
    return { ...config, isEnabled: true };
  }
  if (flag === 'false') {
    return { ...config, isEnabled: false };
  }
  return config;
}

/**
 * Get current maintenance mode configuration
 * Reads from cache first, then falls back to environment variables
 * For server-side code, use getMaintenanceConfigAsync() instead
 * 
 * @returns MaintenanceConfig - Current maintenance configuration
 */
export function getMaintenanceConfig(): MaintenanceConfig {
  const now = Date.now();
  
  // Return cached base config if still valid (override applied on read)
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[MaintenanceConfig] Returning cached configuration');
    return applyMaintenanceModeEnvOverride(cachedConfig);
  }

  // Fallback to environment variables (base only; explicit MAINTENANCE_MODE still applied via helper)
  const envConfig = getMaintenanceConfigFromEnv();

  cachedConfig = envConfig;
  cacheTimestamp = now;

  console.log('[MaintenanceConfig] Using environment configuration (fallback)');
  return applyMaintenanceModeEnvOverride(envConfig);
}

/**
 * Get maintenance config asynchronously from database (server-side only)
 * Updates the cache for subsequent sync calls
 * 
 * @returns Promise<MaintenanceConfig> - Current maintenance configuration from DB
 */
export async function getMaintenanceConfigAsync(): Promise<MaintenanceConfig> {
  // Try to use server-side DB helper if available
  try {
    // Dynamic import to avoid edge runtime issues
    const { getMaintenanceConfigFromDB } = await import('@/lib/server/maintenance');
    const dbConfig = await getMaintenanceConfigFromDB();

    cachedConfig = dbConfig;
    cacheTimestamp = Date.now();

    console.log('[MaintenanceConfig] Configuration loaded from database');
    return applyMaintenanceModeEnvOverride(dbConfig);
  } catch (error: any) {
    console.warn('[MaintenanceConfig] Failed to load from DB, using fallback:', error.message);

    const envConfig = getMaintenanceConfigFromEnv();
    cachedConfig = envConfig;
    cacheTimestamp = Date.now();

    return applyMaintenanceModeEnvOverride(envConfig);
  }
}

/**
 * Check if maintenance mode is currently active
 * Uses cached config or environment variables
 * For server-side, use isMaintenanceModeActiveAsync() for DB-backed check
 * 
 * @returns boolean - True if maintenance mode is active
 */
export function isMaintenanceModeActive(): boolean {
  const config = getMaintenanceConfig();
  console.log('[MaintenanceMode] Checking if maintenance mode is active:', config.isEnabled);
  return config.isEnabled;
}

/**
 * Check if maintenance mode is active (async, reads from DB)
 * Updates cache for subsequent sync calls
 * 
 * @returns Promise<boolean> - True if maintenance mode is active
 */
export async function isMaintenanceModeActiveAsync(): Promise<boolean> {
  const config = await getMaintenanceConfigAsync();
  return config.isEnabled;
}

/**
 * Get maintenance status for API responses
 * Uses cached config or environment variables
 * 
 * @returns MaintenanceStatus - Current maintenance status
 */
export function getMaintenanceStatus(): MaintenanceStatus {
  const config = getMaintenanceConfig();
  
  return {
    isMaintenanceMode: config.isEnabled,
    message: config.message || 'System maintenance in progress',
    endTime: config.endTime,
    allowAdminBypass: config.allowAdminBypass !== false,
    lastChecked: new Date()
  };
}

/**
 * Get maintenance status asynchronously (reads from DB)
 * 
 * @returns Promise<MaintenanceStatus> - Current maintenance status
 */
export async function getMaintenanceStatusAsync(): Promise<MaintenanceStatus> {
  const config = await getMaintenanceConfigAsync();
  
  return {
    isMaintenanceMode: config.isEnabled,
    message: config.message || 'System maintenance in progress',
    endTime: config.endTime,
    allowAdminBypass: config.allowAdminBypass !== false,
    lastChecked: new Date()
  };
}

/**
 * Check if a user can bypass maintenance mode
 * Allows ADMIN and SUPER_ADMIN roles to bypass maintenance mode
 * 
 * @param userRole - User's role (ADMIN, SUPER_ADMIN, etc.)
 * @returns boolean - True if user can bypass maintenance
 */
export function canBypassMaintenance(userRole?: string): boolean {
  if (userRole === 'SUPER_ADMIN') {
    console.log('[MaintenanceMode] SUPER_ADMIN always bypasses maintenance');
    return true;
  }

  const config = getMaintenanceConfig();

  if (!config.allowAdminBypass) {
    console.log('[MaintenanceMode] Admin bypass disabled');
    return false;
  }

  // Allow ADMIN and SUPER_ADMIN roles to bypass maintenance mode
  const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];
  const canBypass = userRole ? allowedRoles.includes(userRole) : false;
  
  console.log('[MaintenanceMode] Bypass check:', { userRole, canBypass, allowedRoles });
  return canBypass;
}

/**
 * Invalidate the maintenance config cache
 * Forces next call to refresh from DB/env
 */
export function invalidateMaintenanceCache(): void {
  console.log('[MaintenanceConfig] Invalidating cache');
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Env-only maintenance gate for Edge middleware when DB status fetch fails.
 */
export function getMaintenanceEnvFallbackGate(): { active: boolean; allowBypass: boolean } {
  return {
    active: process.env.MAINTENANCE_MODE === 'true',
    allowBypass: process.env.MAINTENANCE_ALLOW_ADMIN_BYPASS !== 'false',
  };
}

/**
 * Calculate time remaining until maintenance ends
 * 
 * @param endTime - ISO string of maintenance end time
 * @returns string - Formatted time remaining (HH:MM:SS)
 */
export function calculateTimeRemaining(endTime: string): string {
  const now = new Date().getTime();
  const end = new Date(endTime).getTime();
  const difference = end - now;

  if (difference <= 0) {
    return '00:00:00';
  }

  const hours = Math.floor(difference / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Validate maintenance configuration
 * 
 * @param config - Maintenance configuration to validate
 * @returns boolean - True if configuration is valid
 */
export function validateMaintenanceConfig(config: MaintenanceConfig): boolean {
  console.log('[MaintenanceConfig] Validating configuration:', config);
  
  if (typeof config.isEnabled !== 'boolean') {
    console.error('[MaintenanceConfig] Invalid isEnabled value:', config.isEnabled);
    return false;
  }

  if (config.endTime && isNaN(new Date(config.endTime).getTime())) {
    console.error('[MaintenanceConfig] Invalid endTime format:', config.endTime);
    return false;
  }

  console.log('[MaintenanceConfig] Configuration is valid');
  return true;
}