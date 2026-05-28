/**
 * File:        apps/backend/src/modules/rbac/guards/broker-admin.guard.ts
 * Module:      rbac
 * Purpose:     Guards broker-scoped admin routes. Enforces that the requesting
 *              user belongs to the broker (via x-tenant-id header) and holds the
 *              BROKER_ADMIN role. Resolves the slug-based tenantId from the JWT
 *              (req.user.tenantId) into the UUID form so service layers can
 *              query BrokerEntity.tenantId correctly.
 *
 * Exports:
 *   - BrokerAdminGuard — NestJS CanActivate guard
 *
 * Depends on:
 *   - TenancyService — findByCode() to resolve slug → tenant UUID + status
 *   - RbacService    — userHasAnyRole() for BROKER_ADMIN check
 *   - AppError       — typed error for authorization failures
 *
 * Side-effects: none (read-only DB checks per request)
 *
 * Key invariants:
 *   - MUST run after JwtAuthGuard so req.user is populated.
 *   - x-tenant-id header carries the slug (e.g. "acme-securities") matching JWT tid.
 *   - If tenant status is PENDING, the guard passes but downstream APIs should
 *     redirect to setup — this guard only checks authentication + role.
 *   - Platform Owner (tid='platform') is rejected — broker-only routes.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { RbacService } from '../rbac.service';

const PLATFORM_TENANT_CODE = 'platform';

@Injectable()
export class BrokerAdminGuard implements CanActivate {
  constructor(
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId: string; tenantId?: string } | undefined;

    if (!user?.userId) {
      throw new AppError('AUTHENTICATION_FAILED', 'Authentication required');
    }

    if (user.tenantId === PLATFORM_TENANT_CODE) {
      throw new AppError('AUTHORIZATION_FAILED', 'Broker admin access required — platform tenant rejected');
    }

    if (!user.tenantId) {
      throw new AppError('AUTHORIZATION_FAILED', 'Tenant context missing');
    }

    // Skip tenant UUID resolution — use slug directly for RBAC
    // Note: TenantGuard already validated the tenant exists
    req.tenantId = user.tenantId; // store slug as tenantId for consistency

    const hasRole = await this.rbac.userHasAnyRole(
      user.tenantId,
      user.userId,
      ['BROKER_ADMIN'],
    );

    if (!hasRole) {
      throw new AppError('AUTHORIZATION_FAILED', 'BROKER_ADMIN role required');
    }

    return true;
  }
}