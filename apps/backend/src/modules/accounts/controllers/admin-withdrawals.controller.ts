/**
 * File:        apps/backend/src/modules/accounts/controllers/admin-withdrawals.controller.ts
 * Module:      accounts · Admin Withdrawals
 * Purpose:     Broker admin endpoints to list all withdrawal requests across the tenant
 *              and approve/reject individual requests.
 *
 * Exports:
 *   - AdminWithdrawalsController — NestJS controller with 3 endpoints
 *
 * Depends on:
 *   - ../services/ledger.service   — LedgerService.listAllWithdrawals, .approveWithdrawal, .rejectWithdrawal
 *   - AppLoggerService            — structured request logging
 *   - JwtAuthGuard + TenantGuard + PermissionsGuard
 *
 * Side-effects:
 *   - none (read / state-transition only)
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard (tenant-scoped) + PermissionsGuard
 *   - Withdrawals are filtered by tenantId from request context (never cross-tenant)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { LedgerService } from '../services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('admin/accounts')
@Controller('admin/accounts/withdrawals')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminWithdrawalsController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminWithdrawalsController.name);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all withdrawal requests for the tenant' })
  @ApiQuery({ name: 'accountId', required: false, description: 'Filter by account ID' })
  @ApiQuery({ name: 'state', required: false, description: 'PENDING | APPROVED | REJECTED | FULFILLED' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiQuery({ name: 'offset', required: false, example: '0' })
  @ApiResponse({ status: 200, description: 'Paginated withdrawal requests' })
  async listAll(
    @Query('accountId') accountId?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/accounts/withdrawals', { accountId, state, limit, offset });
    return this.ledgerService.listAllWithdrawals({
      accountId,
      state: state as any,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Post(':wid/approve')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve a withdrawal request and debit the account ledger' })
  @ApiParam({ name: 'wid', type: String, description: 'Withdrawal request UUID' })
  @ApiResponse({ status: 200, description: 'Approved withdrawal' })
  async approve(@Param('wid') wid: string, @Body('reason') _reason: string) {
    this.logger.debug('POST /admin/accounts/withdrawals/:wid/approve', { wid });
    // listAllWithdrawals returns items without accountId on the entity, so we look up by id only
    // The service resolves tenantId from request context internally
    return this.ledgerService.approveWithdrawalById(wid);
  }

  @Post(':wid/reject')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reject a withdrawal request' })
  @ApiParam({ name: 'wid', type: String, description: 'Withdrawal request UUID' })
  @ApiResponse({ status: 200, description: 'Rejected withdrawal' })
  async reject(@Param('wid') wid: string, @Body('reason') reason?: string) {
    this.logger.debug('POST /admin/accounts/withdrawals/:wid/reject', { wid, reason });
    return this.ledgerService.rejectWithdrawalById(wid, reason);
  }
}
