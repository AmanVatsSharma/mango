/**
 * File:        apps/backend/src/modules/limits-and-controls/limits-and-controls.resolver.ts
 * Module:      limits-and-controls
 * Purpose:     GraphQL resolver for exposure limit and limit-control admin operations.
 *              Covers: exposure limit CRUD, control CRUD, and exception queue management.
 *
 * Exports:
 *   - LimitsAndControlsResolver          — GraphQL admin API for limits and controls
 *   - ExposureLimitObjectType           — GraphQL object type for exposure limits
 *   - LimitControlObjectType             — GraphQL object type for limit controls
 *   - LimitExceptionObjectType           — GraphQL object type for limit exceptions
 *
 * Depends on:
 *   - LimitsAndControlsService  — controls CRUD, exceptions CRUD, pre-trade enforcement
 *   - AdminLimitsService        — exposure limit CRUD and pre-trade check
 *   - JwtAuthGuard              — auth enforcement
 *   - TenantGuard               — tenant isolation
 *   - PermissionsGuard          — permission enforcement
 *
 * Side-effects: DB writes on all mutations
 *
 * Key invariants:
 *   - All operations require oms:admin permission; tenant-scoped via @Tenant()
 *   - Pre-trade enforcement (checkExposureLimit) is fail-open — no limit configured = allowed
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. LimitsAndControlsResolver — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, Int, ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { LimitsAndControlsService } from './services/limits-and-controls.service';
import { AdminLimitsService } from './services/admin-limits.service';
import { CreateExposureLimitDto, UpdateExposureLimitDto } from './dtos/exposure-limit.dto';
import { CreateLimitControlDto, CreateLimitExceptionDto } from './dtos/create-limit-control.dto';
import { ExposureLimitEntity } from './entities/exposure-limit.entity';
import { LimitControlEntity } from './entities/limit-control.entity';
import { LimitExceptionEntity } from './entities/limit-exception.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';

/** Mirrors ExposureLimitEntity */
@ObjectType('ExposureLimit')
export class ExposureLimitObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  instrumentId!: string;

  @Field(() => String)
  maxNetExposure!: string;

  @Field(() => String)
  currentNetExposure!: string;

  @Field(() => String)
  alertThreshold!: string;

  @Field(() => String)
  hardLimit!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

/** Mirrors LimitControlEntity */
@ObjectType('LimitControl')
export class LimitControlObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  controlType!: string;

  @Field(() => String)
  scopeType!: string;

  @Field(() => String)
  scopeValue!: string;

  @Field(() => String)
  threshold!: string;

  @Field(() => Boolean)
  enabled!: boolean;

  @Field(() => String)
  createdAt!: string;
}

/** Mirrors LimitExceptionEntity */
@ObjectType('LimitException')
export class LimitExceptionObjectType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  tenantId!: string;

  @Field(() => String)
  limitControlId!: string;

  @Field(() => String)
  reason!: string;

  @Field(() => String, { nullable: true })
  metadata?: string;

  @Field(() => String)
  createdAt!: string;
}

@ObjectType('ExposureCheckResult')
export class ExposureCheckResultObjectType {
  @Field(() => Boolean)
  allowed!: boolean;

  @Field(() => String, { nullable: true })
  message?: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class LimitsAndControlsResolver {
  constructor(
    private readonly limitsService: LimitsAndControlsService,
    private readonly adminLimitsService: AdminLimitsService,
  ) {}

  // --- Exposure Limits ---

  @Query(() => [ExposureLimitObjectType], { name: 'exposureLimits' })
  @Permissions('limits:read')
  async exposureLimits(@Tenant() tenantId: string): Promise<ExposureLimitObjectType[]> {
    const limits = await this.adminLimitsService.listLimits(tenantId);
    return limits.map((l) => this.mapExposureLimit(l));
  }

  @Mutation(() => ExposureLimitObjectType)
  @Permissions('limits:write')
  async upsertExposureLimit(@Args('input', { type: () => CreateExposureLimitDto }) dto: CreateExposureLimitDto): Promise<ExposureLimitObjectType> {
    const limit = await this.adminLimitsService.createLimit(dto);
    return this.mapExposureLimit(limit);
  }

  @Mutation(() => ExposureLimitObjectType)
  @Permissions('limits:write')
  async updateExposureLimit(
    @Args('id') id: string,
    @Tenant() tenantId: string,
    @Args('input', { type: () => UpdateExposureLimitDto }) dto: UpdateExposureLimitDto,
  ): Promise<ExposureLimitObjectType> {
    const limit = await this.adminLimitsService.updateLimit(id, tenantId, dto);
    return this.mapExposureLimit(limit);
  }

  @Query(() => ExposureCheckResultObjectType, { name: 'checkExposureLimit' })
  @Permissions('limits:read')
  async checkExposureLimit(
    @Tenant() tenantId: string,
    @Args('instrumentId') instrumentId: string,
    @Args('proposedDelta', { type: () => Float }) proposedDelta: number,
  ): Promise<ExposureCheckResultObjectType> {
    const result = await this.adminLimitsService.checkExposureLimit(tenantId, instrumentId, proposedDelta);
    // fail-open: null means no limit configured → allowed
    return result ?? { allowed: true };
  }

  // --- Limit Controls ---

  @Query(() => [LimitControlObjectType], { name: 'limitControls' })
  @Permissions('limits:read')
  async limitControls(@Tenant() tenantId: string): Promise<LimitControlObjectType[]> {
    const controls = await this.limitsService.listControls(tenantId);
    return controls.map((c) => this.mapControl(c));
  }

  @Mutation(() => LimitControlObjectType)
  @Permissions('limits:write')
  async createLimitControl(@Args('input', { type: () => CreateLimitControlDto }) dto: CreateLimitControlDto): Promise<LimitControlObjectType> {
    const control = await this.limitsService.createControl(dto);
    return this.mapControl(control);
  }

  // --- Limit Exceptions ---

  @Query(() => [LimitExceptionObjectType], { name: 'limitExceptions' })
  @Permissions('limits:read')
  async limitExceptions(@Tenant() tenantId: string): Promise<LimitExceptionObjectType[]> {
    const exceptions = await this.limitsService.listExceptions(tenantId);
    return exceptions.map((e) => this.mapException(e));
  }

  @Mutation(() => LimitExceptionObjectType)
  @Permissions('limits:write')
  async createLimitException(@Args('input', { type: () => CreateLimitExceptionDto }) dto: CreateLimitExceptionDto): Promise<LimitExceptionObjectType> {
    const exception = await this.limitsService.createException(dto);
    return this.mapException(exception);
  }

  // --- Mappers ---

  private mapExposureLimit(e: ExposureLimitEntity): ExposureLimitObjectType {
    return {
      id: e.id,
      tenantId: e.tenantId,
      instrumentId: e.instrumentId,
      maxNetExposure: e.maxNetExposure,
      currentNetExposure: e.currentNetExposure,
      alertThreshold: e.alertThreshold,
      hardLimit: e.hardLimit,
      enabled: e.enabled,
      createdAt: e.createdAt?.toISOString() ?? '',
      updatedAt: e.updatedAt?.toISOString() ?? '',
    };
  }

  private mapControl(c: LimitControlEntity): LimitControlObjectType {
    return {
      id: c.id,
      tenantId: c.tenantId,
      controlType: c.controlType,
      scopeType: c.scopeType,
      scopeValue: c.scopeValue,
      threshold: c.threshold,
      enabled: c.enabled,
      createdAt: c.createdAt?.toISOString() ?? '',
    };
  }

  private mapException(e: LimitExceptionEntity): LimitExceptionObjectType {
    return {
      id: e.id,
      tenantId: e.tenantId,
      limitControlId: e.limitControlId,
      reason: e.reason,
      metadata: JSON.stringify(e.metadata ?? {}),
      createdAt: e.createdAt?.toISOString() ?? '',
    };
  }
}