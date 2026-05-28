/**
 * File:        apps/backend/src/modules/rules-engine/rules-engine.resolver.ts
 * Module:      rules-engine · GraphQL
 * Purpose:     GraphQL resolver for automation rules — list, create, update,
 *              activate/deactivate rules.
 *
 * Exports:
 *   - RulesEngineResolver — @Query(() => [RuleEntity]), .ruleEvaluations()
 *                            @Mutation(() => RuleEntity) — createRule, updateRule
 *                            @Mutation(() => RuleEntity) — activateRule, deactivateRule
 *
 * Depends on:
 *   - RulesEngineService  — listRules, createRule, updateRule, toggleRule
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService    — structured logging
 *
 * Side-effects:
 *   - DB writes for all mutations (create/update/toggle)
 *   - Outbox event emitted on activate/deactivate
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require rules-engine:write permission
 *   - activateRule / deactivateRule are toggle mutations (not separate status setters)
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. RulesEngineResolver — endpoint definitions
 *   2. RulesEngineService  — business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, Int, ID } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { RulesEngineService } from './services/rules-engine.service';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';
import { CreateRuleDto, UpdateRuleDto } from './dtos/rule.dto';
import { RuleEntity } from './entities/rule.entity';

/* ── GraphQL ObjectTypes ─────────────────────────────────────────────────────── */

@ObjectType()
export class RuleEvaluationSummary {
  @Field(() => ID)
  ruleId!: string;

  @Field()
  ruleName!: string;

  @Field()
  triggerEvent!: string;

  @Field(() => Int)
  executionCount!: number;

  @Field({ nullable: true })
  lastTriggeredAt!: Date | null;

  @Field()
  status!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class RulesEngineResolver {
  constructor(
    private readonly rulesEngineService: RulesEngineService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RulesEngineResolver.name);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  @Query(() => [RuleEntity], { name: 'rules' })
  @Permissions('rules-engine:read')
  async rules(): Promise<RuleEntity[]> {
    this.logger.debug('RulesEngineResolver.rules()');
    const ctx = getRequestContext();
    return this.rulesEngineService.listRules(ctx.tenantId);
  }

  @Query(() => [RuleEvaluationSummary], { name: 'ruleEvaluations' })
  @Permissions('rules-engine:read')
  async ruleEvaluations(): Promise<RuleEvaluationSummary[]> {
    this.logger.debug('RulesEngineResolver.ruleEvaluations()');
    const ctx = getRequestContext();
    const rules = await this.rulesEngineService.listRules(ctx.tenantId);
    return rules.map((r) => ({
      ruleId: r.id,
      ruleName: r.name,
      triggerEvent: r.triggerEvent,
      executionCount: r.executionCount,
      lastTriggeredAt: r.lastTriggeredAt ?? null,
      status: r.status,
    }));
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  @Mutation(() => RuleEntity)
  @Permissions('rules-engine:write')
  async createRule(@Args('input') dto: CreateRuleDto): Promise<RuleEntity> {
    this.logger.debug('RulesEngineResolver.createRule()', dto);
    const ctx = getRequestContext();
    return this.rulesEngineService.createRule(dto, ctx.tenantId);
  }

  @Mutation(() => RuleEntity)
  @Permissions('rules-engine:write')
  async updateRule(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') dto: UpdateRuleDto,
  ): Promise<RuleEntity> {
    this.logger.debug('RulesEngineResolver.updateRule()', { id, dto });
    const ctx = getRequestContext();
    return this.rulesEngineService.updateRule(id, dto, ctx.tenantId);
  }

  @Mutation(() => RuleEntity)
  @Permissions('rules-engine:write')
  async activateRule(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RuleEntity> {
    this.logger.debug('RulesEngineResolver.activateRule()', { id });
    const ctx = getRequestContext();
    const rule = await this.rulesEngineService.toggleRule(id, ctx.tenantId);
    if (rule.status !== 'ACTIVE') {
      // Toggle once more to ensure ACTIVE
      return this.rulesEngineService.toggleRule(id, ctx.tenantId);
    }
    return rule;
  }

  @Mutation(() => RuleEntity)
  @Permissions('rules-engine:write')
  async deactivateRule(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RuleEntity> {
    this.logger.debug('RulesEngineResolver.deactivateRule()', { id });
    const ctx = getRequestContext();
    const rule = await this.rulesEngineService.toggleRule(id, ctx.tenantId);
    if (rule.status !== 'INACTIVE') {
      // Toggle once more to ensure INACTIVE
      return this.rulesEngineService.toggleRule(id, ctx.tenantId);
    }
    return rule;
  }
}