/**
 * File:        apps/backend/src/modules/market/controllers/market-admin.controller.ts
 * Module:      market
 * Purpose:     Platform-admin endpoints for managing market data provider credentials.
 *              Specifically handles Kite Connect daily access-token rotation.
 *
 * Exports:
 *   - MarketAdminController — @Controller('api/v1/admin/market-data')
 *       POST /api/v1/admin/market-data/kite/token — update Kite API key + access token
 *       GET  /api/v1/admin/market-data/providers  — list registered data providers
 *
 * Depends on:
 *   - KiteDataProviderAdapter — updateCredentials()
 *   - DataProviderRegistry   — list registered providers
 *
 * Side-effects:
 *   - Mutates KiteDataProviderAdapter.apiKey / accessToken in memory
 *
 * Key invariants:
 *   - Token updates are in-memory only on the current node; multi-node deployments
 *     should persist the token in Redis and have each node re-read on startup
 *   - These endpoints require admin JWT (add @UseGuards(JwtAuthGuard) + @Roles('admin'))
 *
 * Read order:
 *   1. updateKiteToken() — the critical daily-rotation endpoint
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { KiteDataProviderAdapter } from '../providers/kite/kite-data-provider.adapter';
import { DataProviderRegistry } from '../providers/data-provider.registry';
import { AppLoggerService } from '../../../shared/logger';

class UpdateKiteTokenDto {
  @IsString()
  @MaxLength(128)
  apiKey!: string;

  @IsString()
  @MaxLength(256)
  accessToken!: string;
}

@Controller('api/v1/admin/market-data')
export class MarketAdminController {
  constructor(
    private readonly kiteAdapter: KiteDataProviderAdapter,
    private readonly providerRegistry: DataProviderRegistry,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(MarketAdminController.name);
  }

  @Post('kite/token')
  updateKiteToken(@Body() dto: UpdateKiteTokenDto): { updated: boolean } {
    this.logger.debug('Updating Kite credentials via admin endpoint');
    this.kiteAdapter.updateCredentials(dto.apiKey, dto.accessToken);
    return { updated: true };
  }

  @Get('providers')
  listProviders(): { providers: string[] } {
    return { providers: this.providerRegistry.codes() };
  }
}
