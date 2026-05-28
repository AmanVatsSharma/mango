/**
 * File:        apps/backend/src/modules/compliance/compliance.resolver.ts
 * Module:      compliance
 * Purpose:     GraphQL resolver for compliance policy admin queries and mutations.
 *              Activated by adding ComplianceResolver to the GraphQL schema in app.module.ts.
 *
 * Exports:
 *   - ComplianceResolver  — GraphQL admin API for compliance policies
 *
 * Depends on:
 *   - ComplianceService   — upsertPolicy, listPolicies
 *   - JwtAuthGuard        — auth enforcement
 *   - TenantGuard         — tenant isolation
 *   - PermissionsGuard    — permission enforcement
 *
 * Side-effects: DB writes on upsertCompliancePolicy
 *
 * Key invariants:
 *   - All operations require oms:admin permission; tenant-scoped via @Tenant() decorator
 *   - Jurisdiction codes are validated against the adapter registry in ComplianceService
 *
 * Read order:
 *   1. CompliancePolicyObjectType  — GraphQL object shape
 *   2. ComplianceResolver           — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { ComplianceService } from './services/compliance.service';
import { UpsertCompliancePolicyDto } from './dtos/upsert-compliance-policy.dto';
import { CompliancePolicyEntity } from './entities/compliance-policy.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';

/** GraphQL object type mirroring CompliancePolicyEntity */
@ObjectType('CompliancePolicy')
export class CompliancePolicyObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  jurisdictionCode!: string;

  @Field(() => String)
  kycTier!: string;

  @Field(() => String)
  amlRiskLevel!: string;

  @Field(() => String)
  sanctionsProvider!: string;

  @Field(() => String, { nullable: true })
  suitabilityRules?: string;

  @Field(() => Int)
  auditRetentionDays!: number;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

@Resolver(() => CompliancePolicyObjectType)
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ComplianceResolver {
  constructor(private readonly complianceService: ComplianceService) {}

  @Query(() => [CompliancePolicyObjectType], { name: 'compliancePolicies' })
  @Permissions('compliance:read')
  async compliancePolicies(
    @Tenant() tenantId: string,
  ): Promise<CompliancePolicyObjectType[]> {
    const policies = await this.complianceService.listPolicies(tenantId);
    return policies.map((p) => this.mapToObjectType(p));
  }

  @Mutation(() => CompliancePolicyObjectType)
  @Permissions('compliance:write')
  async upsertCompliancePolicy(
    @Args('tenantId') tenantId: string,
    @Args('jurisdictionCode') jurisdictionCode: string,
    @Args('kycTier') kycTier: string,
    @Args('amlRiskLevel') amlRiskLevel: string,
    @Args('sanctionsProvider') sanctionsProvider: string,
    @Args('auditRetentionDays', { type: () => Int }) auditRetentionDays: number,
    @Args('suitabilityRules', { nullable: true }) suitabilityRules?: string,
  ): Promise<CompliancePolicyObjectType> {
    const dto: UpsertCompliancePolicyDto = {
      tenantId,
      jurisdictionCode,
      kycTier: kycTier as any,
      amlRiskLevel: amlRiskLevel as any,
      sanctionsProvider,
      suitabilityRules: suitabilityRules ? JSON.parse(suitabilityRules) : {},
      auditRetentionDays,
    };
    const policy = await this.complianceService.upsertPolicy(dto);
    return this.mapToObjectType(policy);
  }

  private mapToObjectType(entity: CompliancePolicyEntity): CompliancePolicyObjectType {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      jurisdictionCode: entity.jurisdictionCode,
      kycTier: entity.kycTier,
      amlRiskLevel: entity.amlRiskLevel,
      sanctionsProvider: entity.sanctionsProvider,
      suitabilityRules: JSON.stringify(entity.suitabilityRules ?? {}),
      auditRetentionDays: entity.auditRetentionDays,
      createdAt: entity.createdAt?.toISOString() ?? '',
      updatedAt: entity.updatedAt?.toISOString() ?? '',
    };
  }
}