/**
 * File:        apps/backend/src/modules/saas-control-plane/saas-control-plane.resolver.ts
 * Module:      saas-control-plane · GraphQL Resolver
 * Purpose:     GraphQL admin API for platform-owner governance — tenant provisioning,
 *              suspension, billing, entitlements, and audit trails.
 *
 * Exports:
 *   - SaasControlPlaneResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - SaasControlPlaneService — provisionTenant, suspendTenant, impersonate,
 *                              upsertEntitlements, listProvisioning, listEntitlements
 *   - JwtAuthGuard          — auth enforcement
 *   - TenantGuard            — tenant isolation
 *   - PermissionsGuard       — permission enforcement
 *
 * Side-effects:
 *   - DB writes on provisionTenant, suspendTenant, upsertEntitlements
 *   - AWS SES email on successful tenant provision
 *   - Bulk token revocation on tenant suspension
 *
 * Key invariants:
 *   - provisionTenant is idempotent (duplicates are noop)
 *   - Impersonation tokens expire in 15 min — audit record persists only
 *   - suspendTenant does NOT delete data — only status + token revocation
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SaasControlPlaneService } from './services/saas-control-plane.service';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../shared/logger';

@ObjectType('EntitlementPlan')
export class EntitlementPlanObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  planName!: string;

  @Field()
  maxUsers!: string;

  @Field()
  maxAccounts!: string;

  @Field({ nullable: true })
  features?: string;

  @Field()
  createdAt!: string;
}

@ObjectType('ProvisioningRequest')
export class ProvisioningRequestObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field()
  createdAt!: string;
}

@ObjectType('ImpersonationResult')
export class ImpersonationResultObjectType {
  @Field()
  token!: string;

  @Field()
  auditId!: string;

  @Field()
  expiresAt!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SaasControlPlaneResolver {
  constructor(
    private readonly svc: SaasControlPlaneService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SaasControlPlaneResolver.name);
  }

  @Query(() => [EntitlementPlanObjectType], { name: 'entitlementPlans' })
  @Permissions('saas:read')
  async listEntitlements(): Promise<EntitlementPlanObjectType[]> {
    this.logger.debug('SaasControlPlaneResolver.listEntitlements()');
    const plans = await (this.svc as any).listEntitlements();
    return plans.map((p) => ({
      id: p.id,
      planName: (p).planName ?? (p).name ?? '',
      maxUsers: (p).maxUsers ?? '0',
      maxAccounts: (p).maxAccounts ?? '0',
      features: (p).features ? JSON.stringify((p).features) : null,
      createdAt: p.createdAt?.toISOString() ?? '',
    }));
  }

  @Query(() => [ProvisioningRequestObjectType], { name: 'provisioningRequests' })
  @Permissions('saas:read')
  async listProvisioning(): Promise<ProvisioningRequestObjectType[]> {
    this.logger.debug('SaasControlPlaneResolver.listProvisioning()');
    const reqs = await (this.svc as any).listProvisioning();
    return reqs.map((r) => ({
      id: r.id,
      tenantId: (r).tenantId ?? '',
      status: r.status,
      errorMessage: (r).errorMessage ?? null,
      createdAt: r.createdAt?.toISOString() ?? '',
    }));
  }

  @Mutation(() => ProvisioningRequestObjectType)
  @Permissions('saas:write')
  async provisionTenant(
    @Args('code') code: string,
    @Args('displayName') displayName: string,
    @Args('planName') planName: string,
  ): Promise<ProvisioningRequestObjectType> {
    this.logger.debug('SaasControlPlaneResolver.provisionTenant()', { code, displayName, planName });
    const r = await this.svc.provisionTenant({ tenantId: '', requestedBy: '' });
    return {
      id: r.id,
      tenantId: (r as any).tenantId ?? '',
      status: r.status,
      errorMessage: (r as any).errorMessage ?? null,
      createdAt: r.createdAt?.toISOString() ?? '',
    };
  }

  @Mutation(() => String)
  @Permissions('saas:write')
  async suspendTenant(
    @Args('tenantId') tenantId: string,
    @Args('reason') reason: string,
  ): Promise<string> {
    this.logger.debug('SaasControlPlaneResolver.suspendTenant()', { tenantId, reason });
    await this.svc.suspendTenant(tenantId, reason);
    return 'SUSPENDED';
  }

  @Mutation(() => EntitlementPlanObjectType)
  @Permissions('saas:write')
  async upsertEntitlements(
    @Args('planName') planName: string,
    @Args('maxUsers') maxUsers: string,
    @Args('maxAccounts') maxAccounts: string,
    @Args('features', { nullable: true }) features?: string,
  ): Promise<EntitlementPlanObjectType> {
    this.logger.debug('SaasControlPlaneResolver.upsertEntitlements()', { planName, maxUsers, maxAccounts });
    const dto = {
      planName,
      maxUsers: parseInt(maxUsers, 10),
      maxAccounts: parseInt(maxAccounts, 10),
      features: features ? JSON.parse(features) : {},
    };
    const p = await this.svc.upsertEntitlements(dto as any);
    return {
      id: p.id,
      planName: (p as any).planName ?? planName,
      maxUsers,
      maxAccounts,
      features: features ?? null,
      createdAt: p.createdAt?.toISOString() ?? '',
    };
  }
}