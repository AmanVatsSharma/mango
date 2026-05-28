/**
 * @file src/modules/rbac/guards/roles.guard.ts
 * @module rbac
 * @description Simple roles guard based on metadata; placeholder until DB roles wired
 * @author BharatERP
 * @created 2025-09-18
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string };
    const tenantId = request.headers['x-tenant-id'] as string | undefined;
    if (!tenantId || !user?.userId) return false;
    return this.rbac.userHasAnyRole(tenantId, user.userId, requiredRoles);
  }
}
