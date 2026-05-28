/**
 * @file src/modules/settlement/settlement.module.ts
 * @module settlement
 * @description Settlement module scaffold for post-trade operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { SettlementController } from './controllers/settlement.controller';
import { SettlementJobEntity } from './entities/settlement-job.entity';
import { SettlementService } from './services/settlement.service';
import { SettlementResolver } from './settlement.resolver';

@Module({
  imports: [SharedModule, RbacModule, TypeOrmModule.forFeature([SettlementJobEntity])],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementResolver],
  exports: [SettlementService, TypeOrmModule],
})
export class SettlementModule {}
