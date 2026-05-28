/**
 * @file src/modules/realtime/prana-stream/prana-stream.module.ts
 * @module realtime/prana-stream
 * @description Nest module bundling gateway, services, and adapters for unified realtime stream
 * @author BharatERP
 * @created 2025-09-24
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../../shared/shared.module';
import { RbacModule } from '../../rbac/rbac.module';
import { PranaStreamGateway } from './gateway/prana-stream.gateway';
import { SubscriptionRegistryService } from './services/subscription-registry.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeAggregatorService } from './services/realtime-aggregator.service';
import { CompositeMarketDataAdapter } from './adapters/composite-market-data.adapter';
import { MainMarketDataAdapter } from './adapters/main-market-data.adapter';
import { VortexMarketDataAdapter } from './adapters/vortex-market-data.adapter';
import { MockMarketDataAdapter } from './adapters/mock-market-data.adapter';
import { RealtimePublisherService } from './services/realtime-publisher.service';
import { RealtimeScaleCoordinatorService } from './services/realtime-scale-coordinator.service';
import { AdminPranaController } from './controllers/admin-prana.controller';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { OrderEntity } from '../../oms/entities/order.entity';
import { PositionLedgerEntryEntity } from '../../accounts/entities/position-ledger-entry.entity';
import { CashLedgerEntryEntity } from '../../accounts/entities/cash-ledger-entry.entity';
import { HoldEntity } from '../../accounts/entities/hold.entity';
import { RealtimeResolver } from './realtime.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      AccountEntity,
      OrderEntity,
      PositionLedgerEntryEntity,
      CashLedgerEntryEntity,
      HoldEntity,
    ]),
  ],
  providers: [
    PranaStreamGateway,
    RealtimeAggregatorService,
    RealtimePublisherService,
    RealtimeScaleCoordinatorService,
    SubscriptionRegistryService,
    CompositeMarketDataAdapter,
    MainMarketDataAdapter,
    VortexMarketDataAdapter,
    MockMarketDataAdapter,
    WsJwtGuard,
    RealtimeResolver,
  ],
  exports: [RealtimeAggregatorService, RealtimePublisherService],
  controllers: [AdminPranaController],
})
export class PranaStreamModule {}


