/**
 * File:        apps/backend/src/modules/promotions/promotions.resolver.ts
 * Module:      promotions · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over PromotionsService.
 *              Covers: promotion campaign CRUD and announcement activation.
 *
 * Exports:
 *   - PromotionsResolver       — GraphQL API for promotion management
 *   - PromotionObjectType      — promotion campaign shape
 *
 * Depends on:
 *   - PromotionsService  — promotion CRUD and activation
 *   - PromotionEntity     — entity shape
 *   - JwtAuthGuard        — auth enforcement
 *   - TenantGuard         — tenant isolation
 *   - PermissionsGuard    — permission enforcement
 *   - Permissions         — permission decorator
 *   - Tenant              — tenant decorator
 *
 * Side-effects: DB writes on createPromotion, updatePromotion; status change on announcePromotion
 *
 * Key invariants:
 *   - All operations require promotions:read or promotions:write permission
 *   - tenantId sourced from @Tenant() decorator
 *   - endDate must be >= startDate (validated in service)
 *
 * Read order:
 *   1. PromotionObjectType — data shape
 *   2. PromotionsResolver   — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PromotionsService } from './services/promotions.service';
import { PromotionEntity } from './entities/promotion.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('Promotion')
export class PromotionObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field()
  type!: string;

  @Field()
  startDate!: string;

  @Field()
  endDate!: string;

  @Field(() => Float)
  budget!: number;

  @Field(() => Float)
  spent!: number;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;

  @Field({ nullable: true })
  updatedAt?: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PromotionsResolver {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PromotionsResolver.name);
  }

  @Query(() => [PromotionObjectType], { name: 'promotions' })
  @Permissions('promotions:read')
  async listPromotions(@Tenant() tenantId: string): Promise<PromotionObjectType[]> {
    const promotions = await this.promotionsService.listPromotions(tenantId);
    return promotions.map((p) => this.mapPromotion(p));
  }

  @Mutation(() => PromotionObjectType)
  @Permissions('promotions:write')
  async createPromotion(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('type') type: string,
    @Args('startDate') startDate: string,
    @Args('endDate') endDate: string,
    @Args('budget', { type: () => Float }) budget: number,
  ): Promise<PromotionObjectType> {
    const saved = await this.promotionsService.createPromotion({
      tenantId,
      name,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      budget,
    } as any);
    return this.mapPromotion(saved);
  }

  @Mutation(() => PromotionObjectType)
  @Permissions('promotions:write')
  async updatePromotion(
    @Args('id') id: string,
    @Args('name', { nullable: true }) name?: string,
    @Args('type', { nullable: true }) type?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
    @Args('budget', { type: () => Float, nullable: true }) budget?: number,
  ): Promise<PromotionObjectType> {
    const updated = await this.promotionsService.updatePromotion(id, {
      name,
      type,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      budget: budget !== undefined ? String(budget) : undefined,
    } as any);
    return this.mapPromotion(updated);
  }

  @Mutation(() => Boolean)
  async announcePromotion(@Args('id') id: string): Promise<boolean> {
    return (await this.promotionsService.announcePromotion(id)).announced;
  }

  // ── Mapper ───────────────────────────────────────────────────────────────

  private mapPromotion(p: PromotionEntity): PromotionObjectType {
    return {
      id: p.id,
      tenantId: p.tenantId,
      name: p.name,
      type: p.type,
      startDate: String(p.startDate),
      endDate: String(p.endDate),
      budget: Number(p.budget),
      spent: Number(p.spent),
      status: p.status,
      createdAt: String(p.createdAt ?? ''),
    };
  }
}