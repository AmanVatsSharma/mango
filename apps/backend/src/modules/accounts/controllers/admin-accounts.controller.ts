/**
 * File:        apps/backend/src/modules/accounts/controllers/admin-accounts.controller.ts
 * Module:      accounts
 * Purpose:     Admin REST endpoints for trading account management.
 *              Lists all accounts and per-account balance details for a tenant.
 *
 * Exports:
 *   - AdminAccountsController — @Controller('admin/accounts')
 *       GET /admin/accounts              — list all trading accounts for tenant
 *       GET /admin/accounts/:id/balances — balance, equity, margin for single account
 *
 * Depends on:
 *   - AccountsService   — listByTenant, getById
 *   - BalancesService   — getBalances
 *
 * Side-effects: none (read-only)
 *
 * Key invariants:
 *   - Requires oms:admin permission; tenant-scoped via TenantGuard
 *   - 404 returned via AppError when account not found or tenant mismatch
 *
 * Read order:
 *   1. AdminAccountsController  — endpoint definitions
 *   2. AccountsService / BalancesService  — underlying logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AccountsService } from '../services/accounts.service';
import { BalancesService } from '../services/balances.service';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

@ApiTags('admin/accounts')
@Controller('admin/accounts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminAccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly balancesService: BalancesService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminAccountsController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all trading accounts for the tenant' })
  @ApiResponse({ status: 200, description: 'Trading accounts' })
  async listAccounts(@Tenant() tenantId: string) {
    this.logger.debug('GET /admin/accounts', { tenantId });
    return this.accountsService.listByTenant(tenantId);
  }

  @Get(':id/balances')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get balance, equity, and margin for a single account' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Account balances' })
  @ApiNotFoundResponse({ description: 'Account not found or tenant mismatch' })
  async getAccountBalances(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug('GET /admin/accounts/:id/balances', { id, tenantId, currency });

    const account = await this.accountsService.getById(id);
    if (!account) {
      throw new AppError('RESOURCE_NOT_FOUND', `Account ${id} not found`);
    }
    if (account.tenantId !== tenantId) {
      throw new AppError('RESOURCE_NOT_FOUND', `Account ${id} not found`);
    }

    return this.balancesService.getBalances(id, { currency });
  }
}