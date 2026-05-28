/**
 * File:        apps/backend/src/modules/rbac/constants/role.constants.ts
 * Module:      rbac
 * Purpose:     Canonical role-name constants used across RBAC seeding, guards, and tests.
 *
 * Exports:
 *   - ROLE  — enum mapping logical role names to DB string values
 *
 * Key invariants:
 *   - Role values are stored as plain strings in RoleEntity.name (not enum labels).
 *   - BROKER_ADMIN = 'admin' intentionally — matches the string seeded by SaasControlPlaneService.
 *     Renaming the DB value requires a data migration; the constant is TS-only.
 *   - PLATFORM_OWNER = 'platform_owner' — reserved for the platform tenant only.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

export enum ROLE {
  PLATFORM_OWNER = 'platform_owner',
  BROKER_ADMIN = 'admin',
  BROKER_OWNER = 'broker_owner',
  TRADER = 'trader',
  VIEWER = 'viewer',
  SUPPORT_AGENT = 'support_agent',
}
