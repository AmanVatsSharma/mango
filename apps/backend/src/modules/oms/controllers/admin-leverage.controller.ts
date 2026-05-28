/**
 * @file src/modules/oms/controllers/admin-leverage.controller.ts
 * @module oms
 * @description Admin CRUD for user leverage overrides
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
import { UserLeverageOverrideEntity } from '../entities/user-leverage-override.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpsertUserLeverageOverrideDto } from '../dtos/admin-leverage.dto';

@ApiTags('OMS Admin')
@Controller('admin/oms/margin/user-overrides')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminLeverageOverridesController {
  constructor(
    @InjectRepository(UserLeverageOverrideEntity) private readonly repo: Repository<UserLeverageOverrideEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminLeverageOverridesController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List user leverage overrides' })
  list() {
    const ctx = getRequestContext();
    return this.repo.find({ where: { tenantId: ctx?.tenantId } as any });
  }

  @Post()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create user leverage override' })
  @ApiBody({
    type: UpsertUserLeverageOverrideDto,
    examples: {
      x50Intraday: { value: { userId: 'user-uuid', segment: 'EQUITY', positionType: 'INTRADAY', leverageMultiplier: '50', validFrom: '2025-09-25T00:00:00Z', isActive: true } },
      x200FnoShort: { value: { userId: 'user-uuid', segment: 'FNO', positionType: 'SHORT', leverageMultiplier: '200', isActive: true } },
    },
  })
  async create(@Body() dto: UpsertUserLeverageOverrideDto) {
    const ctx = getRequestContext();
    const entity = this.repo.create({ tenantId: ctx?.tenantId, ...dto, validFrom: dto.validFrom ? new Date(dto.validFrom) : null, validTo: dto.validTo ? new Date(dto.validTo) : null });
    return this.repo.save(entity);
  }

  @Put(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update user leverage override' })
  @ApiBody({
    type: UpsertUserLeverageOverrideDto,
    examples: {
      patch: { value: { userId: 'user-uuid', segment: 'EQUITY', positionType: 'INTRADAY', leverageMultiplier: '75', isActive: true } },
    },
  })
  async update(@Param('id') id: string, @Body() dto: UpsertUserLeverageOverrideDto) {
    const ctx = getRequestContext();
    const entity = await this.repo.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!entity) return null;
    Object.assign(entity, { ...dto, validFrom: dto.validFrom ? new Date(dto.validFrom) : null, validTo: dto.validTo ? new Date(dto.validTo) : null });
    return this.repo.save(entity);
  }

  @Delete(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete user leverage override' })
  async remove(@Param('id') id: string) {
    const ctx = getRequestContext();
    const entity = await this.repo.findOne({ where: { id, tenantId: ctx?.tenantId } });
    if (!entity) return null;
    await this.repo.remove(entity);
    return { ok: true };
  }
}
