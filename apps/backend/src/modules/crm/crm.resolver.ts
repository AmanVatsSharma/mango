/**
 * File:        apps/backend/src/modules/crm/crm.resolver.ts
 * Module:      crm · GraphQL Resolver
 * Purpose:     GraphQL API for CRM outreach, churn risk scoring, and retention offers.
 *
 * Exports:
 *   - CrmResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - CrmService — listClients, sendOutreach, getChurnRiskScores, createRetentionOffer
 *   - JwtAuthGuard — auth enforcement
 *   - TenantGuard — tenant isolation
 *   - PermissionsGuard — permission enforcement
 *
 * Side-effects:
 *   - DB writes on sendOutreach, createRetentionOffer
 *
 * Key invariants:
 *   - Outreach is idempotent by (tenantId, userId, type) — duplicates skip
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CrmService } from './services/crm.service';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../shared/logger';

@ObjectType('CrmOutreach')
export class CrmOutreachObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field()
  type!: string;

  @Field({ nullable: true })
  message?: string;

  @Field()
  status!: string;

  @Field()
  sentAt!: string;
}

@ObjectType('ChurnRiskScore')
export class ChurnRiskScoreObjectType {
  @Field()
  userId!: string;

  @Field(() => Float)
  riskScore!: number;
}

@ObjectType('RetentionOffer')
export class RetentionOfferObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field()
  offerType!: string;

  @Field()
  value!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class CrmResolver {
  constructor(
    private readonly svc: CrmService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(CrmResolver.name);
  }

  @Query(() => [CrmOutreachObjectType], { name: 'crmOutreachList' })
  @Permissions('crm:read')
  async outreachList(@Tenant() tenantId: string): Promise<CrmOutreachObjectType[]> {
    this.logger.debug('CrmResolver.outreachList()', { tenantId });
    const clients = await this.svc.listClients(tenantId);
    return clients.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      userId: c.userId,
      type: c.type,
      message: c.message ?? null,
      status: c.status,
      sentAt: (c as any).sentAt ?? c.createdAt?.toISOString() ?? '',
    }));
  }

  @Query(() => [ChurnRiskScoreObjectType], { name: 'churnRiskScores' })
  @Permissions('crm:read')
  async churnRiskScores(@Tenant() tenantId: string): Promise<ChurnRiskScoreObjectType[]> {
    this.logger.debug('CrmResolver.churnRiskScores()', { tenantId });
    return this.svc.getChurnRiskScores(tenantId);
  }

  @Mutation(() => CrmOutreachObjectType)
  @Permissions('crm:write')
  async sendOutreach(
    @Tenant() tenantId: string,
    @Args('userId') userId: string,
    @Args('type') type: string,
    @Args('message', { nullable: true }) message?: string,
  ): Promise<CrmOutreachObjectType> {
    this.logger.debug('CrmResolver.sendOutreach()', { tenantId, userId, type });
    const o = await this.svc.sendOutreach({ tenantId, userId, type, message });
    return {
      id: o.id,
      tenantId: o.tenantId,
      userId: o.userId,
      type: o.type,
      message: o.message ?? null,
      status: o.status,
      sentAt: (o as any).sentAt ?? o.createdAt?.toISOString() ?? '',
    };
  }

  @Mutation(() => RetentionOfferObjectType)
  @Permissions('crm:write')
  async createRetentionOffer(
    @Tenant() tenantId: string,
    @Args('userId') userId: string,
    @Args('offerType') offerType: string,
    @Args('value', { nullable: true }) value?: string,
  ): Promise<RetentionOfferObjectType> {
    this.logger.debug('CrmResolver.createRetentionOffer()', { tenantId, userId, offerType });
    const o = await this.svc.createRetentionOffer({ tenantId, userId, offerType, value: value !== undefined ? Number(value) : undefined });
    return {
      id: o.id,
      tenantId: o.tenantId,
      userId: o.userId,
      offerType: o.offerType,
      value: o.value,
      status: o.status,
      createdAt: o.createdAt?.toISOString() ?? '',
    };
  }
}
