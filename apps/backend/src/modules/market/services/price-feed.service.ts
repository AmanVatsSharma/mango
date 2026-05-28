/**
 * File:        apps/backend/src/modules/market/services/price-feed.service.ts
 * Module:      market
 * Purpose:     Exchange-aware price feed — routes quote requests to the correct
 *              DataProviderAdapter based on each exchange's dataProviderCode, then
 *              broadcasts normalized Quote objects to all subscribers.
 *
 * Exports:
 *   - PriceFeedService          — injectable service
 *   - PriceFeedService.subscribe()    — register subscriber for a list of instruments
 *   - PriceFeedService.unsubscribe()  — remove subscriber
 *   - PriceFeedService.getSnapshot()  — read latest cached quotes
 *   - PriceFeedService.onQuotes$()    — Observable stream of batched quote updates
 *
 * Depends on:
 *   - DataProviderRegistry     — resolves provider by code
 *   - InstrumentsService       — looks up exchange code for an instrument to find provider
 *   - ExchangeEntity repo      — loads dataProviderCode per exchange
 *
 * Side-effects:
 *   - setInterval-based 1 Hz polling loop (started on module init, cleared on destroy)
 *   - Outbound HTTP per registered data provider
 *
 * Key invariants:
 *   - Instruments with no matched exchange fall back to GENERIC_REST provider
 *   - Provider errors are logged but do not crash the polling loop
 *   - Quote keys are always 'EXCHANGE:SYMBOL' (uppercase)
 *
 * Read order:
 *   1. pollOnce()   — core dispatch loop
 *   2. subscribe()  — how callers register
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import { AppLoggerService } from '../../../shared/logger';
import { DataProviderRegistry } from '../providers/data-provider.registry';
import { ExchangeEntity } from '../entities/exchange.entity';

export type Quote = {
  symbol: string;
  exchange: string;
  price: number;
  ts: number;
};

@Injectable()
export class PriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly subscribers: Map<string, Set<string>> = new Map();
  private readonly latestQuotes: Map<string, Quote> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private readonly quotesSubject: Subject<Quote[]> = new Subject<Quote[]>();

  constructor(
    private readonly logger: AppLoggerService,
    private readonly providerRegistry: DataProviderRegistry,
    @InjectRepository(ExchangeEntity)
    private readonly exchangeRepo: Repository<ExchangeEntity>,
  ) {
    this.logger.setContext(PriceFeedService.name);
  }

  onModuleInit(): void {
    this.logger.debug('Starting exchange-aware price feed polling loop');
    this.timer = setInterval(
      () => this.pollOnce().catch((e) => this.logger.error('pollOnce failed', (e as Error).stack)),
      1000,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(subscriberId: string, instruments: Array<{ exchange: string; symbol: string }>): void {
    this.logger.debug('subscribe', { subscriberId, count: instruments.length });
    for (const { exchange, symbol } of instruments) {
      const key = `${exchange}:${symbol}`;
      if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
      this.subscribers.get(key).add(subscriberId);
    }
  }

  unsubscribe(subscriberId: string, instruments?: Array<{ exchange: string; symbol: string }>): void {
    this.logger.debug('unsubscribe', { subscriberId, count: instruments?.length ?? 'all' });
    if (!instruments) {
      for (const set of this.subscribers.values()) set.delete(subscriberId);
      return;
    }
    for (const { exchange, symbol } of instruments) {
      const set = this.subscribers.get(`${exchange}:${symbol}`);
      if (set) set.delete(subscriberId);
    }
  }

  getSnapshot(symbols: Array<{ exchange: string; symbol: string }>): Quote[] {
    return symbols
      .map(({ exchange, symbol }) => this.latestQuotes.get(`${exchange}:${symbol}`))
      .filter((q): q is Quote => !!q);
  }

  onQuotes$(): Observable<Quote[]> {
    return this.quotesSubject.asObservable();
  }

  private async pollOnce(): Promise<void> {
    const allKeys = Array.from(this.subscribers.keys());
    if (allKeys.length === 0) return;

    const instruments = allKeys.slice(0, 1000).map((k) => {
      const [exchange, ...symbolParts] = k.split(':');
      return { exchange, symbol: symbolParts.join(':') };
    });

    // Group instruments by their exchange's dataProviderCode
    const exchanges = await this.exchangeRepo.find();
    const providerMap = new Map<string, string>(); // exchangeCode → providerCode
    for (const ex of exchanges) {
      providerMap.set(ex.code, ex.dataProviderCode ?? 'GENERIC_REST');
    }

    const byProvider = new Map<string, Array<{ exchange: string; symbol: string }>>();
    for (const inst of instruments) {
      const providerCode = providerMap.get(inst.exchange) ?? 'GENERIC_REST';
      if (!byProvider.has(providerCode)) byProvider.set(providerCode, []);
      byProvider.get(providerCode).push(inst);
    }

    const allQuotes: Quote[] = [];
    for (const [providerCode, batch] of byProvider.entries()) {
      const adapter = this.providerRegistry.resolve(providerCode);
      if (!adapter) {
        this.logger.warn('No adapter registered for provider', { providerCode });
        continue;
      }
      const providerQuotes = await adapter.fetchQuotes(batch);
      for (const q of providerQuotes) {
        const quote: Quote = { symbol: q.symbol, exchange: q.exchange, price: q.ltp, ts: q.ts };
        this.latestQuotes.set(`${q.exchange}:${q.symbol}`, quote);
        allQuotes.push(quote);
      }
    }

    if (allQuotes.length > 0) {
      this.quotesSubject.next(allQuotes);
    }
  }
}
