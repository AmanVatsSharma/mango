/**
 * File:        apps/backend/src/modules/lp-routing/controllers/lp-routing.controller.ts
 * Module:      lp-routing
 * Purpose:     Admin REST endpoints for LP Routing Console
 *
 * Exports:
 *   - LpRoutingController — @Controller('admin/lp/routing')
 *       GET    /admin/lp/routing               — list LP providers
 *       POST   /admin/lp/routing/providers     — add LP provider
 *       PATCH  /admin/lp/routing/providers/:id — update provider
 *       POST   /admin/lp/routing/test-quote    — test LP quote
 *
 * Depends on:
 *   - LpRoutingService — LP provider management
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. LpRoutingController — all endpoints
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
import { LpRoutingService } from '../services/lp-routing.service';
import { CreateLpProviderDto } from '../dtos/create-lp-provider.dto';
import { UpdateLpProviderDto } from '../dtos/update-lp-provider.dto';
import { TestLpQuoteDto } from '../dtos/test-lp-quote.dto';
import { LpProviderEntity } from '../entities/lp-provider.entity';

@Controller('admin/lp/routing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class LpRoutingController {
  constructor(private readonly lpRoutingService: LpRoutingService) {}

  @Get()
  @Permissions('oms:admin')
  async listProviders(@Tenant() tenantId: string): Promise<LpProviderEntity[]> {
    return this.lpRoutingService.listProviders(tenantId);
  }

  @Post('providers')
  @Permissions('oms:admin')
  async createProvider(@Body() dto: CreateLpProviderDto): Promise<LpProviderEntity> {
    return this.lpRoutingService.createProvider(dto);
  }

  @Patch('providers/:id')
  @Permissions('oms:admin')
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateLpProviderDto,
  ): Promise<LpProviderEntity> {
    return this.lpRoutingService.updateProvider(id, dto);
  }

  @Post('test-quote')
  @Permissions('oms:admin')
  async testQuote(@Body() dto: TestLpQuoteDto): Promise<{ provider: string; quote: number; validFor: number }> {
    return this.lpRoutingService.testQuote(dto);
  }
}