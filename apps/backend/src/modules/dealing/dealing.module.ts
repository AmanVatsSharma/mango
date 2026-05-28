/**
 * @file src/modules/dealing/dealing.module.ts
 * @module dealing
 * @description Dealing module scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { DealingController } from './controllers/dealing.controller';
import { AdminDealerDeskController } from './controllers/admin-dealer-desk.controller';
import { DealEntity } from './entities/deal.entity';
import { DealingQuoteEntity } from './entities/dealing-quote.entity';
import { DealingService } from './services/dealing.service';
import { RbacModule } from '../rbac/rbac.module';
import { MarketModule } from '../market/market.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PositionsModule } from '../oms/positions/positions.module';
import { DealingResolver } from './dealing.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    MarketModule,
    AccountsModule,
    PositionsModule,
    TypeOrmModule.forFeature([DealEntity, DealingQuoteEntity]),
  ],
  controllers: [DealingController, AdminDealerDeskController],
  providers: [DealingService, DealingResolver],
  exports: [DealingService],
})
export class DealingModule {}
