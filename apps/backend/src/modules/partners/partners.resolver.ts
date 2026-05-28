/**
 * File:        apps/backend/src/modules/partners/partners.resolver.ts
 * Module:      partners · GraphQL
 * Purpose:     GraphQL resolver for Partners — list partners, invite new ones, and manage payout approvals.
 *
 * Exports:
 *   - PartnersResolver — @Query(() => [PartnerEntity]), .partnerStats()
 *                        @Mutation(() => PartnerEntity), .updatePartner()
 *
 * Depends on:
 *   - PartnersService     — listPartners, createPartner, approvePayout, getPartnerStatus
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService    — structured logging
 *
 * Side-effects:
 *   - DB writes for create / payout-approval mutations
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require partners:write permission
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. PartnersResolver — endpoint definitions
 *   2. PartnersService — business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args, ID as GQLID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { PartnersService } from './services/partners.service';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { CreatePartnerDto } from './dtos/create-partner.dto';
import { PartnerPayoutApprovalDto } from './dtos/partner-payout-approval.dto';
import { PartnerEntity } from './entities/partner.entity';

/* ── GraphQL ObjectTypes ─────────────────────────────────────────────────────── */

@ObjectType()
export class PartnerStatusPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;
}

@ObjectType()
export class PartnerPayoutResult {
  @Field()
  partnerId!: string;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  audit!: string | null;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PartnersResolver {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PartnersResolver.name);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  @Query(() => [PartnerEntity], { name: 'partners' })
  @Permissions('partners:read')
  async partners(): Promise<PartnerEntity[]> {
    this.logger.debug('PartnersResolver.partners()');
    const ctx = getRequestContext();
    return this.partnersService.listPartners(ctx.tenantId);
  }

  @Query(() => PartnerStatusPayload, { name: 'partnerStats', nullable: true })
  @Permissions('partners:read')
  async partnerStats(
    @Args('id', { type: () => GQLID }) id: string,
  ): Promise<PartnerStatusPayload | null> {
    this.logger.debug('PartnersResolver.partnerStats()', { id });
    return this.partnersService.getPartnerStatus(id);
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  @Mutation(() => PartnerEntity)
  @Permissions('partners:write')
  async invitePartner(@Args('input') dto: CreatePartnerDto): Promise<PartnerEntity> {
    this.logger.debug('PartnersResolver.invitePartner()', dto);
    return this.partnersService.createPartner(dto);
  }

  @Mutation(() => PartnerPayoutResult)
  @Permissions('partners:write')
  async updatePartner(
    @Args('partnerId', { type: () => GQLID }) partnerId: string,
    @Args('amount', { type: () => Number }) amount: number,
    @Args('currency') currency: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<PartnerPayoutResult> {
    this.logger.debug('PartnersResolver.updatePartner()', { partnerId, amount, currency });
    const result = await this.partnersService.approvePayout(
      partnerId,
      { amount: String(amount), currency, reason } as PartnerPayoutApprovalDto,
    );
    return {
      partnerId: result.partnerId,
      status: result.status,
      audit: typeof result.audit === 'object' ? JSON.stringify(result.audit) : String(result.audit ?? null),
    };
  }
}