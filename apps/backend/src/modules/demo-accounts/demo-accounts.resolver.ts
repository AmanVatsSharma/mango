/**
 * File:        apps/backend/src/modules/demo-accounts/demo-accounts.resolver.ts
 * Module:      demo-accounts · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over DemoAccountService.
 *              Covers: demo account creation with optional virtual balance seed
 *              and listing of existing demo accounts.
 *
 * Exports:
 *   - DemoAccountsResolver  — GraphQL API for demo account management
 *   - DemoAccountObjectType — GraphQL object type mirroring AccountEntity
 *
 * Depends on:
 *   - DemoAccountService — account creation and listing
 *   - AccountEntity       — entity shape
 *   - JwtAuthGuard        — auth enforcement
 *   - TenantGuard         — tenant isolation
 *   - PermissionsGuard    — permission enforcement
 *   - Permissions         — permission decorator
 *   - Tenant              — tenant decorator
 *
 * Side-effects: DB writes (createDemoAccount creates a live AccountEntity row)
 *
 * Key invariants:
 *   - All operations require demo-accounts:read or demo-accounts:write permission
 *   - tenantId and userId sourced from request context (@Tenant() + getRequestContext())
 *   - seedAmount credits the account ledger atomically in the same transaction
 *
 * Read order:
 *   1. DemoAccountsResolver — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DemoAccountService } from './services/demo-account.service';
import { AccountEntity } from '../accounts/entities/account.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('DemoAccount')
export class DemoAccountObjectType {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  baseCurrency!: string;

  @Field()
  accountType!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DemoAccountsResolver {
  constructor(
    private readonly demoAccountService: DemoAccountService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DemoAccountsResolver.name);
  }

  @Query(() => [DemoAccountObjectType], { name: 'demoAccounts' })
  @Permissions('demo-accounts:read')
  async listDemoAccounts(): Promise<DemoAccountObjectType[]> {
    const accounts = await this.demoAccountService.listDemoAccounts();
    return accounts.map((a) => this.mapAccount(a));
  }

  @Mutation(() => DemoAccountObjectType)
  @Permissions('demo-accounts:write')
  async createDemoAccount(
    @Args('baseCurrency', { nullable: true }) baseCurrency?: string,
    @Args('seedAmount', { type: () => Float, nullable: true }) seedAmount?: number,
    @Args('seedBalanceCcy', { nullable: true }) seedBalanceCcy?: string,
  ): Promise<DemoAccountObjectType> {
    const account = await this.demoAccountService.createDemoAccount({
      baseCurrency,
      seedAmount: seedAmount ?? undefined,
      seedBalanceCcy,
    } as any);
    return this.mapAccount(account);
  }

  // ── Mapper ───────────────────────────────────────────────────────────────

  private mapAccount(a: AccountEntity): DemoAccountObjectType {
    return {
      id: a.id,
      userId: a.userId,
      baseCurrency: a.baseCurrency,
      accountType: (a as any).accountType ?? 'DEMO',
      status: a.status,
      createdAt: (a as any).createdAt instanceof Date
        ? (a as any).createdAt.toISOString()
        : String((a as any).createdAt ?? ''),
    };
  }
}