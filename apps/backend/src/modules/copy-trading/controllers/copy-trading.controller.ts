/**
 * File:        apps/backend/src/modules/copy-trading/controllers/copy-trading.controller.ts
 * Module:      copy-trading
 * Purpose:     Admin REST endpoints for Copy Trading module
 *
 * Exports:
 *   - CopyTradingController — @Controller('admin/copy-trading')
 *       GET    /admin/copy-trading/signals       — list signals
 *       POST   /admin/copy-trading/subscribe     — subscribe slave to master
 *       GET    /admin/copy-trading/performance   — performance summary
 *
 * Depends on:
 *   - CopyTradingService — signals and subscriptions
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. CopyTradingController — all endpoints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { CopyTradingService } from '../services/copy-trading.service';
import { CreateCopyTradingSubscriptionDto } from '../dtos/create-copy-trading-subscription.dto';
import { CopyTradingSignalEntity } from '../entities/copy-trading-signal.entity';
import { CopyTradingSubscriptionEntity } from '../entities/copy-trading-subscription.entity';

@Controller('admin/copy-trading')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class CopyTradingController {
  constructor(private readonly copyTradingService: CopyTradingService) {}

  @Get('signals')
  @Permissions('oms:admin')
  async listSignals(@Tenant() tenantId: string): Promise<CopyTradingSignalEntity[]> {
    return this.copyTradingService.listSignals(tenantId);
  }

  @Post('subscribe')
  @Permissions('oms:admin')
  async subscribe(@Body() dto: CreateCopyTradingSubscriptionDto): Promise<CopyTradingSubscriptionEntity> {
    return this.copyTradingService.createSubscription(dto);
  }

  @Get('performance')
  @Permissions('oms:admin')
  async getPerformance(@Tenant() tenantId: string): Promise<{ totalSignals: number; activeSubscriptions: number }> {
    return this.copyTradingService.getPerformanceSummary(tenantId);
  }
}