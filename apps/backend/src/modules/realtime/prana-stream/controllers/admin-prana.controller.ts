/**
 * @file src/modules/realtime/prana-stream/controllers/admin-prana.controller.ts
 * @module realtime/prana-stream
 * @description Admin endpoints for realtime health and stats
 * @author BharatERP
 * @created 2025-09-24
 */

import { Controller, Get } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { CompositeMarketDataAdapter } from '../adapters/composite-market-data.adapter';
import { SubscriptionRegistryService } from '../services/subscription-registry.service';

@Controller('admin/realtime')
export class AdminPranaController {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly market: CompositeMarketDataAdapter,
    private readonly subs: SubscriptionRegistryService,
  ) {
    this.logger.setContext(AdminPranaController.name);
  }

  @Get('health')
  async health() {
    return {
      status: 'ok',
      marketHealthy: this.market.isHealthy(),
      watchedSymbols: this.subs.getAllWatchedSymbols().length,
      now: new Date().toISOString(),
    };
  }
}


