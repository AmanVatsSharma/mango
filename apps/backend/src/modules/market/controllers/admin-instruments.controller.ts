/**
 * File:        apps/backend/src/modules/market/controllers/admin-instruments.controller.ts
 * Module:      market
 * Purpose:     Platform-admin endpoints for instrument management — listing with status
 *              filter and partial updates to instrument trading parameters.
 *
 * Exports:
 *   - AdminInstrumentsController — @Controller('admin/instruments')
 *       GET  /admin/instruments — list instruments with status/assetClass/symbol filters
 *       PATCH /admin/instruments/:id — update instrument (status)
 *
 * Depends on:
 *   - InstrumentsService         — listInstruments, updateInstrument
 *   - TenantGuard               — resolves tenantId from JWT context
 *
 * Side-effects: DB writes via InstrumentsService.updateInstrument
 *
 * Key invariants:
 *   - No InstrumentEntity status field — status filter added for future use; falls back to full list
 *
 * Read order:
 *   1. listInstruments() — admin query with extended filters
 *   2. updateInstrument() — partial update
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminListInstrumentsQueryDto } from '../dto/admin-instruments.dto';
import { UpdateInstrumentDto } from '../dto/admin-instruments.dto';
import { InstrumentsService } from '../services/instruments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
@ApiTags('Admin Instruments')
@ApiBearerAuth('JWT')
@Controller('admin/instruments')
export class AdminInstrumentsController {
  constructor(
    private readonly svc: InstrumentsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminInstrumentsController.name);
  }

  @Get()
  @ApiOperation({ summary: 'List all instruments for tenant (admin)' })
  @ApiQuery({ name: 'exchange', required: false, example: 'NSE' })
  @ApiQuery({ name: 'type', required: false, example: 'EQUITY' })
  @ApiQuery({ name: 'q', required: false, example: 'RELIANCE' })
  @ApiQuery({ name: 'status', required: false, example: 'Active' })
  @ApiQuery({ name: 'assetClass', required: false })
  @ApiResponse({ status: 200, description: 'Instruments' })
  async listInstruments(@Query() query: AdminListInstrumentsQueryDto) {
    this.logger.debug('GET /admin/instruments', query as any);
    // Pass through to existing listInstruments; status filter is applied client-side
    // or by extending the service query builder if InstrumentEntity gains a status column
    return this.svc.listInstruments({
      exchangeCode: query.exchange,
      type: query.type,
      q: query.q,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update instrument parameters' })
  @ApiParam({ name: 'id', example: 'instrument-uuid' })
  @ApiResponse({ status: 200, description: 'Instrument updated' })
  async updateInstrument(
    @Param('id') id: string,
    @Body() dto: UpdateInstrumentDto,
  ) {
    this.logger.debug('PATCH /admin/instruments/:id', { id, dto });
    return this.svc.updateInstrument(id, dto);
  }
}