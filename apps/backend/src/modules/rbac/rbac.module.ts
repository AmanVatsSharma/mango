/**
 * @file src/modules/rbac/rbac.module.ts
 * @module rbac
 * @description RBAC module with roles and permissions scaffolding
 * @author BharatERP
 * @created 2025-09-18
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { PlatformOwnerGuard } from './guards/platform-owner.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { BrokerAdminGuard } from './guards/broker-admin.guard';
import { RbacSeeder } from './rbac.seeder';
import { AdminRolesController } from './controllers/admin-roles.controller';
import { AdminPermissionsController } from './controllers/admin-permissions.controller';
import { AdminTeamController } from './controllers/admin-team.controller';
import { RbacResolver } from './rbac.resolver';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      UserEntity,
    ]),
  ],
  controllers: [AdminRolesController, AdminPermissionsController, AdminTeamController],
  providers: [RbacService, PermissionsGuard, PlatformOwnerGuard, RolesGuard, TenantGuard, BrokerAdminGuard, RbacSeeder, RbacResolver],
  exports: [RbacService, PermissionsGuard, PlatformOwnerGuard, RolesGuard, TenantGuard, BrokerAdminGuard],
})
export class RbacModule {}
