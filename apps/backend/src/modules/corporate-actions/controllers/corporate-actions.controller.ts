/**
 * @file src/modules/corporate-actions/controllers/corporate-actions.controller.ts
 * @module corporate-actions
 * @description Corporate actions controller scaffold for broker operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateCorporateActionDto } from '../dtos/create-corporate-action.dto';
import { CorporateActionEntity } from '../entities/corporate-action.entity';
import { CorporateActionsService } from '../services/corporate-actions.service';

@Controller('corporate-actions')
export class CorporateActionsController {
  constructor(private readonly corporateActionsService: CorporateActionsService) {}

  @Post('events')
  async create(@Body() dto: CreateCorporateActionDto): Promise<CorporateActionEntity> {
    return this.corporateActionsService.createAction(dto);
  }

  @Get('events')
  async list(@Query('tenantId') tenantId: string): Promise<CorporateActionEntity[]> {
    return this.corporateActionsService.listActions(tenantId);
  }
}
