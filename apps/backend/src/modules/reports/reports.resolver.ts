/**
 * File:        apps/backend/src/modules/reports/reports.resolver.ts
 * Module:      reports · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over ReportsService.
 *              Covers: report definition CRUD and report execution.
 *
 * Exports:
 *   - ReportsResolver           — GraphQL API for report management
 *   - ReportDefinitionObjectType — GraphQL object type
 *   - ReportExecutionResultObjectType — execution result
 *
 * Depends on:
 *   - ReportsService     — report CRUD and execution
 *   - JwtAuthGuard       — auth enforcement
 *   - TenantGuard        — tenant isolation
 *   - PermissionsGuard   — permission enforcement
 *   - Permissions        — permission decorator
 *   - Tenant             — tenant decorator
 *
 * Side-effects: DB writes on createReport; execution metadata update on executeReport
 *
 * Key invariants:
 *   - All operations require reports:read or reports:write permission
 *   - executeReport is idempotent — only updates lastRunAt timestamp
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. ReportsResolver         — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, Int, ObjectType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { ReportDefinitionEntity } from './entities/report-definition.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('ReportDefinition')
export class ReportDefinitionObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field()
  type!: string;

  @Field(() => [String])
  columns!: string[];

  @Field(() => String, { nullable: true })
  filters!: string | null;

  @Field()
  createdBy!: string;

  @Field({ nullable: true })
  lastRunAt!: string | null;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;
}

@ObjectType('ReportExecutionResult')
export class ReportExecutionResultObjectType {
  @Field(() => ID)
  reportId!: string;

  @Field()
  executedAt!: string;

  @Field(() => Int)
  rowCount!: number;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ReportsResolver {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ReportsResolver.name);
  }

  @Query(() => [ReportDefinitionObjectType], { name: 'reports' })
  @Permissions('reports:read')
  async listReports(@Tenant() tenantId: string): Promise<ReportDefinitionObjectType[]> {
    const reports = await this.reportsService.listReports(tenantId);
    return reports.map((r) => this.mapReport(r));
  }

  @Query(() => ReportDefinitionObjectType, { name: 'report', nullable: true })
  @Permissions('reports:read')
  async getReport(@Args('id') id: string): Promise<ReportDefinitionObjectType | null> {
    const result = await this.reportsService.executeReport(id);
    // Re-fetch the definition to return the full object
    const reports = await this.reportsService.listReports('');
    const found = reports.find((r) => r.id === id);
    return found ? this.mapReport(found) : null;
  }

  @Mutation(() => ReportDefinitionObjectType)
  @Permissions('reports:write')
  async createReport(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('type') type: string,
    @Args('createdBy') createdBy: string,
    @Args('columns', { type: () => [String] }) columns: string[],
    @Args('filters', { type: () => String, nullable: true }) filtersArg?: string,
  ): Promise<ReportDefinitionObjectType> {
    const saved = await this.reportsService.createReport({
      tenantId,
      name,
      type,
      columns,
      filters: filtersArg ? (JSON.parse(filtersArg) as Record<string, unknown>) : {},
      createdBy,
    } as any);
    return this.mapReport(saved);
  }

  @Mutation(() => ReportExecutionResultObjectType)
  @Permissions('reports:write')
  async executeReport(@Args('id') id: string): Promise<ReportExecutionResultObjectType> {
    const result = await this.reportsService.executeReport(id);
    return {
      reportId: id,
      executedAt: new Date().toISOString(),
      rowCount: result.data?.length ?? 0,
    };
  }

  // ── Mapper ───────────────────────────────────────────────────────────────

  private mapReport(r: ReportDefinitionEntity): ReportDefinitionObjectType {
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      type: r.type,
      columns: r.columns ?? [],
      filters: typeof r.filters === 'object' ? JSON.stringify(r.filters) : String(r.filters ?? null),
      createdBy: r.createdBy,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? '',
      updatedAt: r.updatedAt?.toISOString() ?? '',
    };
  }
}