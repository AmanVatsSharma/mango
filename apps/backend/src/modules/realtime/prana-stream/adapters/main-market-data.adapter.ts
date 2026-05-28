/**
 * @file src/modules/realtime/prana-stream/adapters/main-market-data.adapter.ts
 * @module realtime/prana-stream
 * @description Primary market data adapter (main provider)
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { MarketDataProvider, Tick } from './market-data.provider';

@Injectable()
export class MainMarketDataAdapter implements MarketDataProvider {
  readonly name = 'main';
  private cb?: (ticks: Tick[]) => void;
  private healthy = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly subscriptions: Map<
    string,
    Array<{ exchange: string; symbol: string }>
  > = new Map();
  private readonly latest: Map<string, Tick> = new Map();

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(MainMarketDataAdapter.name);
  }

  async connect(): Promise<void> {
    const url = process.env.MARKET_DATA_URL;
    if (!url) {
      this.healthy = false;
      throw new Error('MARKET_DATA_URL is not configured');
    }
    this.logger.debug('connecting to main provider');
    this.healthy = true;
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.logger.debug('disconnecting from main provider');
    this.healthy = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async subscribeTicks(
    subscriberId: string,
    symbols: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    this.logger.debug('subscribeTicks(main)', { subscriberId, count: symbols.length });
    this.subscriptions.set(subscriberId, symbols);
    await this.pollOnce();
  }

  async unsubscribeTicks(
    subscriberId: string,
    symbols?: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    this.logger.debug('unsubscribeTicks(main)', { subscriberId, count: symbols?.length ?? 'all' });
    if (!symbols) {
      this.subscriptions.delete(subscriberId);
      return;
    }
    const existing = this.subscriptions.get(subscriberId) ?? [];
    const remove = new Set(symbols.map((item) => `${item.exchange}:${item.symbol}`));
    const next = existing.filter(
      (item) => !remove.has(`${item.exchange}:${item.symbol}`),
    );
    this.subscriptions.set(subscriberId, next);
  }

  async getSnapshot(symbols: Array<{ exchange: string; symbol: string }>): Promise<Tick[]> {
    const keys = symbols.map((symbol) => `${symbol.exchange}:${symbol.symbol}`);
    const missing = symbols.filter((symbol) => !this.latest.has(`${symbol.exchange}:${symbol.symbol}`));
    if (missing.length > 0) {
      const fetched = await this.fetchBatch(missing);
      for (const tick of fetched) {
        this.latest.set(`${tick.exchange}:${tick.symbol}`, tick);
      }
    }
    return keys
      .map((key) => this.latest.get(key))
      .filter((tick): tick is Tick => !!tick);
  }

  onTicks(cb: (ticks: Tick[]) => void): void {
    this.cb = cb;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  private startPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.pollOnce().catch((error: unknown) => {
        this.logger.error('main provider poll failed', (error as Error).stack);
      });
    }, 1000);
  }

  private async pollOnce(): Promise<void> {
    if (!this.healthy) return;
    const symbols = this.getAllSubscribedSymbols();
    if (symbols.length === 0) return;
    const ticks = await this.fetchBatch(symbols);
    if (ticks.length === 0) return;
    for (const tick of ticks) {
      this.latest.set(`${tick.exchange}:${tick.symbol}`, tick);
    }
    this.cb?.(ticks);
  }

  private getAllSubscribedSymbols(): Array<{ exchange: string; symbol: string }> {
    const dedup = new Map<string, { exchange: string; symbol: string }>();
    for (const symbols of this.subscriptions.values()) {
      for (const symbol of symbols) {
        dedup.set(`${symbol.exchange}:${symbol.symbol}`, symbol);
      }
    }
    return Array.from(dedup.values());
  }

  private async fetchBatch(
    symbols: Array<{ exchange: string; symbol: string }>,
  ): Promise<Tick[]> {
    const url = process.env.MARKET_DATA_URL;
    const response = await fetch(`${url}/quotes:batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      this.logger.warn('main provider returned non-200', response.statusText);
      return [];
    }
    const rows = (await response.json()) as Tick[];
    const now = Date.now();
    return rows.map((row) => ({
      exchange: row.exchange,
      symbol: row.symbol,
      price: Number(row.price),
      ts: row.ts ?? now,
    }));
  }
}


