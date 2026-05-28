/**
 * File:        apps/backend/src/modules/limits-and-controls/controllers/admin-limits.controller.ts
 * Module:      limits-and-controls
 * Purpose:     Admin REST endpoints for exposure limit management.
 *
 * Exports:
 *   - AdminLimitsController — @Controller('admin/limits/exposure')
 *       GET    /admin/limits/exposure       — list all exposure limits for tenant
 *       POST   /admin/limits/exposure       — create or upsert an exposure limit
 *       PATCH  /admin/limits/exposure/:id   — partial update of an exposure limit
 *
 * Depends on:
 *   - AdminLimitsService — createLimit, listLimits, updateLimit
 *
 * Side-effects: DB writes via AdminLimitsService
 *
 * Key invariants:
 *   - Requires oms:admin permission; tenant-scoped via TenantGuard
 *
 * Read order:
 *   1. AdminLimitsController  — endpoint definitions
 *   2. AdminLimitsService     — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AdminLimitsService } from '../services/admin-limits.service';
import { AppLoggerService } from '../../../shared/logger';
import { CreateExposureLimitDto, UpdateExposureLimitDto } from '../dtos/exposure-limit.dto';
import { ExposureLimitEntity } from '../entities/exposure-limit.entity';

@ApiTags('admin/limits')
@Controller('admin/limits/exposure')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminLimitsController {
  constructor(
    private readonly service: AdminLimitsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminLimitsController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all exposure limits for the tenant' })
  @ApiResponse({ status: 200, description: 'Exposure limits' })
  async listLimits(@Tenant() tenantId: string): Promise<ExposureLimitEntity[]> {
    this.logger.debug('GET /admin/limits/exposure', { tenantId });
    return this.service.listLimits(tenantId);
  }

  @Post()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create or upsert an exposure limit for an instrument' })
  @ApiResponse({ status: 201, description: 'Exposure limit created or updated' })
  async createLimit(@Body() dto: CreateExposureLimitDto): Promise<ExposureLimitEntity> {
    this.logger.debug('POST /admin/limits/exposure', dto);
    return this.service.createLimit(dto);
  }

  @Patch(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Partial update of an exposure limit' })
  @ApiParam({ name: 'id', example: 'uuid-of-limit' })
  @ApiResponse({ status: 200, description: 'Exposure limit updated' })
  async updateLimit(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Body() dto: UpdateExposureLimitDto,
  ): Promise<ExposureLimitEntity> {
    this.logger.debug('PATCH /admin/limits/exposure/:id', { id, tenantId, dto });
    return this.service.updateLimit(id, tenantId, dto);
  }
}