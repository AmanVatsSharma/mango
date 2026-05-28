/**
 * File:        apps/backend/src/modules/corporate-actions/corporate-actions.resolver.ts
 * Module:      corporate-actions · GraphQL
 * Purpose:     GraphQL resolver for Corporate Actions — list announced events and
 *              announce new ones (admin-only).
 *
 * Exports:
 *   - CorporateActionsResolver — @Query(() => [CorporateActionEntity]), .corporateAction()
 *                                  @Mutation(() => CorporateActionEntity) — announceCorporateAction
 *   - CorporateActionInput     — GraphQL input type for announceCorporateAction mutation
 *
 * Depends on:
 *   - CorporateActionsService — listActions, createAction
 *   - @obsidian/backend-auth  — JwtAuthGuard
 *   - @obsidian/backend-rbac  — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService        — structured logging
 *
 * Side-effects:
 *   - DB writes for new corporate action announcements
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Announce mutation requires corporate-actions:write permission
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. CorporateActionsResolver — endpoint definitions
 *   2. CorporateActionsService  — business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-20
 */

import { Resolver, Query, Mutation, Args, ID as GQLID, InputType, Field } from '@nestjs/graphql';
import { ObjectType, Field as GQLField } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { CorporateActionsService } from './services/corporate-actions.service';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { CreateCorporateActionDto } from './dtos/create-corporate-action.dto';
import { CorporateActionEntity } from './entities/corporate-action.entity';

/* ── GraphQL Input/Output Types ───────────────────────────────────────────────── */

@InputType()
export class CorporateActionInput {
  @Field(() => String)
  actionType!: string;

  @Field(() => String)
  instrumentId!: string;

  @Field(() => String)
  effectiveDate!: string;

  @Field(() => String, { nullable: true })
  payload?: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class CorporateActionsResolver {
  constructor(
    private readonly corporateActionsService: CorporateActionsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(CorporateActionsResolver.name);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  @Query(() => [CorporateActionEntity], { name: 'corporateActions' })
  @Permissions('corporate-actions:read')
  async corporateActions(): Promise<CorporateActionEntity[]> {
    this.logger.debug('CorporateActionsResolver.corporateActions()');
    const ctx = getRequestContext();
    return this.corporateActionsService.listActions(ctx.tenantId);
  }

  @Query(() => CorporateActionEntity, { name: 'corporateAction', nullable: true })
  @Permissions('corporate-actions:read')
  async corporateAction(
    @Args('id', { type: () => GQLID }) id: string,
  ): Promise<CorporateActionEntity | null> {
    this.logger.debug('CorporateActionsResolver.corporateAction()', { id });
    const ctx = getRequestContext();
    const actions = await this.corporateActionsService.listActions(ctx.tenantId);
    return actions.find((a) => a.id === id) ?? null;
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  @Mutation(() => CorporateActionEntity)
  @Permissions('corporate-actions:write')
  async announceCorporateAction(
    @Args('input', { type: () => CorporateActionInput }) input: CorporateActionInput,
  ): Promise<CorporateActionEntity> {
    this.logger.debug('CorporateActionsResolver.announceCorporateAction()', input);
    const dto = new CreateCorporateActionDto();
    const ctx = getRequestContext();
    dto.tenantId = ctx.tenantId;
    dto.actionType = input.actionType as 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'MERGER' | 'DELISTING';
    dto.instrumentId = input.instrumentId;
    dto.effectiveDate = input.effectiveDate;
    dto.payload = input.payload ? (JSON.parse(input.payload) as Record<string, unknown>) : {};
    return this.corporateActionsService.createAction(dto);
  }
}