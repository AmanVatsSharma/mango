/**
 * File:        apps/backend/src/modules/accounts/accounts.resolver.ts
 * Module:      accounts · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over AccountsService.
 *              Complements the REST API; provides dashboard/aggregation access pattern.
 *
 * Exports:
 *   - AccountsResolver — NestJS GraphQL @Resolver(() => AccountEntity)
 *
 * Depends on:
 *   - AccountsService        — listMyAccounts, getById, createAccount
 *   - BalancesService        — getBalances (for accountBalance query)
 *   - @obsidian/backend-auth — JwtAuthGuard (applied via UseGuards)
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService       — structured request logging
 *
 * Side-effects:
 *   - DB reads (accounts list / balance lookup) via service delegation
 *
 * Key invariants:
 *   - All queries are tenant-scoped via TenantGuard + request context
 *   - Mutations require accounts:write permission
 *   - Resolver never touches TypeORM directly
 *
 * Read order:
 *   1. AccountsResolver — endpoint definitions
 *   2. AccountsService  — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, Float, ObjectType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AccountEntity } from './entities/account.entity';
import { AccountsService } from './services/accounts.service';
import { BalancesService } from './services/balances.service';
import { CreateAccountDto } from './dtos/create-account.dto';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';

/* ── GraphQL ObjectTypes (re-export entity, augment with balances) ─────────── */

@ObjectType()
export class AccountBalancePayload {
  @Field(() => String)
  totalCash!: string;

  @Field(() => String)
  lockedCash!: string;

  @Field(() => String)
  availableCash!: string;

  @Field(() => String)
  positionsValue!: string;

  @Field(() => String)
  unrealizedPnl!: string;

  @Field(() => String)
  equity!: string;

  @Field(() => String)
  buyingPower!: string;

  @Field(() => String)
  currency!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver(() => AccountEntity)
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AccountsResolver {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly balancesService: BalancesService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AccountsResolver.name);
  }

  @Query(() => [AccountEntity], { name: 'myAccounts' })
  @Permissions('accounts:read')
  async listMyAccounts(): Promise<AccountEntity[]> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.listMyAccounts()', { requestId: ctx?.requestId });
    return this.accountsService.listMyAccounts();
  }

  @Query(() => AccountEntity, { name: 'account', nullable: true })
  @Permissions('accounts:read')
  async getAccount(@Args('id') id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.getAccount()', { requestId: ctx?.requestId, id });
    return this.accountsService.getById(id);
  }

  @Query(() => [AccountEntity], { name: 'allAccounts' })
  @Permissions('accounts:read')
  async listAllAccounts(
    @Args('userId', { nullable: true }) userId?: string,
  ): Promise<AccountEntity[]> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.listAllAccounts()', {
      requestId: ctx?.requestId,
      tenantId: ctx?.tenantId,
      userId,
    });
    return this.accountsService.listByTenant(ctx.tenantId, userId);
  }

  @Query(() => AccountBalancePayload, { name: 'accountBalance', nullable: true })
  @Permissions('accounts:read')
  async getAccountBalance(
    @Args('accountId') accountId: string,
    @Args('currency', { nullable: true }) currency?: string,
  ): Promise<AccountBalancePayload | null> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.getAccountBalance()', {
      requestId: ctx?.requestId,
      accountId,
      currency,
    });
    const account = await this.accountsService.getById(accountId);
    if (!account || account.tenantId !== ctx?.tenantId) return null;
    return this.balancesService.getBalances(accountId, { currency });
  }

  @Mutation(() => AccountEntity)
  @Permissions('accounts:write')
  async createAccount(@Args('input', { type: () => CreateAccountDto }) dto: CreateAccountDto): Promise<AccountEntity> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.createAccount()', { requestId: ctx?.requestId, dto });
    return this.accountsService.createAccount(dto);
  }

  @Mutation(() => AccountEntity, { nullable: true })
  @Permissions('accounts:write')
  async disableAccount(@Args('id') id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.disableAccount()', { requestId: ctx?.requestId, id });
    return this.accountsService.disableAccount(id);
  }

  @Mutation(() => AccountEntity, { nullable: true })
  @Permissions('accounts:write')
  async enableAccount(@Args('id') id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('AccountsResolver.enableAccount()', { requestId: ctx?.requestId, id });
    return this.accountsService.enableAccount(id);
  }
}