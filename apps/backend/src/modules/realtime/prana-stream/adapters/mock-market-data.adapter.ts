/**
 * @file src/modules/realtime/prana-stream/adapters/mock-market-data.adapter.ts
 * @module realtime/prana-stream
 * @description Mock market data adapter generating synthetic ticks for tests/dev
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { MarketDataProvider, Tick } from './market-data.provider';

@Injectable()
export class MockMarketDataAdapter
  implements MarketDataProvider, OnModuleInit, OnModuleDestroy
{
  readonly name = 'mock';
  private cb?: (ticks: Tick[]) => void;
  private healthy = false;
  private timer: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, Array<{ exchange: string; symbol: string }>> = new Map();

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(MockMarketDataAdapter.name);
  }

  onModuleInit(): void {
    this.connect().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async connect(): Promise<void> {
    this.logger.debug('starting mock adapter');
    this.healthy = true;
    this.timer = setInterval(() => this.tick(), 500);
  }

  async disconnect(): Promise<void> {
    this.healthy = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async subscribeTicks(
    subscriberId: string,
    symbols: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    this.subscriptions.set(subscriberId, symbols);
  }

  async unsubscribeTicks(
    subscriberId: string,
    symbols?: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    if (!symbols) {
      this.subscriptions.delete(subscriberId);
      return;
    }
    const existing = this.subscriptions.get(subscriberId) || [];
    const set = new Set(symbols.map((s) => `${s.exchange}:${s.symbol}`));
    this.subscriptions.set(
      subscriberId,
      existing.filter((s) => !set.has(`${s.exchange}:${s.symbol}`)),
    );
  }

  async getSnapshot(symbols: Array<{ exchange: string; symbol: string }>): Promise<Tick[]> {
    const ts = Date.now();
    return symbols.map((s, i) => ({
      exchange: s.exchange,
      symbol: s.symbol,
      price: 100 + ((ts / 1000 + i) % 10),
      ts,
    }));
  }

  onTicks(cb: (ticks: Tick[]) => void): void {
    this.cb = cb;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private tick() {
    if (!this.cb) return;
    const ts = Date.now();
    const out: Tick[] = [];
    for (const symbols of this.subscriptions.values()) {
      for (const s of symbols) {
        out.push({
          exchange: s.exchange,
          symbol: s.symbol,
          price: 100 + ((ts / 1000) % 10),
          ts,
        });
      }
    }
    if (out.length > 0) this.cb(out);
  }
}


