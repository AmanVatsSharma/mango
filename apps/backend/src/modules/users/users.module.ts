/**
 * @file src/modules/users/users.module.ts
 * @module users
 * @description Users module for managing user accounts
 * @author BharatERP
 * @created 2025-09-18
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { ProfileController } from './controllers/profile.controller';
import { UsersResolver } from './users.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), SharedModule, forwardRef(() => RbacModule)],
  controllers: [UsersController, AdminUsersController, ProfileController],
  providers: [UsersService, UsersResolver],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
