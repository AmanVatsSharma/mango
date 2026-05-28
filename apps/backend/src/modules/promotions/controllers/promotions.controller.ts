/**
 * File:        apps/backend/src/modules/promotions/controllers/promotions.controller.ts
 * Module:      promotions
 * Purpose:     Admin REST endpoints for Promotions module
 *
 * Exports:
 *   - PromotionsController — @Controller('admin/promotions')
 *       GET    /admin/promotions         — list promotions
 *       POST   /admin/promotions         — create promotion
 *       PATCH  /admin/promotions/:id     — update promotion
 *       POST   /admin/promotions/:id/announce — trigger announcement
 *
 * Depends on:
 *   - PromotionsService — promotion management
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. PromotionsController — all endpoints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { PromotionsService } from '../services/promotions.service';
import { CreatePromotionDto } from '../dtos/create-promotion.dto';
import { UpdatePromotionDto } from '../dtos/update-promotion.dto';
import { PromotionEntity } from '../entities/promotion.entity';

@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Permissions('oms:admin')
  async listPromotions(@Tenant() tenantId: string): Promise<PromotionEntity[]> {
    return this.promotionsService.listPromotions(tenantId);
  }

  @Post()
  @Permissions('oms:admin')
  async createPromotion(@Body() dto: CreatePromotionDto): Promise<PromotionEntity> {
    return this.promotionsService.createPromotion(dto);
  }

  @Patch(':id')
  @Permissions('oms:admin')
  async updatePromotion(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionEntity> {
    return this.promotionsService.updatePromotion(id, dto);
  }

  @Post(':id/announce')
  @Permissions('oms:admin')
  async announcePromotion(@Param('id') id: string): Promise<{ announced: boolean }> {
    return this.promotionsService.announcePromotion(id);
  }
}