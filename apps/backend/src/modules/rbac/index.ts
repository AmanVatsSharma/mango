/**
 * @file src/modules/rbac/index.ts
 * @module rbac
 * @description Re-exports for RBAC module public API
 * @author BharatERP
 * @created 2026-02-17
 */

export * from './rbac.module';
export * from './rbac.service';
export * from './rbac.resolver';
export * from './entities/role.entity';
export * from './entities/permission.entity';
export * from './entities/user-role.entity';
export * from './entities/role-permission.entity';
export * from './decorators/permissions.decorator';
export * from './decorators/roles.decorator';
export * from './decorators/tenant.decorator';
export * from './guards/permissions.guard';
export * from './guards/platform-owner.guard';
export * from './guards/roles.guard';
export * from './guards/tenant.guard';
export * from './guards/broker-admin.guard';
export * from './constants/role.constants';
export * from './constants/permission.constants';
