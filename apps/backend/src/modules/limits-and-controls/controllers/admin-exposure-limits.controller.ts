/**
 * File:        apps/backend/src/modules/limits-and-controls/controllers/admin-exposure-limits.controller.ts
 * Module:      limits-and-controls
 * Purpose:     Admin REST endpoints for exposure limit management at /admin/exposure-limits.
 *              Mirrors AdminLimitsController but at a flat path for broker-admin integration.
 *
 * Exports:
 *   - AdminExposureLimitsController — @Controller('admin/exposure-limits')
 *       GET    /admin/exposure-limits          — list all exposure limits for tenant
 *       PATCH  /admin/exposure-limits/:id      — partial update (maxNetExposure, alertThreshold, enabled)
 *
 * Depends on:
 *   - AdminLimitsService  — listLimits, updateLimit
 *
 * Side-effects: none (read-only for GET; DB write for PATCH)
 *
 * Key invariants:
 *   - Requires oms:admin permission; tenant-scoped via TenantGuard
 *   - AppError thrown for unknown limit or tenant mismatch
 *
 * Read order:
 *   1. AdminExposureLimitsController  — endpoint definitions
 *   2. AdminLimitsService  — business logic and validation
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AdminLimitsService } from '../services/admin-limits.service';
import { AppLoggerService } from '../../../shared/logger';
import { UpdateExposureLimitDto } from '../dtos/exposure-limit.dto';
import { ExposureLimitEntity } from '../entities/exposure-limit.entity';

@ApiTags('admin/exposure-limits')
@Controller('admin/exposure-limits')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminExposureLimitsController {
  constructor(
    private readonly service: AdminLimitsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminExposureLimitsController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all exposure limits for the tenant' })
  @ApiResponse({ status: 200, description: 'Exposure limits array' })
  async listLimits(@Tenant() tenantId: string): Promise<ExposureLimitEntity[]> {
    this.logger.debug('GET /admin/exposure-limits', { tenantId });
    return this.service.listLimits(tenantId);
  }

  @Patch(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Partial update of an exposure limit' })
  @ApiParam({ name: 'id', description: 'Exposure limit UUID' })
  @ApiResponse({ status: 200, description: 'Updated exposure limit' })
  @ApiNotFoundResponse({ description: 'Exposure limit not found' })
  async updateLimit(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @Body() dto: UpdateExposureLimitDto,
  ): Promise<ExposureLimitEntity> {
    this.logger.debug('PATCH /admin/exposure-limits/:id', { id, tenantId, dto });
    return this.service.updateLimit(id, tenantId, dto);
  }
}