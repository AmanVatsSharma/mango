/**
 * File:        apps/backend/src/modules/market/providers/kite/kite-data-provider.adapter.ts
 * Module:      market · Data Providers
 * Purpose:     Kite Connect (Zerodha) data provider for NSE, BSE, and MCX market data.
 *              Polls the Kite REST /quote endpoint for LTP + OHLC + volume.
 *
 * Exports:
 *   - KiteDataProviderAdapter — implements DataProviderAdapter; providerCode = 'KITE'
 *
 * Depends on:
 *   - data-provider.interface   — ProviderQuote, DataProviderAdapter
 *   - data-provider.registry    — DataProviderRegistry (self-registers on init)
 *   - shared/logger             — AppLoggerService
 *
 * Side-effects:
 *   - Outbound HTTPS GET to https://api.kite.trade/quote
 *
 * Key invariants:
 *   - KITE_API_KEY + KITE_ACCESS_TOKEN must be set in env; missing = warn + return []
 *   - Kite access tokens expire daily at midnight IST; use the platform admin token-refresh
 *     endpoint POST /api/v1/admin/market-data/kite/token to update after daily re-login
 *   - Kite instrument format: EXCHANGE:TRADINGSYMBOL (e.g. NSE:INFY, MCX:CRUDEOIL23DECFUT)
 *   - Max 500 instruments per /quote call; batched automatically
 *
 * Read order:
 *   1. fetchQuotes()    — main polling path
 *   2. buildAuthHeader() — credential composition
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { DataProviderAdapter, ProviderQuote } from '../data-provider.interface';
import { DataProviderRegistry } from '../data-provider.registry';

const KITE_BASE = 'https://api.kite.trade';
const MAX_INSTRUMENTS_PER_CALL = 500;

type KiteQuoteRaw = {
  last_price: number;
  ohlc: { open: number; high: number; low: number; close: number };
  volume: number;
};

@Injectable()
export class KiteDataProviderAdapter implements DataProviderAdapter, OnModuleInit {
  readonly providerCode = 'KITE';

  // Runtime-mutable credentials; initialized from env, updatable via updateCredentials()
  private apiKey: string | null = null;
  private accessToken: string | null = null;

  constructor(
    private readonly logger: AppLoggerService,
    private readonly registry: DataProviderRegistry,
  ) {
    this.logger.setContext(KiteDataProviderAdapter.name);
  }

  onModuleInit(): void {
    this.apiKey = process.env.KITE_API_KEY ?? null;
    this.accessToken = process.env.KITE_ACCESS_TOKEN ?? null;
    this.registry.register(this);
  }

  /** Called by admin token-refresh endpoint after daily Kite re-login. */
  updateCredentials(apiKey: string, accessToken: string): void {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.logger.debug('Kite credentials updated');
  }

  async fetchQuotes(instruments: { exchange: string; symbol: string }[]): Promise<ProviderQuote[]> {
    const authHeader = this.buildAuthHeader();
    if (!authHeader) return [];

    const results: ProviderQuote[] = [];

    // Batch into chunks of MAX_INSTRUMENTS_PER_CALL
    for (let offset = 0; offset < instruments.length; offset += MAX_INSTRUMENTS_PER_CALL) {
      const batch = instruments.slice(offset, offset + MAX_INSTRUMENTS_PER_CALL);
      const params = batch.map((i) => `i=${i.exchange}:${i.symbol}`).join('&');
      const url = `${KITE_BASE}/quote?${params}`;

      try {
        const res = await fetch(url, {
          headers: { Authorization: authHeader, 'X-Kite-Version': '3' },
        });
        if (!res.ok) {
          this.logger.warn('Kite /quote non-200', { status: res.status, statusText: res.statusText });
          continue;
        }
        const body = (await res.json()) as { status: string; data: Record<string, KiteQuoteRaw> };
        const ts = Date.now();
        for (const [key, q] of Object.entries(body.data ?? {})) {
          const [exchange, ...symbolParts] = key.split(':');
          results.push({
            exchange,
            symbol: symbolParts.join(':'),
            ltp: q.last_price,
            open: q.ohlc.open,
            high: q.ohlc.high,
            low: q.ohlc.low,
            close: q.ohlc.close,
            volume: q.volume,
            ts,
          });
        }
      } catch (e) {
        this.logger.error('Kite /quote request failed', (e as Error).stack);
      }
    }

    return results;
  }

  private buildAuthHeader(): string | null {
    if (!this.apiKey || !this.accessToken) {
      this.logger.warn('KITE_API_KEY or KITE_ACCESS_TOKEN not set; skipping Kite quotes');
      return null;
    }
    return `token ${this.apiKey}:${this.accessToken}`;
  }
}
