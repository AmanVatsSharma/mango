/**
 * @file src/modules/settlement/controllers/settlement.controller.ts
 * @module settlement
 * @description Settlement API scaffold for broker-admin operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateSettlementJobDto } from '../dtos/create-settlement-job.dto';
import { SettlementJobEntity } from '../entities/settlement-job.entity';
import { SettlementService } from '../services/settlement.service';

@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('jobs')
  async create(@Body() dto: CreateSettlementJobDto): Promise<SettlementJobEntity> {
    return this.settlementService.createJob(dto);
  }

  @Get('jobs')
  async list(@Query('tenantId') tenantId: string): Promise<SettlementJobEntity[]> {
    return this.settlementService.listJobs(tenantId);
  }
}
