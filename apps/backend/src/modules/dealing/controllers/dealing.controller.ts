/**
 * @file src/modules/dealing/controllers/dealing.controller.ts
 * @module dealing
 * @description Dealing controller scaffold for deal operations
 * @author BharatERP
 * @created 2026-02-19
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { CreateDealDto } from '../dtos/create-deal.dto';
import { DealOverrideDto } from '../dtos/deal-override.dto';
import { DealEntity } from '../entities/deal.entity';
import { DealingService } from '../services/dealing.service';

@Controller('dealing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DealingController {
  constructor(private readonly dealingService: DealingService) {}

  @Post('deals')
  @Permissions('dealing:write')
  async create(@Body() dto: CreateDealDto): Promise<DealEntity> {
    return this.dealingService.createDeal(dto);
  }

  @Get('deals')
  @Permissions('dealing:read')
  async list(@Query('tenantId') tenantId: string): Promise<DealEntity[]> {
    return this.dealingService.listDeals(tenantId);
  }

  @Get('deals/:id/status')
  @Permissions('dealing:read')
  async status(@Param('id') id: string): Promise<{ id: string; status: string } | null> {
    return this.dealingService.getDealStatus(id);
  }

  @Post('deals/:id/override')
  @Permissions('dealing:override')
  async override(
    @Param('id') id: string,
    @Body() dto: DealOverrideDto,
  ): Promise<{ id: string; status: string; audit: Record<string, unknown> }> {
    return this.dealingService.requestManualOverride(id, dto);
  }
}
