/**
 * @file src/modules/rbac/rbac.seeder.ts
 * @module rbac
 * @description Seeder to create default roles and permissions for a tenant
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { AppLoggerService } from '../../shared/logger';

@Injectable()
export class RbacSeeder implements OnModuleInit {
  constructor(
    private readonly rbac: RbacService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RbacSeeder.name);
  }

  async onModuleInit(): Promise<void> {
    const tenantId = process.env.SEED_RBAC_TENANT_ID;
    if (!tenantId) return;
    this.logger.debug(`Seeding RBAC for tenant ${tenantId}`);
    const defaultRoles = ['admin', 'trader', 'viewer'];
    const defaultPerms = [
      'accounts:read',
      'accounts:write',
      'ledger:read',
      'ledger:write',
      'statements:read',
      'orders:write',
      'orders:read',
      'positions:read',
      'oms:admin',
    ];
    for (const role of defaultRoles) await this.rbac.ensureRole(tenantId, role);
    for (const perm of defaultPerms)
      await this.rbac.ensurePermission(tenantId, perm);
    // Grant all permissions to admin
    for (const perm of defaultPerms)
      await this.rbac.grantPermissionToRole(tenantId, 'admin', perm);
  }
}
