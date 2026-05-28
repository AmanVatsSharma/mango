/**
 * @file src/modules/realtime/prana-stream/adapters/composite-market-data.adapter.ts
 * @module realtime/prana-stream
 * @description Composite adapter: prefer main, fallback to vortex; mock is always connected for tests
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { MarketDataProvider, Tick } from './market-data.provider';
import { MainMarketDataAdapter } from './main-market-data.adapter';
import { VortexMarketDataAdapter } from './vortex-market-data.adapter';
import { MockMarketDataAdapter } from './mock-market-data.adapter';

@Injectable()
export class CompositeMarketDataAdapter implements MarketDataProvider {
  readonly name = 'composite';
  private current: MarketDataProvider;
  private cb?: (ticks: Tick[]) => void;

  constructor(
    private readonly logger: AppLoggerService,
    private readonly main: MainMarketDataAdapter,
    private readonly vortex: VortexMarketDataAdapter,
    private readonly mock: MockMarketDataAdapter,
  ) {
    this.logger.setContext(CompositeMarketDataAdapter.name);
    this.current = this.main;
    this.main.onTicks((t) => this.forward(t, 'main'));
    this.vortex.onTicks((t) => this.forward(t, 'vortex'));
    this.mock.onTicks((t) => this.forward(t, 'mock'));
  }

  private forward(ticks: Tick[], source: string) {
    if (this.cb) this.cb(ticks);
  }

  async connect(): Promise<void> {
    try {
      await this.main.connect();
      this.current = this.main;
      this.logger.debug('connected to main provider');
    } catch (e) {
      this.logger.warn('main connect failed; falling back to vortex');
      await this.vortex.connect();
      this.current = this.vortex;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.current.disconnect();
    } catch (_) {}
  }

  async subscribeTicks(
    subscriberId: string,
    symbols: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    if (!this.current.isHealthy()) await this.connect();
    await this.current.subscribeTicks(subscriberId, symbols);
    // Also feed mock in dev for demos
    if (process.env.NODE_ENV !== 'production') {
      await this.mock.subscribeTicks(subscriberId, symbols);
    }
  }

  async unsubscribeTicks(
    subscriberId: string,
    symbols?: Array<{ exchange: string; symbol: string }>,
  ): Promise<void> {
    await this.current.unsubscribeTicks(subscriberId, symbols);
    if (process.env.NODE_ENV !== 'production') {
      await this.mock.unsubscribeTicks(subscriberId, symbols);
    }
  }

  async getSnapshot(symbols: Array<{ exchange: string; symbol: string }>): Promise<Tick[]> {
    if (!this.current.isHealthy()) await this.connect();
    return this.current.getSnapshot(symbols);
  }

  onTicks(cb: (ticks: Tick[]) => void): void {
    this.cb = cb;
  }

  isHealthy(): boolean {
    return this.current.isHealthy();
  }
}


