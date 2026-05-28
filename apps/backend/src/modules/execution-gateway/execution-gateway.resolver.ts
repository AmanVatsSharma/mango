/**
 * File:        apps/backend/src/modules/execution-gateway/execution-gateway.resolver.ts
 * Module:      execution-gateway · GraphQL
 * Purpose:     GraphQL queries and mutations for exchange/broker connector operations —
 *              connector health, order routing, and order cancellation across all connector families.
 *
 * Exports:
 *   - ExecutionGatewayResolver — @Query(() => [ConnectorStatusDto]), @Query(() => ConnectorStatusDto, { nullable: true })
 *                              — @Mutation(() => OrderResponseDto), @Mutation(() => OrderResponseDto)
 *
 * Depends on:
 *   - ExecutionGatewayService — routePlaceOrder, routeCancelOrder, listConnectorStatus
 *   - ConnectorFamily          — from execution-gateway.contract
 *   - JwtAuthGuard, TenantGuard, PermissionsGuard
 *
 * Side-effects:  outbound HTTP calls to exchange/broker per order routing mutation
 *
 * Key invariants:
 *   - TenantGuard scopes all queries to the authenticated tenant
 *   - routeOrder requires PermissionsGuard with 'orders:admin'; cancelOrder requires 'orders:write'
 *   - routePlaceOrder / routeCancelOrder delegate to ExecutionGatewayService which applies
 *     the connector family routing and calls the appropriate broker/exchange via resilience wrappers
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ExecutionGatewayService } from './services/execution-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { ConnectorFamily } from './connectors/contracts/execution-gateway.contract';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum ConnectorFamilyEnum {
  FX_CFD = 'FX_CFD',
  EQUITIES_FNO = 'EQUITIES_FNO',
  US_EQUITIES_OPTIONS = 'US_EQUITIES_OPTIONS',
  CRYPTO_CEX = 'CRYPTO_CEX',
  COMMODITIES = 'COMMODITIES',
}

registerEnumType(ConnectorFamilyEnum, { name: 'ConnectorFamily' });

// ─── DTOs ────────────────────────────────────────────────────────────────────

@ObjectType()
export class ConnectorStatusDto {
  @Field(() => ConnectorFamilyEnum)
  family!: ConnectorFamily;

  @Field()
  active!: boolean;

  @Field()
  session!: string;
}

@ObjectType()
export class OrderResponseDto {
  @Field()
  providerOrderId!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  message!: string | null;

  @Field({ nullable: true })
  filledQty!: string | null;

  @Field({ nullable: true })
  price!: string | null;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

@Resolver()
export class ExecutionGatewayResolver {
  constructor(
    private readonly gatewayService: ExecutionGatewayService,
    private readonly logger: AppLoggerService,
  ) {}

  @Query(() => [ConnectorStatusDto])
  @UseGuards(JwtAuthGuard, TenantGuard)
  async connectors(): Promise<ConnectorStatusDto[]> {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId ?? '';
    this.logger.debug('connectors:start', { requestId: ctx?.requestId, tenantId });
    const rows = await this.gatewayService.listConnectorStatus(tenantId);
    return rows.map((r) => ({ family: r.family as unknown as ConnectorFamilyEnum, active: r.active, session: r.session }));
  }

  @Query(() => ConnectorStatusDto, { nullable: true })
  @UseGuards(JwtAuthGuard, TenantGuard)
  async connectorStatus(
    @Args('family', { type: () => ConnectorFamilyEnum }) family: ConnectorFamilyEnum,
  ): Promise<ConnectorStatusDto | null> {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId ?? '';
    this.logger.debug('connectorStatus:start', { requestId: ctx?.requestId, family });
    const rows = await this.gatewayService.listConnectorStatus(tenantId);
    const found = rows.find((r) => r.family === (family as unknown as ConnectorFamily));
    if (!found) return null;
    return { family, active: found.active, session: found.session };
  }

  @Mutation(() => OrderResponseDto)
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('orders:admin')
  async routeOrder(
    @Args('tenantId') tenantId: string,
    @Args('accountId') accountId: string,
    @Args('instrumentId') instrumentId: string,
    @Args('side', { type: () => ConnectorFamilyEnum }) side: 'BUY' | 'SELL',
    @Args('type', { type: () => ConnectorFamilyEnum }) type: 'MARKET' | 'LIMIT',
    @Args('quantity') quantity: string,
    @Args('clientOrderId') clientOrderId: string,
    @Args('timeInForce', { type: () => ConnectorFamilyEnum }) timeInForce: string,
    @Args('connectorFamily', { type: () => ConnectorFamilyEnum }) connectorFamily: ConnectorFamilyEnum,
    @Args('price', { nullable: true }) price?: string,
  ): Promise<OrderResponseDto> {
    const ctx = getRequestContext();
    this.logger.debug('routeOrder:start', { requestId: ctx?.requestId, clientOrderId, connectorFamily });
    const response = await this.gatewayService.routePlaceOrder({
      tenantId,
      accountId,
      instrumentId,
      side,
      type,
      quantity,
      clientOrderId,
      timeInForce: timeInForce as any,
      connectorFamily: connectorFamily as unknown as ConnectorFamily,
      price,
    });
    return {
      providerOrderId: response.providerOrderId ?? clientOrderId,
      status: response.status,
      message: response.message ?? null,
      filledQty: response.filledQty?.toString() ?? null,
      price: response.price?.toString() ?? null,
    };
  }

  @Mutation(() => OrderResponseDto)
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('orders:write')
  async cancelOrder(
    @Args('providerOrderId') providerOrderId: string,
    @Args('connectorFamily', { type: () => ConnectorFamilyEnum }) connectorFamily: ConnectorFamilyEnum,
  ): Promise<OrderResponseDto> {
    const ctx = getRequestContext();
    this.logger.debug('cancelOrder:start', { requestId: ctx?.requestId, providerOrderId, connectorFamily });
    const response = await this.gatewayService.routeCancelOrder({
      providerOrderId,
      connectorFamily: connectorFamily as unknown as ConnectorFamily,
    });
    return {
      providerOrderId: response.providerOrderId ?? providerOrderId,
      status: response.status,
      message: response.message ?? null,
      filledQty: response.filledQty?.toString() ?? null,
      price: response.price?.toString() ?? null,
    };
  }
}