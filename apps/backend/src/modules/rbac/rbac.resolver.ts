/**
 * File:        apps/backend/src/modules/rbac/rbac.resolver.ts
 * Module:      rbac · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over RbacService.
 *              Covers: role CRUD, permission CRUD, user-role assignments, role-permission grants.
 *
 * Exports:
 *   - RbacResolver                  — GraphQL admin API for RBAC management
 *   - RoleObjectType                — GraphQL object type
 *   - PermissionObjectType          — GraphQL object type
 *
 * Depends on:
 *   - RbacService          — all RBAC business logic
 *   - JwtAuthGuard         — auth enforcement
 *   - TenantGuard          — tenant isolation
 *   - PermissionsGuard     — permission enforcement
 *   - Permissions          — permission decorator
 *   - Tenant               — tenant decorator
 *
 * Side-effects: DB writes via create/update/delete mutations
 *
 * Key invariants:
 *   - All operations require rbac:read or rbac:write permission
 *   - tenantId always sourced from @Tenant() decorator (never from client)
 *   - deleteRole / deletePermission cascade-remove role-permission and user-role associations
 *
 * Read order:
 *   1. ObjectType definitions — data shapes
 *   2. RbacResolver — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, ObjectType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from './guards/tenant.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { Permissions } from './decorators/permissions.decorator';
import { Tenant } from './decorators/tenant.decorator';
import { AppError } from '@obsidian/backend-common';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('Role')
export class RoleObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description!: string | null;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;
}

@ObjectType('Permission')
export class PermissionObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description!: string | null;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class RbacResolver {
  constructor(private readonly rbacService: RbacService) {}

  // ── Queries ──────────────────────────────────────────────────────────────

  @Query(() => [RoleObjectType], { name: 'roles' })
  @Permissions('rbac:read')
  async roles(@Tenant() tenantId: string): Promise<RoleObjectType[]> {
    const roles = await this.rbacService.listRoles(tenantId);
    return roles.map(this.mapRole);
  }

  @Query(() => RoleObjectType, { name: 'role', nullable: true })
  @Permissions('rbac:read')
  async role(
    @Tenant() tenantId: string,
    @Args('name') name: string,
  ): Promise<RoleObjectType | null> {
    const role = await this.rbacService.getRole(tenantId, name);
    return role ? this.mapRole(role) : null;
  }

  @Query(() => [PermissionObjectType], { name: 'permissions' })
  @Permissions('rbac:read')
  async permissions(@Tenant() tenantId: string): Promise<PermissionObjectType[]> {
    const perms = await this.rbacService.listPermissions(tenantId);
    return perms.map(this.mapPerm);
  }

  @Query(() => PermissionObjectType, { name: 'permission', nullable: true })
  @Permissions('rbac:read')
  async permission(
    @Tenant() tenantId: string,
    @Args('name') name: string,
  ): Promise<PermissionObjectType | null> {
    const perm = await this.rbacService.getPermission(tenantId, name);
    return perm ? this.mapPerm(perm) : null;
  }

  // ── Role Mutations ────────────────────────────────────────────────────────

  @Mutation(() => RoleObjectType)
  @Permissions('rbac:write')
  async createRole(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<RoleObjectType> {
    const role = await this.rbacService.ensureRole(tenantId, name, description);
    return this.mapRole(role);
  }

  @Mutation(() => RoleObjectType)
  @Permissions('rbac:write')
  async updateRole(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('newName', { nullable: true }) newName?: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<RoleObjectType> {
    const role = await this.rbacService.updateRole(tenantId, name, { newName, description });
    return this.mapRole(role);
  }

  @Mutation(() => RoleObjectType)
  @Permissions('rbac:write')
  async deleteRole(
    @Tenant() tenantId: string,
    @Args('name') name: string,
  ): Promise<RoleObjectType> {
    const role = await this.rbacService.getRole(tenantId, name);
    if (!role) throw new AppError('RESOURCE_NOT_FOUND', `Role not found: ${name}`);
    await this.rbacService.deleteRole(tenantId, name);
    return this.mapRole(role);
  }

  // ── Permission Mutations ─────────────────────────────────────────────────

  @Mutation(() => PermissionObjectType)
  @Permissions('rbac:write')
  async createPermission(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<PermissionObjectType> {
    const perm = await this.rbacService.ensurePermission(tenantId, name, description);
    return this.mapPerm(perm);
  }

  @Mutation(() => PermissionObjectType)
  @Permissions('rbac:write')
  async updatePermission(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('newName', { nullable: true }) newName?: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<PermissionObjectType> {
    const perm = await this.rbacService.updatePermission(tenantId, name, { newName, description });
    return this.mapPerm(perm);
  }

  @Mutation(() => PermissionObjectType)
  @Permissions('rbac:write')
  async deletePermission(
    @Tenant() tenantId: string,
    @Args('name') name: string,
  ): Promise<PermissionObjectType> {
    const perm = await this.rbacService.getPermission(tenantId, name);
    if (!perm) throw new AppError('RESOURCE_NOT_FOUND', `Permission not found: ${name}`);
    await this.rbacService.deletePermission(tenantId, name);
    return this.mapPerm(perm);
  }

  // ── Assignment Mutations ─────────────────────────────────────────────────

  @Mutation(() => RoleObjectType)
  @Permissions('rbac:write')
  async assignRoleToUser(
    @Tenant() tenantId: string,
    @Args('userId') userId: string,
    @Args('roleName') roleName: string,
  ): Promise<RoleObjectType> {
    await this.rbacService.assignRoleToUser(tenantId, userId, roleName);
    const role = await this.rbacService.getRole(tenantId, roleName);
    if (!role) throw new AppError('RESOURCE_NOT_FOUND', `Role not found: ${roleName}`);
    return this.mapRole(role);
  }

  @Mutation(() => RoleObjectType)
  @Permissions('rbac:write')
  async grantPermissionToRole(
    @Tenant() tenantId: string,
    @Args('roleName') roleName: string,
    @Args('permissionName') permissionName: string,
  ): Promise<RoleObjectType> {
    await this.rbacService.grantPermissionToRole(tenantId, roleName, permissionName);
    const role = await this.rbacService.getRole(tenantId, roleName);
    if (!role) throw new AppError('RESOURCE_NOT_FOUND', `Role not found: ${roleName}`);
    return this.mapRole(role);
  }

  // ── Mappers ──────────────────────────────────────────────────────────────

  private mapRole(r: RoleEntity): RoleObjectType {
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      description: r.description ?? null,
      createdAt: r.createdAt?.toISOString() ?? '',
      updatedAt: r.updatedAt?.toISOString() ?? '',
    };
  }

  private mapPerm(p: PermissionEntity): PermissionObjectType {
    return {
      id: p.id,
      tenantId: p.tenantId,
      name: p.name,
      description: (p as any).description ?? null,
      createdAt: (p as any).createdAt?.toISOString() ?? '',
      updatedAt: (p as any).updatedAt?.toISOString() ?? '',
    };
  }
}