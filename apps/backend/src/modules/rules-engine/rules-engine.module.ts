/**
 * @file src/modules/rules-engine/rules-engine.module.ts
 * @module rules-engine
 * @description Automation rules engine module for tenant-scoped rule management
 * @author BharatERP
 * @created 2026-05-16
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { RulesEngineController } from './controllers/rules-engine.controller';
import { RulesEngineService } from './services/rules-engine.service';
import { RuleEntity } from './entities/rule.entity';
import { RulesEngineResolver } from './rules-engine.resolver';

@Module({
  imports: [SharedModule, RbacModule, TypeOrmModule.forFeature([RuleEntity])],
  controllers: [RulesEngineController],
  providers: [RulesEngineService, RulesEngineResolver],
  exports: [RulesEngineService],
})
export class RulesEngineModule {}
