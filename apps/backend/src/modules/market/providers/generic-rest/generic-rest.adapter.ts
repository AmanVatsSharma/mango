/**
 * File:        apps/backend/src/modules/market/providers/generic-rest/generic-rest.adapter.ts
 * Module:      market · Data Providers
 * Purpose:     Fallback data provider that POSTs to a generic MARKET_DATA_URL aggregator
 *              (original PriceFeedService polling logic, extracted to an adapter).
 *              Used for any exchange whose dataProviderCode is null or 'GENERIC_REST'.
 *
 * Exports:
 *   - GenericRestDataProviderAdapter — implements DataProviderAdapter; providerCode = 'GENERIC_REST'
 *
 * Depends on:
 *   - data-provider.interface — ProviderQuote, DataProviderAdapter
 *   - shared/logger            — AppLoggerService
 *
 * Side-effects:
 *   - Outbound HTTP POST to MARKET_DATA_URL/quotes:batch (env-configured)
 *
 * Key invariants:
 *   - If MARKET_DATA_URL is not set, fetchQuotes returns [] and logs a warning
 *
 * Read order:
 *   1. fetchQuotes() — main method
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { DataProviderAdapter, ProviderQuote } from '../data-provider.interface';
import { DataProviderRegistry } from '../data-provider.registry';

@Injectable()
export class GenericRestDataProviderAdapter implements DataProviderAdapter, OnModuleInit {
  readonly providerCode = 'GENERIC_REST';

  constructor(
    private readonly logger: AppLoggerService,
    private readonly registry: DataProviderRegistry,
  ) {
    this.logger.setContext(GenericRestDataProviderAdapter.name);
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  async fetchQuotes(instruments: { exchange: string; symbol: string }[]): Promise<ProviderQuote[]> {
    const url = process.env.MARKET_DATA_URL;
    if (!url) {
      this.logger.warn('MARKET_DATA_URL not configured; returning empty quotes');
      return [];
    }

    try {
      const res = await fetch(`${url}/quotes:batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbols: instruments }),
      });
      if (!res.ok) {
        this.logger.warn('GenericRest aggregator non-200', res.statusText);
        return [];
      }
      const raw = (await res.json()) as Array<{
        symbol: string;
        exchange: string;
        price: number;
      }>;
      const ts = Date.now();
      return raw.map((r) => ({
        exchange: r.exchange,
        symbol: r.symbol,
        ltp: r.price,
        open: r.price,
        high: r.price,
        low: r.price,
        close: r.price,
        volume: 0,
        ts,
      }));
    } catch (e) {
      this.logger.error('GenericRest request failed', (e as Error).stack);
      return [];
    }
  }
}
