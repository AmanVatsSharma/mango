/**
 * File:        apps/backend/src/modules/reconciliation/reconciliation.resolver.ts
 * Module:      reconciliation · GraphQL Resolver
 * Purpose:     GraphQL admin API for LP/MT5 reconciliation — break management, statement import.
 *
 * Exports:
 *   - ReconciliationResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - ReconciliationService — importStatement, runReconciliation, resolveBreak,
 *                             listBreaks, flagAgingBreaks
 *   - JwtAuthGuard        — auth enforcement
 *   - TenantGuard         — tenant isolation
 *   - PermissionsGuard    — permission enforcement
 *
 * Side-effects:
 *   - DB writes on resolveBreak, flagAgingBreaks
 *   - Outbox publish on break creation
 *
 * Key invariants:
 *   - runReconciliation only creates NEW breaks; never closes old ones
 *   - flagAgingBreaks is EOD-only; marks OPEN breaks older than 1 day as aging
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationBreakEntity } from './entities/reconciliation-break.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../shared/logger';

@ObjectType('ReconciliationBreak')
export class ReconciliationBreakObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  symbol!: string;

  @Field()
  breakType!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  message?: string;

  @Field(() => Float)
  quantityDiff!: number;

  @Field(() => Float)
  priceDiff!: number;

  @Field()
  isAging!: boolean;

  @Field()
  createdAt!: string;
}

@ObjectType('ReconciliationResult')
export class ReconciliationResultObjectType {
  @Field(() => Int)
  breaksFound!: number;

  @Field(() => Int)
  tradesMatched!: number;

  @Field()
  ranAt!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ReconciliationResolver {
  constructor(
    private readonly svc: ReconciliationService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ReconciliationResolver.name);
  }

  @Query(() => [ReconciliationBreakEntity], { name: 'reconciliationBreaks' })
  @Permissions('reconciliation:read')
  async listBreaks(
    @Tenant() tenantId: string,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<ReconciliationBreakEntity[]> {
    this.logger.debug('ReconciliationResolver.listBreaks()', { tenantId, status });
    return this.svc.listBreaks(tenantId, { status: status as any });
  }

  @Mutation(() => ReconciliationResultObjectType)
  @Permissions('reconciliation:write')
  async runReconciliation(
    @Tenant() tenantId: string,
    @Args('statementDate') statementDate: string,
  ): Promise<ReconciliationResultObjectType> {
    this.logger.debug('ReconciliationResolver.runReconciliation()', { tenantId, statementDate });
    const breaks = await this.svc.runReconciliation({ tenantId, statementDate });
    return {
      breaksFound: breaks.length,
      tradesMatched: 0,
      ranAt: new Date().toISOString(),
    };
  }

  @Mutation(() => ReconciliationBreakEntity)
  @Permissions('reconciliation:write')
  async resolveReconciliationBreak(
    @Tenant() tenantId: string,
    @Args('id') id: string,
  ): Promise<ReconciliationBreakEntity> {
    this.logger.debug('ReconciliationResolver.resolveBreak()', { tenantId, id });
    return this.svc.resolveBreak(id, tenantId);
  }
}
