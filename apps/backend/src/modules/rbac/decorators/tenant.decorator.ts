/**
 * @file src/modules/rbac/decorators/tenant.decorator.ts
 * @module rbac
 * @description Parameter decorator to read tenantId from request header
 * @author BharatERP
 * @created 2025-09-18
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TENANT_ID_HEADER } from '../../../shared/request-context';

export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers[TENANT_ID_HEADER] as string | undefined;
  },
);
