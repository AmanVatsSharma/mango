/**
 * @file src/modules/oms/controllers/admin-brokerage.controller.ts
 * @module oms
 * @description Admin CRUD for brokerage rules
 * @author BharatERP
 * @created 2025-09-25
 */

import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerageRuleEntity } from '../entities/brokerage-rule.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpsertBrokerageRuleDto } from '../dtos/admin-brokerage.dto';

@ApiTags('OMS Admin')
@Controller('admin/oms/margin/brokerage-rules')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminBrokerageRulesController {
  constructor(
    @InjectRepository(BrokerageRuleEntity) private readonly repo: Repository<BrokerageRuleEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminBrokerageRulesController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List brokerage rules' })
  list() {
    const ctx = getRequestContext();
    return this.repo.find({ where: { tenantId: ctx?.tenantId } as any });
  }

  @Post()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create brokerage rule' })
  @ApiBody({
    type: UpsertBrokerageRuleDto,
    examples: {
      tenantEquity: { value: { appliesTo: 'TENANT', segment: 'EQUITY', product: 'CASH', side: 'BOTH', percent: '0.0005', perOrderFlat: '5', isActive: true } },
      userFnoSellCap: { value: { appliesTo: 'USER', userId: 'user-uuid', segment: 'FNO', product: 'OPTIONS', side: 'SELL', percent: '0.001', perOrderFlat: '0', capPerOrder: '50', isActive: true } },
    },
  })
  async create(@Body() dto: UpsertBrokerageRuleDto) {
    const ctx = getRequestContext();
    const entity = this.repo.create({ tenantId: ctx?.tenantId, ...dto });
    return this.repo.save(entity);
  }

  @Put(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update brokerage rule' })
  @ApiBody({
    type: UpsertBrokerageRuleDto,
    examples: {
      update: { value: { appliesTo: 'TENANT', segment: 'EQUITY', product: 'CASH', side: 'BOTH', percent: '0.0007', perOrderFlat: '3', isActive: true } },
    },
  })
  async update(@Param('id') id: string, @Body() dto: UpsertBrokerageRuleDto) {
    const ctx = getRequestContext();
    const entity = await this.repo.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!entity) return null;
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  @Delete(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete brokerage rule' })
  async remove(@Param('id') id: string) {
    const ctx = getRequestContext();
    const entity = await this.repo.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!entity) return null;
    await this.repo.remove(entity);
    return { ok: true };
  }
}


