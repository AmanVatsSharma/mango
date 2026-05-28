/**
 * File:        apps/backend/src/modules/reconciliation/controllers/reconciliation.controller.ts
 * Module:      reconciliation
 * Purpose:     REST endpoints for LP statement import, reconciliation runs, break management,
 *              and aging sweep. Used by broker-admin and ops dashboards.
 *
 * Exports:
 *   - ReconciliationController — @Controller('reconciliation')
 *
 * Depends on:
 *   - ReconciliationService — all business logic
 *
 * Side-effects: DB writes via service
 *
 * Key invariants:
 *   - POST /reconciliation/statement — imports LP daily file
 *   - POST /reconciliation/run      — triggers matching for a date
 *   - PATCH /reconciliation/breaks/:id/resolve — closes a break
 *   - GET /reconciliation/breaks    — filtered list (status, agingOnly, statementDate)
 *
 * Read order:
 *   1. importStatement — entry point for LP file ingestion
 *   2. run             — triggers reconciliation logic
 *   3. resolve         — ops workflow to close breaks
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateReconciliationBreakDto } from '../dtos/create-reconciliation-break.dto';
import { ImportStatementDto, RunReconciliationDto } from '../dtos/import-statement.dto';
import { LpStatementLineEntity } from '../entities/lp-statement-line.entity';
import { ReconciliationBreakEntity } from '../entities/reconciliation-break.entity';
import { ReconciliationService } from '../services/reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('statement')
  async importStatement(@Body() dto: ImportStatementDto): Promise<LpStatementLineEntity[]> {
    return this.reconciliationService.importStatement(dto);
  }

  @Post('run')
  async run(@Body() dto: RunReconciliationDto): Promise<ReconciliationBreakEntity[]> {
    return this.reconciliationService.runReconciliation(dto);
  }

  @Post('breaks')
  async create(@Body() dto: CreateReconciliationBreakDto): Promise<ReconciliationBreakEntity> {
    return this.reconciliationService.createBreak(dto);
  }

  @Patch('breaks/:id/resolve')
  async resolve(
    @Param('id') id: string,
    @Query('resolvedBy') resolvedBy?: string,
  ): Promise<ReconciliationBreakEntity> {
    return this.reconciliationService.resolveBreak(id, resolvedBy);
  }

  @Get('breaks')
  async list(
    @Query('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('agingOnly') agingOnly?: string,
    @Query('statementDate') statementDate?: string,
  ): Promise<ReconciliationBreakEntity[]> {
    return this.reconciliationService.listBreaks(tenantId, {
      status,
      agingOnly: agingOnly === 'true',
      statementDate,
    });
  }
}
