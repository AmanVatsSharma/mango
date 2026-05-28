/**
 * File:        apps/backend/src/modules/realtime/prana-stream/realtime.resolver.ts
 * Module:      realtime/prana-stream · GraphQL Resolver
 * Purpose:     GraphQL Query surface over RealtimeAggregatorService and RealtimePublisherService.
 *              Provides read-only access to realtime snapshots (watchlist, orders, positions, accounts)
 *              for the GraphQL API consumers that need snapshots rather than live WebSocket feeds.
 *
 * Exports:
 *   - RealtimeResolver                  — GraphQL API for realtime snapshot data
 *   - WatchlistTickObjectType           — latest price tick for a symbol
 *   - OrderSnapshotObjectType           — recent order summary
 *   - PositionSnapshotObjectType        — net position per instrument
 *   - AccountBalanceSnapshotObjectType   — cash + hold snapshot per account
 *   - RealtimeSnapshotsResultObjectType — aggregated snapshot result
 *
 * Depends on:
 *   - RealtimeAggregatorService   — getSnapshots, recomputeMarketSubscriptions
 *   - RealtimePublisherService    — publishOrderUpdate, publishPositionUpdate, publishAccountUpdate
 *   - SubscriptionRegistryService — apply/remove subscriptions
 *   - JwtAuthGuard                — auth enforcement
 *   - TenantGuard                 — tenant isolation
 *   - PermissionsGuard            — permission enforcement
 *
 * Side-effects: None (read-only queries; domain fan-in write methods are NOT exposed via GraphQL)
 *
 * Key invariants:
 *   - Snapshot queries require realtime:read permission
 *   - tenantId sourced from @Tenant() decorator (never from client)
 *   - getSnapshots returns data scoped to the authenticated user's accounts only
 *
 * Read order:
 *   1. ObjectType definitions   — data shapes
 *   2. RealtimeResolver         — query definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, ObjectType, Field, Float, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { RealtimeAggregatorService } from './services/realtime-aggregator.service';
import { SubscriptionRegistryService, SubscriptionPayload } from './services/subscription-registry.service';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { getRequestContext } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('WatchlistTick')
export class WatchlistTickObjectType {
  @Field()
  exchange!: string;

  @Field()
  symbol!: string;

  @Field(() => Float)
  price!: number;

  @Field(() => Float, { nullable: true })
  bid!: number | null;

  @Field(() => Float, { nullable: true })
  ask!: number | null;

  @Field()
  ts!: string;
}

@ObjectType('OrderSnapshot')
export class OrderSnapshotObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  accountId!: string;

  @Field()
  instrumentId!: string;

  @Field()
  side!: string;

  @Field()
  type!: string;

  @Field(() => Float)
  quantity!: number;

  @Field(() => Float, { nullable: true })
  price!: number | null;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('PositionSnapshot')
export class PositionSnapshotObjectType {
  @Field()
  accountId!: string;

  @Field()
  instrumentId!: string;

  @Field(() => Float)
  netQty!: number;
}

@ObjectType('AccountBalanceSnapshot')
export class AccountBalanceSnapshotObjectType {
  @Field()
  accountId!: string;

  @Field(() => Float)
  totalCash!: number;

  @Field(() => Float)
  lockedCash!: number;

  @Field(() => Float)
  availableCash!: number;
}

@ObjectType('RealtimeSnapshotsResult')
export class RealtimeSnapshotsResultObjectType {
  @Field(() => [WatchlistTickObjectType], { nullable: true })
  watchlist!: WatchlistTickObjectType[] | null;

  @Field(() => [OrderSnapshotObjectType], { nullable: true })
  orders!: OrderSnapshotObjectType[] | null;

  @Field(() => [PositionSnapshotObjectType], { nullable: true })
  positions!: PositionSnapshotObjectType[] | null;

  @Field(() => [AccountBalanceSnapshotObjectType], { nullable: true })
  accounts!: AccountBalanceSnapshotObjectType[] | null;
}

@ObjectType('WatchedSymbol')
export class WatchedSymbolObjectType {
  @Field()
  exchange!: string;

  @Field()
  symbol!: string;
}

@ObjectType('SubscriptionRegistry')
export class SubscriptionRegistryObjectType {
  @Field(() => [WatchedSymbolObjectType])
  watchedSymbols!: WatchedSymbolObjectType[];
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class RealtimeResolver {
  constructor(
    private readonly aggregator: RealtimeAggregatorService,
    private readonly subs: SubscriptionRegistryService,
  ) {}

  /**
   * Returns aggregated realtime snapshots for the authenticated user.
   * watchlist — latest ticks for subscribed symbols
   * orders   — 20 most recent orders across all user accounts
   * positions — net position per instrument across all user accounts
   * accounts — cash + hold summary per account
   */
  @Query(() => RealtimeSnapshotsResultObjectType, { name: 'realtimeSnapshots' })
  @Permissions('realtime:read')
  async getSnapshots(
    @Tenant() tenantId: string,
  ): Promise<RealtimeSnapshotsResultObjectType> {
    const ctx = getRequestContext();
    const userId = ctx?.userId ?? '';

    const payload: SubscriptionPayload = {
      watchlist: [],
      orders: true,
      positions: true,
      accounts: true,
    };

    const result = await this.aggregator.getSnapshots(userId, tenantId, payload);

    return {
      watchlist: (result.watchlist ?? []).map((t: any) => ({
        exchange: t.exchange,
        symbol: t.symbol,
        price: t.price,
        bid: t.bid ?? null,
        ask: t.ask ?? null,
        ts: t.ts ?? new Date().toISOString(),
      })),
      orders: (result.orders ?? []).map((o: any) => ({
        id: o.id,
        accountId: o.accountId,
        instrumentId: o.instrumentId,
        side: o.side,
        type: o.type,
        quantity: Number(o.quantity),
        price: o.price != null ? Number(o.price) : null,
        status: o.status,
        createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt ?? ''),
      })),
      positions: (result.positions ?? []).map((p: any) => ({
        accountId: p.accountId,
        instrumentId: p.instrumentId,
        netQty: Number(p.netQty),
      })),
      accounts: (result.accounts ?? []).map((a: any) => ({
        accountId: a.accountId,
        totalCash: Number(a.totalCash),
        lockedCash: Number(a.lockedCash),
        availableCash: Number(a.availableCash),
      })),
    };
  }

  /**
   * Returns all symbols currently being watched across the platform.
   * Useful for tooling / monitoring dashboards.
   */
  @Query(() => SubscriptionRegistryObjectType, { name: 'realtimeWatchedSymbols' })
  @Permissions('realtime:read')
  async watchedSymbols(): Promise<SubscriptionRegistryObjectType> {
    const symbols = this.subs.getAllWatchedSymbols();
    return {
      watchedSymbols: symbols.map((s) => ({ exchange: s.exchange, symbol: s.symbol })),
    };
  }
}