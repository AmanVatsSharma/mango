/**
 * @file src/modules/rbac/decorators/permissions.decorator.ts
 * @module rbac
 * @description Permissions decorator for RBAC
 * @author BharatERP
 * @created 2025-09-19
 */

import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
