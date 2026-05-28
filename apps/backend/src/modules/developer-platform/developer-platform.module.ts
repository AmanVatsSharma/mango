/**
 * @file src/modules/developer-platform/developer-platform.module.ts
 * @module developer-platform
 * @description Developer platform module scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { DeveloperPlatformController } from './controllers/developer-platform.controller';
import { ApiKeyEntity } from './entities/api-key.entity';
import { DeveloperAppEntity } from './entities/developer-app.entity';
import { DeveloperPlatformService } from './services/developer-platform.service';
import { RbacModule } from '../rbac/rbac.module';
import { DeveloperPlatformResolver } from './developer-platform.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    TypeOrmModule.forFeature([ApiKeyEntity, DeveloperAppEntity]),
  ],
  controllers: [DeveloperPlatformController],
  providers: [DeveloperPlatformService, DeveloperPlatformResolver],
  exports: [DeveloperPlatformService],
})
export class DeveloperPlatformModule {}
