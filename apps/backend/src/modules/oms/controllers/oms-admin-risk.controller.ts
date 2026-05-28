/**
 * @file        src/modules/oms/controllers/oms-admin-risk.controller.ts
 * @module     oms
 * @description Admin CRUD for buying power rules
 * @author     BharatERP
 * @created    2026-02-17
 * @created 2025-09-19
 */

import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { BuyingPowerRuleEntity } from '../entities/buying-power-rule.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

class UpsertRuleDto {
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';
  positionType!: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';
  multiplier!: string;
  maintenanceMarginRate!: string;
  isActive!: boolean;
}

@ApiTags('OMS Admin')
@Controller('admin/oms/risk')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminRiskController {
  constructor(
    @InjectRepository(BuyingPowerRuleEntity) private readonly rules: Repository<BuyingPowerRuleEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminRiskController.name);
  }

  @Get('rules')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List buying power rules' })
  list() {
    const ctx = getRequestContext();
    return this.rules.find({ where: { tenantId: ctx?.tenantId } as any });
  }

  @Post('rules')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create buying power rule' })
  @ApiBody({ type: UpsertRuleDto })
  async create(@Body() dto: UpsertRuleDto) {
    const ctx = getRequestContext();
    const rule = this.rules.create({ tenantId: ctx?.tenantId, ...dto });
    this.logger.debug('create rule', rule);
    return this.rules.save(rule);
  }

  @Put('rules/:id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update buying power rule' })
  @ApiBody({ type: UpsertRuleDto })
  async update(@Param('id') id: string, @Body() dto: UpsertRuleDto) {
    const ctx = getRequestContext();
    const rule = await this.rules.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!rule) return null;
    Object.assign(rule, dto);
    this.logger.debug('update rule', rule);
    return this.rules.save(rule);
  }

  @Delete('rules/:id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete buying power rule' })
  async remove(@Param('id') id: string) {
    const ctx = getRequestContext();
    const rule = await this.rules.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!rule) return null;
    this.logger.debug('remove rule', { id });
    await this.rules.remove(rule);
    return { ok: true };
  }
}


