/**
 * File:        apps/backend/src/modules/admin/controllers/admin-promotions.controller.ts
 * Module:      admin · Promotions Controller
 * Purpose:     REST endpoints for promotion campaign CRUD.
 *
 * Exports:
 *   - AdminPromotionsController — @Controller('admin/promotions')
 *       GET /admin/promotions              — list all campaigns
 *       POST /admin/promotions             — create campaign
 *       PATCH /admin/promotions/:id        — update campaign
 *
 * Depends on:
 *   - AdminPromotionsService — list / create / update
 *   - @obsidian/backend-auth — JwtAuthGuard
 *   - @obsidian/backend-rbac — TenantGuard, PermissionsGuard, Permissions
 *   - AppLoggerService    — structured request logging
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - budget and spent are stored in cents to avoid floating-point issues
 *   - All endpoints require JWT + tenant scope + oms:admin permission
 *
 * Read order:
 *   1. AdminPromotionsController  — endpoint definitions
 *   2. AdminPromotionsService     — underlying business logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../../shared/logger';
import {
  AdminPromotionsService,
  CreatePromotionDto,
  UpdatePromotionDto,
} from '../services/admin-promotions.service';

@ApiTags('admin/promotions')
@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminPromotionsController {
  constructor(
    private readonly service: AdminPromotionsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminPromotionsController.name);
  }

  @Get()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all promotion campaigns' })
  @ApiResponse({ status: 200, description: 'Promotion list' })
  list() {
    this.logger.debug('GET /admin/promotions');
    return this.service.list();
  }

  @Post()
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new promotion campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  create(@Body() body: CreatePromotionDto) {
    this.logger.debug('POST /admin/promotions', { name: body.name });
    return this.service.create(body);
  }

  @Patch(':id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a promotion campaign' })
  @ApiParam({ name: 'id', example: 'C001' })
  @ApiResponse({ status: 200, description: 'Campaign updated' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  update(@Param('id') id: string, @Body() body: UpdatePromotionDto) {
    this.logger.debug('PATCH /admin/promotions/:id', { id });
    return this.service.update(id, body);
  }
}