/**
 * File:        apps/backend/src/modules/reconciliation/reconciliation.module.ts
 * Module:      reconciliation
 * Purpose:     Wires ReconciliationService with LP statement line storage,
 *              internal execution access, and break tracking.
 *
 * Exports:
 *   - ReconciliationModule
 *   - ReconciliationService (for cron / EOD job injection)
 *
 * Depends on:
 *   - SharedModule    — AppLoggerService, OutboxService (@Global)
 *   - ExecutionEntity — read-only access for reconciliation matching
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - ExecutionEntity registered here separately from OmsModule to avoid circular dependency
 *
 * Read order:
 *   1. @Module imports
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { ExecutionEntity } from '../oms/entities/execution.entity';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { LpStatementLineEntity } from './entities/lp-statement-line.entity';
import { ReconciliationBreakEntity } from './entities/reconciliation-break.entity';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationResolver } from './reconciliation.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    TypeOrmModule.forFeature([
      ReconciliationBreakEntity,
      LpStatementLineEntity,
      ExecutionEntity,
    ]),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationResolver],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
