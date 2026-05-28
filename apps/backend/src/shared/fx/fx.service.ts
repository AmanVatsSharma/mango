/**
 * @file src/shared/fx/fx.service.ts
 * @module shared
 * @description FX conversion service with simple in-memory caching using external market aggregator
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../logger';

type CachedRate = { rate: number; expiresAt: number };

@Injectable()
export class FxService {
  private readonly cache: Map<string, CachedRate> = new Map();
  private readonly ttlMs = 30_000;

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(FxService.name);
  }

  async convert(amount: string, from: string, to: string): Promise<string> {
    if (from === to) return Number(amount).toFixed(8);
    const rate = await this.getRate(from, to);
    const result = Number(amount) * rate;
    return result.toFixed(8);
  }

  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    const key = `${from}:${to}`.toUpperCase();
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.rate;

    const baseUrl = process.env.MARKET_DATA_URL;
    if (!baseUrl) {
      this.logger.warn('MARKET_DATA_URL not configured; returning 1:1 FX');
      return 1;
    }
    try {
      // Expect aggregator to expose GET /fx:rate?from=USD&to=INR returning { from, to, rate }
      const url = `${baseUrl}/fx:rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      this.logger.debug('Fetching FX rate', { from, to, url });
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn('FX aggregator non-200', res.statusText);
        return 1;
      }
      const data = (await res.json()) as { from: string; to: string; rate: number };
      const rate = Number(data.rate) || 1;
      this.cache.set(key, { rate, expiresAt: now + this.ttlMs });
      return rate;
    } catch (e) {
      this.logger.error('FX fetch failed', (e as Error).stack);
      return 1;
    }
  }
}


