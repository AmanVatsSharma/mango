/**
 * File:        apps/backend/src/modules/dealing/dealing.resolver.ts
 * Module:      dealing · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over DealingService.
 *              Covers: deal capture, listing, status, and manual override requests.
 *
 * Exports:
 *   - DealingResolver        — GraphQL API for dealer desk operations
 *   - DealObjectType         — GraphQL object type
 *   - DealStatusObjectType   — deal status response
 *   - DealOverrideResultObjectType — override audit response
 *
 * Depends on:
 *   - DealingService  — deal CRUD and override logic
 *   - JwtAuthGuard    — auth enforcement
 *   - TenantGuard     — tenant isolation
 *   - PermissionsGuard — permission enforcement
 *   - Permissions     — permission decorator
 *   - Tenant          — tenant decorator
 *
 * Side-effects: DB writes on createDeal; audit log writes on requestManualOverride
 *
 * Key invariants:
 *   - All operations require dealing:read or dealing:write permission
 *   - tenantId sourced from @Tenant() decorator
 *   - requestManualOverride records an audit envelope but does not execute the override
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. DealingResolver         — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DealingService } from './services/dealing.service';
import { DealEntity } from './entities/deal.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('Deal')
export class DealObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  instrumentId!: string;

  @Field()
  side!: string;

  @Field(() => Float)
  quantity!: number;

  @Field(() => Float)
  price!: number;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  metadata!: string | null;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;
}

@ObjectType('DealStatus')
export class DealStatusObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;
}

@ObjectType('DealOverrideResult')
export class DealOverrideResultObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;

  @Field(() => String)
  audit!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DealingResolver {
  constructor(
    private readonly dealingService: DealingService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DealingResolver.name);
  }

  @Query(() => [DealObjectType], { name: 'deals' })
  @Permissions('dealing:read')
  async listDeals(@Tenant() tenantId: string): Promise<DealObjectType[]> {
    const deals = await this.dealingService.listDeals(tenantId);
    return deals.map((d) => this.mapDeal(d));
  }

  @Query(() => DealStatusObjectType, { name: 'dealStatus', nullable: true })
  @Permissions('dealing:read')
  async getDealStatus(@Args('id') id: string): Promise<DealStatusObjectType | null> {
    return this.dealingService.getDealStatus(id);
  }

  @Mutation(() => DealObjectType)
  @Permissions('dealing:write')
  async createDeal(
    @Tenant() tenantId: string,
    @Args('instrumentId') instrumentId: string,
    @Args('side') side: string,
    @Args('quantity', { type: () => Float }) quantity: number,
    @Args('price', { type: () => Float }) price: number,
    @Args('metadata', { type: () => String, nullable: true }) metadataArg?: string,
  ): Promise<DealObjectType> {
    const saved = await this.dealingService.createDeal({
      tenantId,
      instrumentId,
      side,
      quantity: String(quantity),
      price: String(price),
      metadata: metadataArg ? (JSON.parse(metadataArg) as Record<string, unknown>) : {},
    } as any);
    return this.mapDeal(saved);
  }

  @Mutation(() => DealOverrideResultObjectType)
  @Permissions('dealing:write')
  async requestManualOverride(
    @Args('dealId') dealId: string,
    @Args('action') action: string,
    @Args('reason') reason: string,
  ): Promise<DealOverrideResultObjectType> {
    const result = await this.dealingService.requestManualOverride(dealId, { action, reason } as any);
    return {
      id: result.id,
      status: result.status,
      audit: typeof result.audit === 'object' ? JSON.stringify(result.audit) : String(result.audit),
    };
  }

  // ── Mapper ───────────────────────────────────────────────────────────────

  private mapDeal(d: DealEntity): DealObjectType {
    return {
      id: d.id,
      tenantId: d.tenantId,
      instrumentId: d.instrumentId,
      side: d.side,
      quantity: Number(d.quantity),
      price: Number(d.price),
      status: d.status,
      metadata: typeof d.metadata === 'object' ? JSON.stringify(d.metadata) : d.metadata ?? null,
      createdAt: d.createdAt?.toISOString() ?? '',
      updatedAt: d.updatedAt?.toISOString() ?? '',
    };
  }
}