/**
 * File:        apps/backend/src/modules/rbac/guards/platform-owner.guard.ts
 * Module:      rbac
 * Purpose:     Guards routes that only the Platform Owner (tid='platform', role='platform_owner')
 *              may access. Enforces both tenant scope AND role in a single guard.
 *
 * Exports:
 *   - PlatformOwnerGuard  — NestJS CanActivate guard
 *
 * Depends on:
 *   - RbacService  — to check platform_owner role assignment
 *
 * Side-effects: none (read-only DB check per request)
 *
 * Key invariants:
 *   - MUST run after JwtAuthGuard so req.user is populated.
 *   - Checks req.user.tenantId === 'platform' first (fast path, no DB).
 *   - Then queries RbacService.userHasAnyRole('platform', userId, ['platform_owner']).
 *   - Throws AppError('FORBIDDEN') to get a 403; a bare UnauthorizedException would be 401.
 *   - Does NOT cache the role check — /saas/* is low-volume (platform-owner only).
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { RbacService } from '../rbac.service';
import { ROLE } from '../constants/role.constants';

const PLATFORM_TENANT_CODE = 'platform';

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly rbac: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId: string; tenantId?: string } | undefined;

    if (!user?.userId) {
      throw new AppError('AUTHENTICATION_FAILED', 'Authentication required');
    }

    if (user.tenantId !== PLATFORM_TENANT_CODE) {
      throw new AppError('AUTHORIZATION_FAILED', 'Platform Owner access required');
    }

    const hasRole = await this.rbac.userHasAnyRole(
      PLATFORM_TENANT_CODE,
      user.userId,
      [ROLE.PLATFORM_OWNER],
    );

    if (!hasRole) {
      throw new AppError('AUTHORIZATION_FAILED', 'Platform Owner role required');
    }

    return true;
  }
}
