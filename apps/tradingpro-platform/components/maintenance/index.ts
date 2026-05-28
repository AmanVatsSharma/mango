/**
 * Maintenance Mode Components
 * 
 * Barrel export for maintenance mode components
 * Provides clean imports and TypeScript type exports
 */

export { default as MaintenanceMode } from './MaintenanceMode';

// Type exports
export type MaintenanceConfig = {
  isEnabled: boolean;
  message?: string;
  endTime?: string;
  allowAdminBypass?: boolean;
};

export type MaintenanceStatus = {
  isMaintenanceMode: boolean;
  message: string;
  endTime?: string;
  allowAdminBypass: boolean;
  lastChecked: Date;
};