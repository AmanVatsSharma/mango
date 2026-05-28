/**
 * File:        src/modules/oms/positions/controllers/admin-positions.controller.ts
 * Module:      oms-positions
 * Purpose:     Broker-admin endpoint for listing positions across all accounts (admin scope)
 *
 * Exports:
 *   - AdminPositionsController   — GET /admin/positions
 *
 * Depends on:
 *   - @obsidian/backend-oms (PositionsService) — delegated listAll
 *   - @obsidian/backend-rbac (guards + Permissions decorator)
 *
 * Side-effects:  none
 * Key invariants:  requires oms:admin permission; tenant-scoped via TenantGuard
 *
 * Read order:
 *   1. AdminPositionsController  — endpoint definitions
 *   2. PositionsService.listAll — underlying query logic
 *
 * Author:       BharatERP
 * Last-updated: 2026-05-16
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { PositionsService } from '../services/positions.service';
import { AppLoggerService } from '../../../../shared/logger';

@ApiTags('admin/positions')
@Controller('admin/positions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminPositionsController {
  constructor(
    private readonly service: PositionsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminPositionsController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all positions across accounts (admin scope)' })
  @ApiQuery({ name: 'accountId', required: false, description: 'Filter by account UUID' })
  @ApiQuery({ name: 'currency', required: false, description: 'Convert values to this currency' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 100)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (default 0)' })
  @ApiResponse({ status: 200, description: 'Paginated position rows' })
  async list(
    @Query('accountId') accountId?: string,
    @Query('currency') currency?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/positions', { accountId, currency, limit, offset });
    return this.service.listAll({
      accountId,
      currency,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}