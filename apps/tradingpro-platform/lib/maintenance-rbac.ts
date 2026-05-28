/**
 * @file maintenance-rbac.ts
 * @module maintenance-rbac
 * @description Role check for who may change maintenance settings via POST /api/maintenance/toggle
 * @author StockTrade
 * @created 2026-04-03
 */

const MAINTENANCE_MANAGER_ROLES = new Set<string>(['ADMIN', 'SUPER_ADMIN'])

/**
 * Returns true when the session role may upsert MAINTENANCE system_settings.
 */
export function canManageMaintenanceSettings(role: unknown): boolean {
  return typeof role === 'string' && MAINTENANCE_MANAGER_ROLES.has(role)
}
