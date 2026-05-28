/**
 * File:        apps/backend/src/modules/lp-routing/lp-routing.resolver.ts
 * Module:      lp-routing · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over LpRoutingService.
 *              Covers: LP provider CRUD and quote testing.
 *
 * Exports:
 *   - LpRoutingResolver        — GraphQL API for LP routing management
 *   - LpProviderObjectType      — LP provider shape
 *   - LpQuoteTestResultObjectType — quote test result
 *
 * Depends on:
 *   - LpRoutingService  — LP provider management
 *   - LpProviderEntity   — provider entity shape
 *   - JwtAuthGuard       — auth enforcement
 *   - TenantGuard        — tenant isolation
 *   - PermissionsGuard   — permission enforcement
 *   - Permissions        — permission decorator
 *   - Tenant             — tenant decorator
 *
 * Side-effects: DB writes on createProvider and updateProvider
 *
 * Key invariants:
 *   - All operations require lp-routing:read or lp-routing:write permission
 *   - tenantId sourced from @Tenant() decorator
 *   - testQuote is a diagnostic operation — does not persist state
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. LpRoutingResolver       — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, Int, ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { LpRoutingService } from './services/lp-routing.service';
import { LpProviderEntity } from './entities/lp-provider.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('LpProvider')
export class LpProviderObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field()
  lpType!: string;

  @Field()
  endpoint!: string;

  @Field(() => Int)
  priority!: number;

  @Field()
  status!: string;

  @Field({ nullable: true })
  apiKey!: string | null;

  @Field()
  createdAt!: string;

  @Field({ nullable: true })
  updatedAt!: string | null;
}

@ObjectType('LpQuoteTestResult')
export class LpQuoteTestResultObjectType {
  @Field()
  provider!: string;

  @Field(() => Float)
  quote!: number;

  @Field(() => Int)
  validFor!: number;

  @Field()
  testedAt!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class LpRoutingResolver {
  constructor(
    private readonly lpRoutingService: LpRoutingService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(LpRoutingResolver.name);
  }

  @Query(() => [LpProviderObjectType], { name: 'lpProviders' })
  @Permissions('lp-routing:read')
  async listProviders(@Tenant() tenantId: string): Promise<LpProviderObjectType[]> {
    const providers = await this.lpRoutingService.listProviders(tenantId);
    return providers.map((p) => this.mapProvider(p));
  }

  @Mutation(() => LpProviderObjectType)
  @Permissions('lp-routing:write')
  async createLpProvider(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('lpType') lpType: string,
    @Args('endpoint') endpoint: string,
    @Args('priority', { type: () => Int }) priority: number,
    @Args('apiKey', { nullable: true }) apiKey?: string,
  ): Promise<LpProviderObjectType> {
    const saved = await this.lpRoutingService.createProvider({
      tenantId,
      name,
      lpType,
      endpoint,
      priority,
      apiKey: apiKey ?? null,
    } as any);
    return this.mapProvider(saved);
  }

  @Mutation(() => LpProviderObjectType)
  @Permissions('lp-routing:write')
  async updateLpProvider(
    @Args('id') id: string,
    @Tenant() tenantId: string,
    @Args('name', { nullable: true }) name?: string,
    @Args('lpType', { nullable: true }) lpType?: string,
    @Args('endpoint', { nullable: true }) endpoint?: string,
    @Args('priority', { type: () => Int, nullable: true }) priority?: number,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<LpProviderObjectType> {
    const updated = await this.lpRoutingService.updateProvider(id, {
      name,
      lpType,
      endpoint,
      priority: priority !== undefined ? String(priority) : undefined,
      status,
    } as any);
    return this.mapProvider(updated);
  }

  @Mutation(() => LpQuoteTestResultObjectType)
  @Permissions('lp-routing:write')
  async testLpQuote(
    @Args('lpProviderId') lpProviderId: string,
    @Args('symbol') symbol: string,
    @Args('side') side: string,
  ): Promise<LpQuoteTestResultObjectType> {
    const result = await this.lpRoutingService.testQuote({
      lpProviderId,
      symbol,
      side,
    } as any);
    return {
      provider: result.provider,
      quote: result.quote,
      validFor: result.validFor,
      testedAt: new Date().toISOString(),
    };
  }

  // ── Mapper ───────────────────────────────────────────────────────────────

  private mapProvider(p: LpProviderEntity): LpProviderObjectType {
    return {
      id: p.id,
      tenantId: p.tenantId,
      name: (p as any).name ?? '',
      lpType: (p as any).lpType ?? '',
      endpoint: (p as any).endpoint ?? '',
      priority: Number((p as any).priority ?? 0),
      status: (p as any).status ?? null,
      apiKey: (p as any).apiKey ?? null,
      createdAt: (p as any).createdAt instanceof Date
        ? (p as any).createdAt.toISOString()
        : String((p as any).createdAt ?? ''),
      updatedAt: (p as any).updatedAt instanceof Date
        ? (p as any).updatedAt.toISOString()
        : null,
    };
  }
}