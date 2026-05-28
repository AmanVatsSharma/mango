/**
 * File:        apps/backend/src/modules/admin/controllers/admin-bonuses.controller.ts
 * Module:      admin · Bonuses Controller
 * Purpose:     REST endpoints for bonus program CRUD.
 *
 * Exports:
 *   - AdminBonusesController — @Controller('admin/bonuses')
 *       GET /admin/bonuses               — list all bonus programs
 *       POST /admin/bonuses              — create bonus program
 *       PATCH /admin/bonuses/:id         — update bonus program
 *       DELETE /admin/bonuses/:id       — deactivate bonus program (soft delete)
 *
 * Depends on:
 *   - AdminBonusesService — list / create / update / remove
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService    — structured request logging
 *
 * Side-effects: none (read / state-transition only)
 *
 * Key invariants:
 *   - DELETE performs soft-delete (status → Inactive) rather than hard-delete
 *   - All endpoints require JWT + tenant scope + oms:admin permission
 *
 * Read order:
 *   1. AdminBonusesController  — endpoint definitions
 *   2. AdminBonusesService     — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../../shared/logger';
import {
  AdminBonusesService,
  CreateBonusDto,
  UpdateBonusDto,
} from '../services/admin-bonuses.service';

@ApiTags('admin/bonuses')
@Controller('admin/bonuses')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminBonusesController {
  constructor(
    private readonly service: AdminBonusesService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminBonusesController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all bonus programs' })
  @ApiResponse({ status: 200, description: 'Bonus list' })
  list() {
    this.logger.debug('GET /admin/bonuses');
    return this.service.list();
  }

  @Post()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new bonus program' })
  @ApiResponse({ status: 201, description: 'Bonus created' })
  create(@Body() body: CreateBonusDto) {
    this.logger.debug('POST /admin/bonuses', { name: body.name });
    return this.service.create(body);
  }

  @Patch(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a bonus program' })
  @ApiParam({ name: 'id', example: 'B001' })
  @ApiResponse({ status: 200, description: 'Bonus updated' })
  @ApiResponse({ status: 404, description: 'Bonus not found' })
  update(@Param('id') id: string, @Body() body: UpdateBonusDto) {
    this.logger.debug('PATCH /admin/bonuses/:id', { id });
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Deactivate a bonus program (soft delete)' })
  @ApiParam({ name: 'id', example: 'B001' })
  @ApiResponse({ status: 200, description: 'Bonus deactivated' })
  @ApiResponse({ status: 404, description: 'Bonus not found' })
  remove(@Param('id') id: string) {
    this.logger.debug('DELETE /admin/bonuses/:id', { id });
    return this.service.remove(id);
  }
}