/**
 * File:        apps/backend/src/modules/settlement/settlement.resolver.ts
 * Module:      settlement · GraphQL
 * Purpose:     GraphQL resolver for Settlement — list settlement jobs, run EOD cycles,
 *              and mark individual jobs as settled.
 *
 * Exports:
 *   - SettlementResolver — @Query(() => [SettlementJobEntity]), .settlementBatch(), .settlementStats()
 *                          @Mutation(() => [SettlementJobEntity]) — runSettlementCycle
 *                          @Mutation(() => SettlementJobEntity) — processSettlement
 *
 * Depends on:
 *   - SettlementService — listJobs, runSettlementCycle, processJob
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService  — structured logging
 *
 * Side-effects:
 *   - DB writes — job creation (runSettlementCycle) and status transitions (processJob)
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require settlement:write permission
 *   - processSettlement is idempotent — calling on already-SETTLED job is a no-op at the service layer
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. SettlementResolver — endpoint definitions
 *   2. SettlementService  — business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args, ID as GQLID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { SettlementService } from './services/settlement.service';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { SettlementJobEntity } from './entities/settlement-job.entity';

/* ── GraphQL ObjectTypes ─────────────────────────────────────────────────────── */

@ObjectType()
export class SettlementStats {
  @Field(() => Int)
  totalJobs!: number;

  @Field(() => Int)
  pendingCount!: number;

  @Field(() => Int)
  processingCount!: number;

  @Field(() => Int)
  settledCount!: number;

  @Field(() => Int)
  failedCount!: number;

  @Field(() => Float)
  totalAmount!: number;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SettlementResolver {
  constructor(
    private readonly settlementService: SettlementService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SettlementResolver.name);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  @Query(() => [SettlementJobEntity], { name: 'settlements' })
  @Permissions('settlement:read')
  async settlements(
    @Args('status', { nullable: true }) status?: string,
  ): Promise<SettlementJobEntity[]> {
    this.logger.debug('SettlementResolver.settlements()', { status });
    const ctx = getRequestContext();
    return this.settlementService.listJobs(ctx.tenantId, status);
  }

  @Query(() => [SettlementJobEntity], { name: 'settlementBatch' })
  @Permissions('settlement:read')
  async settlementBatch(
    @Args('date') date: string,
  ): Promise<SettlementJobEntity[]> {
    this.logger.debug('SettlementResolver.settlementBatch()', { date });
    const ctx = getRequestContext();
    return this.settlementService.runSettlementCycle(ctx.tenantId, new Date(date));
  }

  @Query(() => SettlementStats, { name: 'settlementStats' })
  @Permissions('settlement:read')
  async settlementStats(): Promise<SettlementStats> {
    this.logger.debug('SettlementResolver.settlementStats()');
    const ctx = getRequestContext();
    const jobs = await this.settlementService.listJobs(ctx.tenantId);

    let totalAmount = 0;
    let pendingCount = 0;
    let processingCount = 0;
    let settledCount = 0;
    let failedCount = 0;

    for (const job of jobs) {
      totalAmount += parseFloat(job.amount);
      switch (job.status) {
        case 'PENDING':     pendingCount++;     break;
        case 'PROCESSING': processingCount++; break;
        case 'SETTLED':    settledCount++;    break;
        case 'FAILED':     failedCount++;     break;
      }
    }

    return {
      totalJobs: jobs.length,
      pendingCount,
      processingCount,
      settledCount,
      failedCount,
      totalAmount,
    };
  }

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  @Mutation(() => SettlementJobEntity)
  @Permissions('settlement:write')
  async processSettlement(
    @Args('id', { type: () => GQLID }) id: string,
  ): Promise<SettlementJobEntity> {
    this.logger.debug('SettlementResolver.processSettlement()', { id });
    return this.settlementService.processJob(id);
  }
}