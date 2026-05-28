/**
 * File:        apps/backend/src/modules/tenancy/tenancy.resolver.ts
 * Module:      tenancy · GraphQL Resolver
 * Purpose:     GraphQL API for tenant lifecycle, brand config, and legal entities.
 *
 * Exports:
 *   - TenancyResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - TenancyService — createTenant, listTenants, upsertBrandConfig, listLegalEntities
 *   - JwtAuthGuard   — auth enforcement
 *   - TenantGuard     — tenant isolation
 *   - PermissionsGuard — permission enforcement
 *
 * Side-effects:
 *   - DB writes on createTenant, upsertBrandConfig
 *
 * Key invariants:
 *   - Tenant codes are unique (enforced at service layer with AppError)
 *   - Brand config resolves by tenant.code (slug) first, then customDomain
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { TenancyService } from './services/tenancy.service';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { AppLoggerService } from '../../shared/logger';

@ObjectType('Tenant')
export class TenantObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  displayName!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('TenantBrandConfig')
export class TenantBrandConfigObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field({ nullable: true })
  logoUrl?: string;

  @Field({ nullable: true })
  primaryColor?: string;

  @Field({ nullable: true })
  customDomain?: string;

  @Field()
  updatedAt!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class TenancyResolver {
  constructor(
    private readonly svc: TenancyService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(TenancyResolver.name);
  }

  @Query(() => [TenantObjectType], { name: 'tenants' })
  @Permissions('tenancy:read')
  async listTenants(): Promise<TenantObjectType[]> {
    this.logger.debug('TenancyResolver.listTenants()');
    const tenants = await this.svc.listTenants();
    return tenants.map((t) => ({
      id: t.id,
      code: t.code,
      displayName: t.displayName,
      status: t.status,
      createdAt: t.createdAt?.toISOString() ?? '',
    }));
  }

  @Query(() => TenantBrandConfigObjectType, { nullable: true, name: 'brandConfig' })
  async brandConfig(@Args('slugOrDomain') slugOrDomain: string): Promise<TenantBrandConfigObjectType | null> {
    this.logger.debug('TenancyResolver.brandConfig()', { slugOrDomain });
    const config = await this.svc.getBrandConfig(slugOrDomain);
    if (!config) return null;
    return {
      id: config.id,
      tenantId: config.tenantId,
      logoUrl: (config as any).logoUrl ?? null,
      primaryColor: (config as any).primaryColor ?? null,
      customDomain: (config as any).customDomain ?? null,
      updatedAt: config.updatedAt?.toISOString() ?? '',
    };
  }

  @Mutation(() => TenantObjectType)
  @Permissions('tenancy:write')
  async createTenant(
    @Args('code') code: string,
    @Args('displayName') displayName: string,
  ): Promise<TenantObjectType> {
    this.logger.debug('TenancyResolver.createTenant()', { code, displayName });
    const t = await this.svc.createTenant({ code, displayName });
    return {
      id: t.id,
      code: t.code,
      displayName: t.displayName,
      status: t.status,
      createdAt: t.createdAt?.toISOString() ?? '',
    };
  }
}
