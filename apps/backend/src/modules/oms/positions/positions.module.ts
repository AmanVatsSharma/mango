/**
 * @file src/modules/oms/positions/positions.module.ts
 * @module oms-positions
 * @description Positions PMS submodule for aggregating positions and snapshots
 * @author BharatERP
 * @created 2025-09-19
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../../shared/shared.module';
import { MarketModule } from '../../market/market.module';
import { AccountsModule } from '../../accounts/accounts.module';
import { PositionSnapshotEntity } from '../entities/position-snapshot.entity';
import { PositionLedgerEntryEntity } from '../../accounts/entities/position-ledger-entry.entity';
import { PositionsService } from './services/positions.service';
import { PositionsController } from './controllers/positions.controller';
import { AdminPositionsController } from './controllers/admin-positions.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { OrderEventsService } from '../services/order-events.service';

@Module({
  imports: [
    SharedModule,
    MarketModule,
    RbacModule,
    forwardRef(() => AccountsModule),
    TypeOrmModule.forFeature([PositionLedgerEntryEntity, PositionSnapshotEntity]),
  ],
  controllers: [PositionsController, AdminPositionsController],
  providers: [PositionsService, OrderEventsService],
  exports: [PositionsService, OrderEventsService],
})
export class PositionsModule {}


