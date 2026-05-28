/**
 * @file src/modules/partners/controllers/partners.controller.ts
 * @module partners
 * @description Partners controller scaffold for partner operations
 * @author BharatERP
 * @created 2026-02-19
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { CreatePartnerDto } from '../dtos/create-partner.dto';
import { PartnerPayoutApprovalDto } from '../dtos/partner-payout-approval.dto';
import { PartnerEntity } from '../entities/partner.entity';
import { PartnersService } from '../services/partners.service';

@Controller('partners')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @Permissions('partners:write')
  async create(@Body() dto: CreatePartnerDto): Promise<PartnerEntity> {
    return this.partnersService.createPartner(dto);
  }

  @Get()
  @Permissions('partners:read')
  async list(@Query('tenantId') tenantId: string): Promise<PartnerEntity[]> {
    return this.partnersService.listPartners(tenantId);
  }

  @Get(':id/status')
  @Permissions('partners:read')
  async status(@Param('id') id: string): Promise<{ id: string; status: string } | null> {
    return this.partnersService.getPartnerStatus(id);
  }

  @Post(':id/payout-approvals')
  @Permissions('partners:payout')
  async approvePayout(
    @Param('id') id: string,
    @Body() dto: PartnerPayoutApprovalDto,
  ): Promise<{ partnerId: string; status: string; audit: Record<string, unknown> }> {
    return this.partnersService.approvePayout(id, dto);
  }
}
