/**
 * @file src/modules/limits-and-controls/controllers/limits-and-controls.controller.ts
 * @module limits-and-controls
 * @description Broker-admin APIs for limits setup and exception queue operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateLimitControlDto, CreateLimitExceptionDto } from '../dtos/create-limit-control.dto';
import { LimitControlEntity } from '../entities/limit-control.entity';
import { LimitExceptionEntity } from '../entities/limit-exception.entity';
import { LimitsAndControlsService } from '../services/limits-and-controls.service';

@Controller('limits-and-controls')
export class LimitsAndControlsController {
  constructor(private readonly limitsAndControlsService: LimitsAndControlsService) {}

  @Post('controls')
  async createControl(@Body() dto: CreateLimitControlDto): Promise<LimitControlEntity> {
    return this.limitsAndControlsService.createControl(dto);
  }

  @Get('controls')
  async listControls(@Query('tenantId') tenantId: string): Promise<LimitControlEntity[]> {
    return this.limitsAndControlsService.listControls(tenantId);
  }

  @Post('exceptions')
  async createException(@Body() dto: CreateLimitExceptionDto): Promise<LimitExceptionEntity> {
    return this.limitsAndControlsService.createException(dto);
  }

  @Get('exceptions')
  async listExceptions(@Query('tenantId') tenantId: string): Promise<LimitExceptionEntity[]> {
    return this.limitsAndControlsService.listExceptions(tenantId);
  }
}
