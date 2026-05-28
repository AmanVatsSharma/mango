/**
 * File:        apps/backend/src/shared/bootstrap/platform-tenant-seeder.ts
 * Module:      shared/bootstrap
 * Purpose:     Idempotently seeds the 'platform' tenant, platform_owner role, its permissions,
 *              and one platform owner user from PLATFORM_OWNER_MOBILE on every app boot.
 *
 * Exports:
 *   - PlatformTenantSeeder  — OnApplicationBootstrap lifecycle hook
 *
 * Depends on:
 *   - TenancyService  — create / look up the 'platform' tenant
 *   - RbacService     — ensureRole, ensurePermission, grantPermissionToRole, assignRoleToUser
 *   - UsersService    — findByMobile, create (OTP-ready, no password required)
 *   - AppLoggerService — structured logs
 *
 * Side-effects:
 *   - DB writes on first boot: 1 tenant, 1 role, 4 permissions, role-permission mappings.
 *   - If PLATFORM_OWNER_MOBILE set: 1 user row + 1 user-role row.
 *   - All writes are idempotent; re-running on a seeded DB is a no-op.
 *
 * Key invariants:
 *   - Uses tenant CODE 'platform' (not UUID) as tenantId for RBAC — consistent with
 *     the guard and JWT tid claim.
 *   - PLATFORM_OWNER_MOBILE is optional; omitting it in dev is safe (logs a warning).
 *   - Failures are caught and logged; they must NOT crash the app (returns gracefully).
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AppLoggerService } from '../logger';
import { TenancyService } from '../../modules/tenancy/services/tenancy.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { UsersService } from '../../modules/users/users.service';
import { ROLE } from '../../modules/rbac/constants/role.constants';
import { PLATFORM_PERMS } from '../../modules/rbac/constants/permission.constants';

const PLATFORM_CODE = 'platform';

@Injectable()
export class PlatformTenantSeeder implements OnApplicationBootstrap {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PlatformTenantSeeder.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedPlatformTenant();
    } catch (err) {
      this.logger.warn('PlatformTenantSeeder: seed failed (non-fatal)', { err });
    }
  }

  private async seedPlatformTenant(): Promise<void> {
    // 1. Ensure 'platform' tenant exists
    let tenant = (await this.tenancy.listTenants()).find((t) => t.code === PLATFORM_CODE);
    if (!tenant) {
      tenant = await this.tenancy.createTenant({
        code: PLATFORM_CODE,
        displayName: 'Obsidian Platform',
        timezone: 'Asia/Kolkata',
        jurisdictionProfile: 'GLOBAL',
        status: 'ACTIVE',
      });
      this.logger.debug('PlatformTenantSeeder: platform tenant created', { tenantId: tenant.id });
    } else {
      this.logger.debug('PlatformTenantSeeder: platform tenant exists', { tenantId: tenant.id });
    }

    // 2. Ensure platform_owner role + all platform permissions (all idempotent)
    await this.rbac.ensureRole(PLATFORM_CODE, ROLE.PLATFORM_OWNER, 'Platform owner — full SaaS governance access');
    for (const perm of PLATFORM_PERMS) {
      await this.rbac.ensurePermission(PLATFORM_CODE, perm);
      await this.rbac.grantPermissionToRole(PLATFORM_CODE, ROLE.PLATFORM_OWNER, perm);
    }
    this.logger.debug('PlatformTenantSeeder: platform_owner role and permissions ensured');

    // 3. Optionally seed the platform owner user from env
    const mobile = process.env.PLATFORM_OWNER_MOBILE;
    if (!mobile) {
      this.logger.warn('PlatformTenantSeeder: PLATFORM_OWNER_MOBILE not set — no owner user seeded (OK in dev)');
      return;
    }

    let user = await this.users.findByMobile(PLATFORM_CODE, mobile);
    if (!user) {
      user = await this.users.create({
        tenantId: PLATFORM_CODE,
        mobileE164: mobile,
        email: process.env.PLATFORM_OWNER_EMAIL,
      });
      this.logger.debug('PlatformTenantSeeder: platform owner user created', { userId: user.id });
    }

    // assignRoleToUser is idempotent (checks existence before insert)
    await this.rbac.assignRoleToUser(PLATFORM_CODE, user.id, ROLE.PLATFORM_OWNER);
    this.logger.debug('PlatformTenantSeeder: platform owner role assigned', { userId: user.id, mobile });
  }
}
