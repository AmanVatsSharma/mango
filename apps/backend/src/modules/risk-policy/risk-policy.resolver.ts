/**
 * File:        apps/backend/src/modules/risk-policy/risk-policy.resolver.ts
 * Module:      risk-policy
 * Purpose:     GraphQL resolver for risk policy admin queries and mutations.
 *              Covers: policy CRUD, exposure listing, dashboard aggregation, and alert dismissal.
 *
 * Exports:
 *   - RiskPolicyResolver          — GraphQL admin API for risk policy management
 *   - RiskPolicyObjectType        — GraphQL object type
 *   - TenantRiskPolicyObjectType  — GraphQL object type
 *   - DashboardExposureObjectType — instrument-level exposure shape
 *   - DashboardResultObjectType   — aggregated dashboard with totals
 *   - AlertObjectType             — surveillance alert shape
 *   - AlertsResultObjectType      — paginated alert result
 *
 * Depends on:
 *   - RiskPolicyService       — policy CRUD, exposure
 *   - RiskDashboardService    — dashboard, alerts, dismiss
 *   - JwtAuthGuard            — auth enforcement
 *   - TenantGuard             — tenant isolation
 *   - PermissionsGuard        — permission enforcement
 *
 * Side-effects: DB writes on upsertPolicy and dismissAlert mutations
 *
 * Key invariants:
 *   - All operations require oms:admin permission; tenant-scoped via @Tenant()
 *   - Alerts are soft-dismissed (status = DISMISSED) — never hard-deleted
 *   - Dashboard exposure queries use LIMIT 200 to avoid unbounded result sets
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. RiskPolicyResolver     — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, Int, ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { RiskPolicyService } from './services/risk-policy.service';
import { RiskDashboardService } from './services/risk-dashboard.service';
import { CreateRiskPolicyDto } from './dtos/create-risk-policy.dto';
import { AssignRiskPolicyDto } from './dtos/create-risk-policy.dto';
import { RiskPolicyEntity } from './entities/risk-policy.entity';
import { TenantRiskPolicyEntity } from './entities/tenant-risk-policy.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';

/** Mirrors RiskPolicyEntity for GraphQL schema */
@ObjectType('RiskPolicy')
export class RiskPolicyObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  jurisdictionCode!: string;

  @Field(() => String)
  policyName!: string;

  @Field(() => String)
  maxLeverage!: string;

  @Field(() => String)
  maxOrderNotional!: string;

  @Field(() => [String])
  restrictedProducts!: string[];

  @Field(() => String)
  sanctionsCheckRequired!: string;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

/** Mirrors TenantRiskPolicyEntity */
@ObjectType('TenantRiskPolicy')
export class TenantRiskPolicyObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  riskPolicyId!: string;

  @Field(() => String)
  scopeType!: string;

  @Field(() => String)
  scopeValue!: string;

  @Field(() => String)
  createdAt!: string;
}

@ObjectType('DashboardExposure')
export class DashboardExposureObjectType {
  @Field(() => String)
  instrumentId!: string;

  @Field(() => Float)
  netQty!: number;

  @Field(() => Float)
  grossNotional!: number;

  @Field(() => Float)
  netNotional!: number;
}

@ObjectType('DashboardResult')
export class DashboardResultObjectType {
  @Field(() => [DashboardExposureObjectType])
  instruments!: DashboardExposureObjectType[];

  @Field(() => Float)
  totalNetNotional!: number;

  @Field(() => Float)
  totalGrossNotional!: number;
}

@ObjectType('SurveillanceAlert')
export class AlertObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  instrumentId!: string;

  @Field(() => String)
  severity!: string;

  @Field(() => String)
  status!: string;

  @Field(() => String, { nullable: true })
  message?: string;

  @Field(() => String, { nullable: true })
  dismissedReason?: string;

  @Field(() => String)
  createdAt!: string;
}

@ObjectType('AlertsResult')
export class AlertsResultObjectType {
  @Field(() => [AlertObjectType])
  data!: AlertObjectType[];

  @Field(() => Int)
  total!: number;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class RiskPolicyResolver {
  constructor(
    private readonly riskPolicyService: RiskPolicyService,
    private readonly dashboardService: RiskDashboardService,
  ) {}

  // --- Queries ---

  @Query(() => [RiskPolicyObjectType], { name: 'riskPolicies' })
  @Permissions('risk-policy:read')
  async riskPolicies(@Tenant() tenantId: string): Promise<RiskPolicyObjectType[]> {
    const policies = await this.riskPolicyService.listPolicies(tenantId);
    return policies.map((p) => this.mapPolicy(p));
  }

  @Query(() => DashboardResultObjectType, { name: 'riskDashboard' })
  @Permissions('risk-policy:read')
  async riskDashboard(@Tenant() tenantId: string): Promise<DashboardResultObjectType> {
    return this.dashboardService.getDashboard(tenantId);
  }

  @Query(() => AlertsResultObjectType, { name: 'riskAlerts' })
  @Permissions('risk-policy:read')
  async riskAlerts(
    @Tenant() tenantId: string,
    @Args('severity', { nullable: true }) severity?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<AlertsResultObjectType> {
    const result = await this.dashboardService.getAlerts(tenantId, { severity, limit, offset });
    return {
      data: result.data.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        instrumentId: (a as any).instrumentId ?? '',
        severity: a.severity,
        status: a.status,
        message: (a as any).message ?? null,
        dismissedReason: (a as any).dismissedReason ?? null,
        createdAt: a.createdAt?.toISOString() ?? '',
      })),
      total: result.total,
    };
  }

  // --- Mutations ---

  @Mutation(() => RiskPolicyObjectType)
  @Permissions('risk-policy:write')
  async createRiskPolicy(@Args('input', { type: () => CreateRiskPolicyDto }) dto: CreateRiskPolicyDto): Promise<RiskPolicyObjectType> {
    const policy = await this.riskPolicyService.createPolicy(dto);
    return this.mapPolicy(policy);
  }

  @Mutation(() => TenantRiskPolicyObjectType)
  @Permissions('risk-policy:write')
  async assignRiskPolicy(@Args('input', { type: () => AssignRiskPolicyDto }) dto: AssignRiskPolicyDto): Promise<TenantRiskPolicyObjectType> {
    const assignment = await this.riskPolicyService.assignPolicy(dto);
    return {
      id: assignment.id,
      tenantId: assignment.tenantId,
      riskPolicyId: assignment.riskPolicyId,
      scopeType: assignment.scopeType,
      scopeValue: assignment.scopeValue,
      createdAt: assignment.createdAt?.toISOString() ?? '',
    };
  }

  @Mutation(() => AlertObjectType)
  @Permissions('risk-policy:write')
  async dismissRiskAlert(
    @Args('id') id: string,
    @Tenant() tenantId: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<AlertObjectType> {
    const alert = await this.dashboardService.dismissAlert(id, tenantId, reason);
    return {
      id: alert.id,
      tenantId: alert.tenantId,
      instrumentId: (alert as any).instrumentId ?? '',
      severity: alert.severity,
      status: alert.status,
      message: (alert as any).message ?? null,
      dismissedReason: (alert as any).dismissedReason ?? null,
      createdAt: alert.createdAt?.toISOString() ?? '',
    };
  }

  // --- Mappers ---

  private mapPolicy(p: RiskPolicyEntity): RiskPolicyObjectType {
    return {
      id: p.id,
      tenantId: p.tenantId,
      jurisdictionCode: p.jurisdictionCode,
      policyName: p.policyName,
      maxLeverage: String(p.maxLeverage),
      maxOrderNotional: String(p.maxOrderNotional),
      restrictedProducts: p.restrictedProducts ?? [],
      sanctionsCheckRequired: String(p.sanctionsCheckRequired),
      createdAt: p.createdAt?.toISOString() ?? '',
      updatedAt: p.updatedAt?.toISOString() ?? '',
    };
  }
}