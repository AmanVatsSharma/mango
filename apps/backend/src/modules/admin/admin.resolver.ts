/**
 * File:        apps/backend/src/modules/admin/admin.resolver.ts
 * Module:      admin · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over AdminDashboardService.
 *              Provides dashboard KPI and audit-log access patterns for admin/ops clients.
 *
 * Exports:
 *   - AdminResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - AdminDashboardService  — getStats, getRevenueStats, getSystemStatus,
 *                              listOrderAudits, listAllAudits
 *   - @obsidian/backend-auth — JwtAuthGuard (applied via UseGuards)
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService       — structured request logging
 *
 * Side-effects:
 *   - DB reads (KPI counts, audit queries, revenue aggregation) via service delegation
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require accounts:write permission
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. AdminResolver — endpoint definitions
 *   2. AdminDashboardService — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AppLoggerService } from '../../shared/logger';

/* ── GraphQL ObjectTypes ─────────────────────────────────────────────────────── */

@ObjectType()
export class StatsPayload {
  @Field(() => Int)
  users!: number;

  @Field(() => Int)
  accounts!: number;

  @Field(() => Int)
  orders!: number;

  @Field(() => String, { nullable: true })
  sampleAudits?: string;
}

@ObjectType()
export class RevenueBucket {
  @Field(() => String)
  label!: string;

  @Field(() => Float)
  spread!: number;

  @Field(() => Float)
  commission!: number;

  @Field(() => Float)
  swap!: number;

  @Field(() => Float)
  total!: number;
}

@ObjectType()
export class ServiceStatus {
  @Field(() => String)
  service!: string;

  @Field(() => String)
  status!: string;

  @Field(() => Int)
  latency!: number;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminResolver {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminResolver.name);
  }

  @Query(() => StatsPayload, { name: 'adminStats' })
  @Permissions('oms:admin')
  async getStats(
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ): Promise<StatsPayload> {
    this.logger.debug('AdminResolver.getStats()', { from, to });
    return this.dashboardService.getStats(from, to) as unknown as Promise<StatsPayload>;
  }

  @Query(() => [RevenueBucket], { name: 'adminRevenue' })
  @Permissions('oms:admin')
  async getRevenueStats(
    @Args('period', { nullable: true }) period?: 'daily' | 'weekly' | 'mtd',
  ): Promise<RevenueBucket[]> {
    this.logger.debug('AdminResolver.getRevenueStats()', { period });
    return this.dashboardService.getRevenueStats(period ?? 'mtd') as Promise<RevenueBucket[]>;
  }

  @Query(() => [ServiceStatus], { name: 'adminSystemStatus' })
  @Permissions('oms:admin')
  async getSystemStatus(): Promise<ServiceStatus[]> {
    this.logger.debug('AdminResolver.getSystemStatus()');
    return this.dashboardService.getSystemStatus() as unknown as Promise<ServiceStatus[]>;
  }

  @Query(() => [Object], { name: 'adminOrderAudits' })
  @Permissions('oms:admin')
  async listOrderAudits(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<Record<string, unknown>[]> {
    this.logger.debug('AdminResolver.listOrderAudits()', { limit });
    return this.dashboardService.listOrderAudits(limit ?? 50) as unknown as Record<string, unknown>[];
  }

  @Query(() => Object, { name: 'adminAudits' })
  @Permissions('oms:admin')
  async listAllAudits(
    @Args('actor', { nullable: true }) actor?: string,
    @Args('module', { nullable: true }) module?: string,
    @Args('action', { nullable: true }) action?: string,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<{ data: unknown[]; total: number; limit: number; offset: number }> {
    this.logger.debug('AdminResolver.listAllAudits()', { actor, module, action, from, to, limit, offset });
    return this.dashboardService.listAllAudits({
      actor,
      module,
      action,
      from,
      to,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }) as Promise<{ data: unknown[]; total: number; limit: number; offset: number }>;
  }
}