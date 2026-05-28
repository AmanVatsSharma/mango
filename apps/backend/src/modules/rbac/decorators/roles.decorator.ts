/**
 * @file src/modules/rbac/decorators/roles.decorator.ts
 * @module rbac
 * @description Roles decorator for RBAC
 * @author BharatERP
 * @created 2025-09-18
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
