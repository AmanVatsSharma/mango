/**
 * File:        apps/backend/src/modules/market/market.resolver.ts
 * Module:      market · GraphQL
 * Purpose:     GraphQL queries and mutations for market data — instruments, watchlists,
 *              and live quote snapshots served through the exchange-aware price feed.
 *
 * Exports:
 *   - MarketResolver — @Query(() => [InstrumentDto]), @Query(() => InstrumentDto, { nullable: true })
 *                   — @Query(() => [WatchlistDto]), @Query(() => QuoteDto, { nullable: true })
 *                   — @Mutation(() => InstrumentDto), @Mutation(() => WatchlistDto), @Mutation(() => WatchlistItemDto)
 *
 * Depends on:
 *   - InstrumentsService  — listInstruments, updateInstrument, getBySymbol, listByIds
 *   - WatchlistsService    — create, list, addItem, listItems
 *   - PriceFeedService     — getSnapshot
 *   - AppLoggerService     — structured logging
 *   - getRequestContext    — tenant/user resolution
 *
 * Side-effects:  read-only queries; instrument mutations are DB writes
 *
 * Key invariants:
 *   - TenantGuard scopes all queries to the authenticated tenant automatically
 *   - Admin mutations (upsertInstrument) require PermissionsGuard with 'instruments:admin'
 *   - Quote snapshot returns the latest cached quote from the 1 Hz polling loop
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InstrumentsService } from './services/instruments.service';
import { WatchlistsService } from './services/watchlists.service';
import { PriceFeedService, Quote } from './services/price-feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { InstrumentEntity } from './entities/instrument.entity';
import { WatchlistEntity } from './entities/watchlist.entity';
import { WatchlistItemEntity } from './entities/watchlist-item.entity';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

@ObjectType()
export class InstrumentDto {
  @Field(() => ID)
  id!: string;

  @Field()
  exchangeCode!: string;

  @Field()
  symbol!: string;

  @Field()
  displayName!: string;

  @Field()
  type!: string;

  @Field({ nullable: true })
  status!: string | null;
}

@ObjectType()
export class WatchlistDto {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class WatchlistItemDto {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  instrumentId!: string;

  @Field()
  addedAt!: Date;
}

@ObjectType()
export class QuoteDto {
  @Field()
  symbol!: string;

  @Field()
  exchange!: string;

  @Field(() => Float)
  price!: number;

  @Field()
  ts!: string;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

@Resolver()
export class MarketResolver {
  constructor(
    private readonly instrumentsService: InstrumentsService,
    private readonly watchlistsService: WatchlistsService,
    private readonly priceFeedService: PriceFeedService,
    private readonly logger: AppLoggerService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  @Query(() => [InstrumentDto])
  @UseGuards(JwtAuthGuard, TenantGuard)
  async instruments(
    @Args('exchangeCode', { nullable: true }) exchangeCode?: string,
    @Args('type', { nullable: true }) type?: string,
    @Args('q', { nullable: true }) q?: string,
  ): Promise<InstrumentDto[]> {
    const ctx = getRequestContext();
    this.logger.debug('instruments:start', { requestId: ctx?.requestId, exchangeCode, type, q });
    const entities = await this.instrumentsService.listInstruments({ exchangeCode, type, q });
    return entities.map(this._instrumentDto);
  }

  @Query(() => InstrumentDto, { nullable: true })
  @UseGuards(JwtAuthGuard, TenantGuard)
  async instrument(@Args('id') id: string): Promise<InstrumentDto | null> {
    const ctx = getRequestContext();
    this.logger.debug('instrument:start', { requestId: ctx?.requestId, id });
    const entities = await this.instrumentsService.listByIds([id]);
    if (!entities.length) return null;
    return this._instrumentDto(entities[0]);
  }

  @Query(() => [WatchlistDto])
  @UseGuards(JwtAuthGuard, TenantGuard)
  async watchlists(): Promise<WatchlistDto[]> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId || !ctx?.userId) return [];
    this.logger.debug('watchlists:start', { requestId: ctx?.requestId });
    const entities = await this.watchlistsService.list(ctx.tenantId, ctx.userId);
    return entities.map((wl) => ({ id: wl.id, name: wl.name, createdAt: wl.createdAt }));
  }

  @Query(() => QuoteDto, { nullable: true })
  @UseGuards(JwtAuthGuard, TenantGuard)
  async quote(
    @Args('exchange') exchange: string,
    @Args('symbol') symbol: string,
  ): Promise<QuoteDto | null> {
    const ctx = getRequestContext();
    this.logger.debug('quote:start', { requestId: ctx?.requestId, exchange, symbol });
    const [found] = this.priceFeedService.getSnapshot([{ exchange, symbol }]);
    if (!found) return null;
    return { symbol: found.symbol, exchange: found.exchange, price: found.price, ts: new Date(found.ts).toISOString() };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  @Mutation(() => InstrumentDto)
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('instruments:admin')
  async upsertInstrument(
    @Args('id') id: string,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<InstrumentDto> {
    const ctx = getRequestContext();
    this.logger.debug('upsertInstrument:start', { requestId: ctx?.requestId, id, status });
    const entity = await this.instrumentsService.updateInstrument(id, { status });
    return this._instrumentDto(entity);
  }

  @Mutation(() => WatchlistDto)
  @UseGuards(JwtAuthGuard, TenantGuard)
  async createWatchlist(@Args('name') name: string): Promise<WatchlistDto> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId || !ctx?.userId) throw new Error('Unauthenticated');
    this.logger.debug('createWatchlist:start', { requestId: ctx?.requestId, name });
    const entity = await this.watchlistsService.create(ctx.tenantId, ctx.userId, name);
    return { id: entity.id, name: entity.name, createdAt: entity.createdAt };
  }

  @Mutation(() => WatchlistItemDto)
  @UseGuards(JwtAuthGuard, TenantGuard)
  async addToWatchlist(
    @Args('watchlistId') watchlistId: string,
    @Args('instrumentId') instrumentId: string,
  ): Promise<WatchlistItemDto> {
    const ctx = getRequestContext();
    this.logger.debug('addToWatchlist:start', { requestId: ctx?.requestId, watchlistId, instrumentId });
    const item = await this.watchlistsService.addItem(watchlistId, instrumentId);
    return { id: item.id, instrumentId: item.instrumentId, addedAt: item.createdAt };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _instrumentDto(e: InstrumentEntity): InstrumentDto {
    return {
      id: e.id,
      exchangeCode: e.exchangeCode,
      symbol: e.symbol,
      displayName: e.displayName ?? e.symbol,
      type: e.type,
      status: (e as any).status ?? null,
    };
  }
}