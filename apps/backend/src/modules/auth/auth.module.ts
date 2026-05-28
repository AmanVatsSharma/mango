/**
 * @file src/modules/auth/auth.module.ts
 * @module auth
 * @description Auth module: mobile-first OTP via SNS and JWT access/refresh
 * @author BharatERP
 * @created 2025-09-18
 */

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { JwtAccessStrategy } from './strategies/jwt.strategy';
import { SharedModule } from '../../shared/shared.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AuthResolver } from './auth.resolver';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => RbacModule),
    SharedModule,
    PassportModule.register({ session: false }),
    JwtModule.register({}),
    TypeOrmModule.forFeature([RefreshTokenEntity]),
  ],
  providers: [AuthService, JwtAccessStrategy, AuthResolver],
  controllers: [AuthController, AdminAuthController],
  exports: [AuthService],
})
export class AuthModule {}
