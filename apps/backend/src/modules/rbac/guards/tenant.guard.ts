/**
 * @file src/modules/rbac/guards/tenant.guard.ts
 * @module rbac
 * @description Guard to enforce presence of X-Tenant-Id header
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TENANT_ID_HEADER } from '../../../shared/request-context';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers[TENANT_ID_HEADER];
    if (!tenantId) throw new UnauthorizedException('Missing X-Tenant-Id');
    return true;
  }
}
