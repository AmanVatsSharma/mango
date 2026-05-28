/**
 * @file src/modules/rbac/rbac.service.ts
 * @module rbac
 * @description RBAC service to manage roles and permissions and evaluate access
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { AppLoggerService } from '../../shared/logger';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly perms: Repository<PermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePerms: Repository<RolePermissionEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RbacService.name);
  }

  async ensureRole(
    tenantId: string,
    name: string,
    description?: string,
  ): Promise<RoleEntity> {
    let role = await this.roles.findOne({ where: { tenantId, name } });
    if (!role) {
      role = await this.roles.save({
        tenantId,
        name,
        description: description ?? null,
      });
    }
    return role;
  }

  async ensurePermission(
    tenantId: string,
    name: string,
    description?: string,
  ): Promise<PermissionEntity> {
    let perm = await this.perms.findOne({ where: { tenantId, name } });
    if (!perm) {
      perm = await this.perms.save({
        tenantId,
        name,
        description: description ?? null,
      });
    }
    return perm;
  }

  async listRoles(tenantId: string): Promise<RoleEntity[]> {
    return this.roles.find({ where: { tenantId } });
  }

  async getRole(tenantId: string, name: string): Promise<RoleEntity | null> {
    return this.roles.findOne({ where: { tenantId, name } });
  }

  async updateRole(
    tenantId: string,
    name: string,
    dto: { newName?: string; description?: string },
  ): Promise<RoleEntity> {
    const role = await this.roles.findOne({ where: { tenantId, name } });
    if (!role) {
      throw new AppError('RESOURCE_NOT_FOUND', `Role not found: ${name}`);
    }
    if (dto.newName) role.name = dto.newName;
    if (dto.description !== undefined) role.description = dto.description;
    return this.roles.save(role);
  }

  async deleteRole(tenantId: string, name: string): Promise<void> {
    const role = await this.roles.findOne({ where: { tenantId, name } });
    if (!role) return;
    await this.userRoles.delete({ tenantId, roleId: role.id } as any);
    await this.rolePerms.delete({ tenantId, roleId: role.id } as any);
    await this.roles.delete({ id: role.id });
  }

  async listPermissions(tenantId: string): Promise<PermissionEntity[]> {
    return this.perms.find({ where: { tenantId } });
  }

  async getPermission(
    tenantId: string,
    name: string,
  ): Promise<PermissionEntity | null> {
    return this.perms.findOne({ where: { tenantId, name } });
  }

  async updatePermission(
    tenantId: string,
    name: string,
    dto: { newName?: string; description?: string },
  ): Promise<PermissionEntity> {
    const perm = await this.perms.findOne({ where: { tenantId, name } });
    if (!perm) {
      throw new AppError('RESOURCE_NOT_FOUND', `Permission not found: ${name}`);
    }
    if (dto.newName) perm.name = dto.newName;
    if (dto.description !== undefined) perm.description = dto.description;
    return this.perms.save(perm);
  }

  async deletePermission(tenantId: string, name: string): Promise<void> {
    const perm = await this.perms.findOne({ where: { tenantId, name } });
    if (!perm) return;
    await this.rolePerms.delete({ tenantId, permissionId: perm.id } as any);
    await this.perms.delete({ id: perm.id });
  }

  async assignRoleToUser(
    tenantId: string,
    userId: string,
    roleName: string,
  ): Promise<void> {
    const role = await this.ensureRole(tenantId, roleName);
    const exists = await this.userRoles.findOne({
      where: { tenantId, userId, roleId: role.id },
    });
    if (!exists)
      await this.userRoles.save({ tenantId, userId, roleId: role.id });
  }

  async grantPermissionToRole(
    tenantId: string,
    roleName: string,
    permissionName: string,
  ): Promise<void> {
    const role = await this.ensureRole(tenantId, roleName);
    const perm = await this.ensurePermission(tenantId, permissionName);
    const exists = await this.rolePerms.findOne({
      where: { tenantId, roleId: role.id, permissionId: perm.id },
    });
    if (!exists)
      await this.rolePerms.save({
        tenantId,
        roleId: role.id,
        permissionId: perm.id,
      });
  }

  async userHasAnyRole(
    tenantId: string,
    userId: string,
    roleNames: string[],
  ): Promise<boolean> {
    if (roleNames.length === 0) return true;
    const roles = await this.roles.find({
      where: roleNames.map((n) => ({ tenantId, name: n })) as any,
    });
    if (roles.length === 0) return false;
    const roleIds = roles.map((r) => r.id);
    const count = await this.userRoles.count({
      where: { tenantId, userId, roleId: roleIds as any },
    });
    return count > 0;
  }

  async userHasAllPermissions(
    tenantId: string,
    userId: string,
    permissionNames: string[],
  ): Promise<boolean> {
    if (permissionNames.length === 0) return true;
    // Find user role ids
    const userRoleRows = await this.userRoles.find({
      where: { tenantId, userId },
    });
    if (userRoleRows.length === 0) return false;
    const roleIds = userRoleRows.map((ur) => ur.roleId);
    // Find permission ids for given names
    const perms = await this.perms.find({
      where: permissionNames.map((n) => ({ tenantId, name: n })) as any,
    });
    if (perms.length < permissionNames.length) return false;
    const permIds = perms.map((p) => p.id);
    // Count distinct permissions granted to any of user roles
    const granted = await this.rolePerms
      .createQueryBuilder('rp')
      .where('rp.tenant_id = :tenantId', { tenantId })
      .andWhere('rp.role_id IN (:...roleIds)', { roleIds })
      .andWhere('rp.permission_id IN (:...permIds)', { permIds })
      .select('COUNT(DISTINCT rp.permission_id)', 'cnt')
      .getRawOne<{ cnt: string }>();
    return Number(granted?.cnt ?? 0) >= permIds.length;
  }
}
