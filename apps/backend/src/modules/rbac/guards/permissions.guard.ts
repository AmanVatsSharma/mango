/**
 * @file src/modules/rbac/guards/permissions.guard.ts
 * @module rbac
 * @description Guard that checks for required permissions
 * @author BharatERP
 * @created 2025-09-19
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];
    if (required.length === 0) return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId: string; tenantId?: string };
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    if (!tenantId || !user?.userId) return false;
    return this.rbac.userHasAllPermissions(tenantId, user.userId, required);
  }
}
