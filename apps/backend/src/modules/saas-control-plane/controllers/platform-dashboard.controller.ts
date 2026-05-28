/**
 * File:        apps/backend/src/modules/saas-control-plane/controllers/platform-dashboard.controller.ts
 * Module:      saas-control-plane · Platform Dashboard
 * Purpose:     Platform-owner dashboard endpoints — platform-wide KPIs, broker list
 *              with metrics, and revenue time-series. Operates across all tenants (no TenantGuard).
 *
 * Exports:
 *   - PlatformDashboardController  — @Controller('platform/dashboard')
 *
 * Depends on:
 *   - BrokerOnboardingService  — getPlatformStats, listBrokersWithMetrics, getRevenueSeries
 *   - JwtAuthGuard             — validates access token
 *   - PlatformOwnerGuard       — enforces tid='platform' + platform_owner role
 *   - AppLoggerService
 *
 * Side-effects:  read-only (no DB writes)
 *
 * Key invariants:
 *   - No TenantGuard — operates across all tenants at the platform level
 *   - All endpoints gated behind PlatformOwnerGuard (tid='platform', role=platform_owner)
 *   - GET /platform/dashboard/brokers is paginated (limit/offset)
 *
 * Read order:
 *   1. PlatformDashboardController — endpoint definitions
 *   2. BrokerOnboardingService — underlying aggregation logic
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { PlatformOwnerGuard } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../../shared/logger';
import { BrokerOnboardingService } from '../services/broker-onboarding.service';

@ApiTags('platform/dashboard')
@Controller('platform/dashboard')
@UseGuards(JwtAuthGuard, PlatformOwnerGuard)
@ApiBearerAuth('JWT')
export class PlatformDashboardController {
  constructor(
    private readonly onboardingService: BrokerOnboardingService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PlatformDashboardController.name);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide KPIs: broker/user counts, MRR, platform health' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size for broker list (default 200)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (default 0)' })
  @ApiResponse({ status: 200, description: 'Platform stats envelope' })
  async getPlatformStats(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /platform/dashboard/stats', { limit, offset });
    return this.onboardingService.getPlatformStats({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('brokers')
  @ApiOperation({ summary: 'All broker tenants with metrics (paginated)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Paginated broker list with monthlyRevenue, mtdRevenue, clientCount' })
  async listBrokers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /platform/dashboard/brokers', { limit, offset });
    return this.onboardingService.listBrokersWithMetrics({
      limit: limit ? Number(limit) : 10,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Platform-wide revenue by period (monthly for last 12 months)' })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to return (default 12)' })
  @ApiResponse({ status: 200, description: 'Revenue series: [{ month, mrr, newBusiness, churn }]' })
  async getRevenue(@Query('months') months?: string) {
    this.logger.debug('GET /platform/dashboard/revenue', { months });
    return this.onboardingService.getRevenueSeries(months ? Number(months) : 12);
  }
}