/**
 * File:        apps/backend/src/modules/developer-platform/developer-platform.resolver.ts
 * Module:      developer-platform · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over DeveloperPlatformService.
 *              Covers: API key CRUD, key status lookup, and webhook endpoint registration.
 *
 * Exports:
 *   - DeveloperPlatformResolver — GraphQL API for developer platform management
 *   - ApiKeyObjectType           — API key shape
 *   - ApiKeyStatusObjectType     — key status response
 *   - WebhookEndpointObjectType  — registered webhook shape
 *
 * Depends on:
 *   - DeveloperPlatformService — API key and webhook management
 *   - ApiKeyEntity              — entity shape
 *   - JwtAuthGuard              — auth enforcement
 *   - TenantGuard               — tenant isolation
 *   - PermissionsGuard          — permission enforcement
 *   - Permissions               — permission decorator
 *   - Tenant                    — tenant decorator
 *
 * Side-effects: DB writes on createApiKey; audit log writes on registerWebhookEndpoint
 *
 * Key invariants:
 *   - All operations require developer-platform:read or developer-platform:write permission
 *   - API key secrets are never returned through GraphQL (only masked id + status)
 *   - Webhook registration is idempotent by design
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. DeveloperPlatformResolver — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, ObjectType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DeveloperPlatformService } from './services/developer-platform.service';
import { ApiKeyEntity } from './entities/api-key.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('ApiKey')
export class ApiKeyObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field()
  keyPrefix!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('ApiKeyStatus')
export class ApiKeyStatusObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  status!: string;
}

@ObjectType('WebhookEndpoint')
export class WebhookEndpointObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  url!: string;

  @Field()
  eventTypes!: string;

  @Field()
  status!: string;
}

@ObjectType('WebhookRegistrationResult')
export class WebhookRegistrationResultObjectType {
  @Field()
  status!: string;

  @Field(() => WebhookEndpointObjectType)
  webhook!: WebhookEndpointObjectType;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DeveloperPlatformResolver {
  constructor(
    private readonly devService: DeveloperPlatformService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DeveloperPlatformResolver.name);
  }

  @Query(() => [ApiKeyObjectType], { name: 'apiKeys' })
  @Permissions('developer-platform:read')
  async listApiKeys(@Tenant() tenantId: string): Promise<ApiKeyObjectType[]> {
    const keys = await this.devService.listApiKeys(tenantId);
    return keys.map((k) => this.mapApiKey(k));
  }

  @Query(() => ApiKeyStatusObjectType, { name: 'apiKeyStatus', nullable: true })
  @Permissions('developer-platform:read')
  async getApiKeyStatus(@Args('id') id: string): Promise<ApiKeyStatusObjectType | null> {
    return this.devService.getApiKeyStatus(id);
  }

  @Mutation(() => ApiKeyObjectType)
  @Permissions('developer-platform:write')
  async createApiKey(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<ApiKeyObjectType> {
    const saved = await this.devService.createApiKey({
      tenantId,
      name,
      description: description ?? null,
    } as any);
    return this.mapApiKey(saved);
  }

  @Mutation(() => WebhookRegistrationResultObjectType)
  @Permissions('developer-platform:write')
  async registerWebhookEndpoint(
    @Tenant() tenantId: string,
    @Args('url') url: string,
    @Args('eventTypes', { type: () => [String] }) eventTypes: string[],
    @Args('secret', { nullable: true }) secret?: string,
  ): Promise<WebhookRegistrationResultObjectType> {
    const result = await this.devService.registerWebhookEndpoint({
      tenantId,
      url,
      eventTypes,
      secret: secret ?? null,
    } as any);
    return {
      status: result.status,
      webhook: result.webhook as any,
    };
  }

  // ── Mapper ──────────────────────────────────────────────────────────────

  private mapApiKey(k: ApiKeyEntity): ApiKeyObjectType {
    return {
      id: k.id,
      tenantId: k.tenantId,
      name: (k as any).name ?? '',
      keyPrefix: (k as any).keyPrefix ?? k.id.slice(0, 8),
      status: k.status,
      createdAt: (k as any).createdAt instanceof Date
        ? (k as any).createdAt.toISOString()
        : String((k as any).createdAt ?? ''),
    };
  }
}