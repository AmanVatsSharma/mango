/**
 * File:        apps/backend/src/modules/rbac/constants/permission.constants.ts
 * Module:      rbac
 * Purpose:     Canonical permission-name constants used across RBAC seeding, guards, and tests.
 *
 * Exports:
 *   - PERMISSION  — enum mapping logical permission names to DB string values
 *   - BROKER_DEFAULT_PERMS  — permissions seeded for every new broker tenant's admin role
 *   - PLATFORM_PERMS        — permissions granted only to the platform_owner role
 *
 * Key invariants:
 *   - Values must exactly match what is stored in PermissionEntity.name.
 *   - BROKER_DEFAULT_PERMS mirrors the inline array in SaasControlPlaneService (kept in sync).
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

export enum PERMISSION {
  // Broker-tenant permissions
  ACCOUNTS_READ = 'accounts:read',
  ACCOUNTS_WRITE = 'accounts:write',
  LEDGER_READ = 'ledger:read',
  LEDGER_WRITE = 'ledger:write',
  STATEMENTS_READ = 'statements:read',
  ORDERS_WRITE = 'orders:write',
  ORDERS_READ = 'orders:read',
  POSITIONS_READ = 'positions:read',
  OMS_ADMIN = 'oms:admin',

  // Platform-owner-only permissions
  PLATFORM_TENANT_CREATE = 'platform:tenant:create',
  PLATFORM_TENANT_READ = 'platform:tenant:read',
  PLATFORM_TENANT_SUSPEND = 'platform:tenant:suspend',
  PLATFORM_BROKER_PROVISION = 'platform:broker:provision',
}

export const BROKER_DEFAULT_PERMS = [
  PERMISSION.ACCOUNTS_READ,
  PERMISSION.ACCOUNTS_WRITE,
  PERMISSION.LEDGER_READ,
  PERMISSION.LEDGER_WRITE,
  PERMISSION.STATEMENTS_READ,
  PERMISSION.ORDERS_WRITE,
  PERMISSION.ORDERS_READ,
  PERMISSION.POSITIONS_READ,
  PERMISSION.OMS_ADMIN,
] as const;

export const PLATFORM_PERMS = [
  PERMISSION.PLATFORM_TENANT_CREATE,
  PERMISSION.PLATFORM_TENANT_READ,
  PERMISSION.PLATFORM_TENANT_SUSPEND,
  PERMISSION.PLATFORM_BROKER_PROVISION,
] as const;
