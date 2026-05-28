/**
 * File:        apps/backend/src/modules/market/market.module.ts
 * Module:      market
 * Purpose:     Market module — instruments, exchanges, watchlists, and exchange-aware price feed
 *              with pluggable data provider adapters (Kite, GenericRest).
 *
 * Exports:
 *   - InstrumentsService   — instrument/exchange lookups
 *   - WatchlistsService    — watchlist CRUD
 *   - PriceFeedService     — exchange-aware quote polling + pub/sub
 *
 * Depends on:
 *   - none (self-contained; SharedModule is global)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - DataProviderRegistry is provided here; adapters self-register in OnModuleInit
 *   - Add new data provider adapters to the providers array; no other changes needed
 *
 * Read order:
 *   1. @Module declaration — see what's registered
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeEntity } from './entities/exchange.entity';
import { InstrumentsService } from './services/instruments.service';
import { InstrumentsController } from './controllers/instruments.controller';
import { WatchlistsController } from './controllers/watchlists.controller';
import { WatchlistsService } from './services/watchlists.service';
import { PriceFeedService } from './services/price-feed.service';
import { QuotesController } from './controllers/quotes.controller';
import { InstrumentEntity } from './entities/instrument.entity';
import { WatchlistItemEntity } from './entities/watchlist-item.entity';
import { WatchlistEntity } from './entities/watchlist.entity';
import { DataProviderRegistry } from './providers/data-provider.registry';
import { GenericRestDataProviderAdapter } from './providers/generic-rest/generic-rest.adapter';
import { KiteDataProviderAdapter } from './providers/kite/kite-data-provider.adapter';
import { MarketAdminController } from './controllers/market-admin.controller';
import { AdminInstrumentsController } from './controllers/admin-instruments.controller';
import { MarketResolver } from './market.resolver';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      ExchangeEntity,
      InstrumentEntity,
      WatchlistEntity,
      WatchlistItemEntity,
    ]),
  ],
  controllers: [InstrumentsController, WatchlistsController, QuotesController, MarketAdminController, AdminInstrumentsController],
  providers: [
    InstrumentsService,
    WatchlistsService,
    PriceFeedService,
    DataProviderRegistry,
    GenericRestDataProviderAdapter,
    KiteDataProviderAdapter,
    MarketResolver,
  ],
  exports: [InstrumentsService, WatchlistsService, PriceFeedService],
})
export class MarketModule {}
