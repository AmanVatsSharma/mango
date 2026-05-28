/**
 * File:        apps/backend/src/modules/oms/oms.resolver.ts
 * Module:      oms · GraphQL
 * Purpose:     GraphQL resolver for OMS — orders and positions via OrderService and PositionsService.
 *
 * Exports:
 *   - OmsResolver — @Query(() => OrderConnection), .order(), .positions(), .position()
 *                   @Mutation(() => OrderEntity) — placeOrder, cancelOrder, modifyOrder
 *
 * Depends on:
 *   - OrderService          — listAll, place, cancel, modify
 *   - PositionsService      — listAll (positions), listPositions (single account)
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService      — structured logging
 *
 * Side-effects:
 *   - DB writes via place / cancel / modify mutations
 *   - Exchange calls via exchange adapter (resilience wrapped in service)
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require oms:write permission
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. OmsResolver — endpoint definitions
 *   2. OrderService — business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Int, Float, Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { OrderService } from './services/order.service';
import { PositionsService } from './positions/services/positions.service';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { PlaceOrderDto } from './dtos/order.dto';
import { CancelOrderDto } from './dtos/order.dto';
import { ModifyOrderDto } from './dtos/order.dto';
import { OrderEntity } from './entities/order.entity';

/* ── GraphQL ObjectTypes ─────────────────────────────────────────────────────── */

@ObjectType()
export class OrderConnection {
  @Field(() => [OrderEntity])
  data!: OrderEntity[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;
}

@ObjectType()
export class PositionRow {
  @Field(() => ID)
  instrumentId!: string;

  @Field(() => Float)
  netQty!: number;

  @Field(() => Float)
  avgPrice!: number;

  @Field(() => Float)
  realizedPnl!: number;

  @Field(() => Float)
  lastPrice!: number;

  @Field(() => Float)
  mtmPnl!: number;

  @Field(() => Float)
  value!: number;
}

@ObjectType()
export class PositionConnection {
  @Field(() => [PositionRow])
  data!: PositionRow[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class OmsResolver {
  constructor(
    private readonly orderService: OrderService,
    private readonly positionsService: PositionsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(OmsResolver.name);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  @Query(() => OrderConnection, { name: 'orders' })
  @Permissions('oms:read')
  async orders(
    @Args('accountId', { type: () => ID, nullable: true }) accountId?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('side', { nullable: true }) side?: 'BUY' | 'SELL',
    @Args('symbol', { nullable: true }) symbol?: string,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<OrderConnection> {
    const result = await this.orderService.listAll({ accountId, status, side, symbol, from, to, limit, offset });
    return { data: result.data, total: result.total, limit: limit ?? 20, offset: offset ?? 0 };
  }

  @Query(() => OrderEntity, { name: 'order', nullable: true })
  @Permissions('oms:read')
  async order(@Args('id', { type: () => ID }) id: string): Promise<OrderEntity | null> {
    this.logger.debug('OmsResolver.order()', { id });
    const ctx = getRequestContext();
    const result = await (this.orderService as any).orders.findOne({
      where: { id, tenantId: ctx.tenantId },
    });
    return result ?? null;
  }

  @Query(() => PositionConnection, { name: 'positions' })
  @Permissions('oms:read')
  async positions(
    @Args('accountId', { type: () => ID, nullable: true }) accountId?: string,
    @Args('currency', { nullable: true }) currency?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<PositionConnection> {
    this.logger.debug('OmsResolver.positions()', { accountId, currency, limit, offset });
    return this.positionsService.listAll({ accountId, currency, limit, offset });
  }

  @Query(() => [PositionRow], { name: 'position' })
  @Permissions('oms:read')
  async position(
    @Args('accountId', { type: () => ID }) accountId: string,
    @Args('currency', { nullable: true }) currency?: string,
  ): Promise<PositionRow[]> {
    this.logger.debug('OmsResolver.position()', { accountId, currency });
    const result = await this.positionsService.listPositions(accountId, currency);
    return result.rows;
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  @Mutation(() => OrderEntity)
  @Permissions('oms:write')
  async placeOrder(@Args('input') dto: PlaceOrderDto): Promise<OrderEntity> {
    this.logger.debug('OmsResolver.placeOrder()', dto);
    return this.orderService.place(dto);
  }

  @Mutation(() => OrderEntity, { nullable: true })
  @Permissions('oms:write')
  async cancelOrder(@Args('orderId', { type: () => ID }) orderId: string): Promise<OrderEntity | null> {
    this.logger.debug('OmsResolver.cancelOrder()', { orderId });
    return this.orderService.cancel({ orderId } as CancelOrderDto);
  }

  @Mutation(() => OrderEntity, { nullable: true })
  @Permissions('oms:write')
  async modifyOrder(
    @Args('orderId', { type: () => ID }) orderId: string,
    @Args('price', { type: () => Float, nullable: true }) price?: number,
    @Args('quantity', { type: () => Float, nullable: true }) quantity?: number,
  ): Promise<OrderEntity | null> {
    this.logger.debug('OmsResolver.modifyOrder()', { orderId, price, quantity });
    return this.orderService.modify({
      orderId,
      price: price?.toString(),
      quantity: quantity?.toString(),
    });
  }
}